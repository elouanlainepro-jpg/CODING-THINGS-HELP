#!/usr/bin/env python3
"""MEME PRODUCTION - fabrique un meme vertical 1080x1920.

Format : fond noir, bande blanche avec texte en haut, clips A puis B (puis C...)
recadres en 5:4 juste en dessous, noir en bas. Tout est regle dans config.json.

Exemples :
  python scripts/meme.py --text "POV: Me at 6 AM" --a inbox/a.mp4 --b bibliotheque/reactions/choc.mp4
  python scripts/meme.py --text "..." --a inbox/a.mp4 --a-start 3 --a-dur 4 --b x.mp4 --b-dur 2 --music templates/beat.mp3
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent


def load_config():
    return json.loads((ROOT / "config.json").read_text(encoding="utf-8"))


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def load_font(path, size, weight):
    font_path = Path(path)
    if not font_path.is_absolute():
        font_path = ROOT / font_path
    font = ImageFont.truetype(str(font_path), size)
    if weight:  # police variable (ex. Montserrat-Variable.ttf)
        try:
            font.set_variation_by_axes([weight])
        except Exception:
            pass
    return font


def wrap(draw, text, font, max_width):
    lines = []
    for paragraph in text.split("\n"):
        current = ""
        for word in paragraph.split():
            trial = f"{current} {word}".strip()
            if draw.textlength(trial, font=font) <= max_width or not current:
                current = trial
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def balance(draw, lines, font, max_width):
    """Equilibre les lignes (evite un mot seul sur la derniere ligne)."""
    if len(lines) < 2:
        return lines
    words = " ".join(lines).split()
    n = len(lines)
    lo, hi = max_width // n, max_width
    best = lines
    while hi - lo > 4:
        mid = (lo + hi) // 2
        candidate = wrap(draw, " ".join(words), font, mid)
        if len(candidate) <= n:
            best, hi = candidate, mid
        else:
            lo = mid
    return best


def render_band(text, cfg, out_png):
    band, canvas = cfg["band"], cfg["canvas"]
    width, height = canvas["width"], band["height"]
    image = Image.new("RGB", (width, height), hex_rgb(band["color"]))
    draw = ImageDraw.Draw(image)
    if band.get("uppercase"):
        text = text.upper()
    max_width = width - 2 * band["padding_x"]
    max_height = height - 80

    size = band["max_font_size"]
    while True:
        font = load_font(band["font"], size, band.get("font_weight"))
        lines = wrap(draw, text, font, max_width)
        pitch = int(size * band["line_spacing"])
        fits = len(lines) <= band["max_lines"] and pitch * len(lines) <= max_height
        if fits or size <= band["min_font_size"]:
            break
        size -= 2
    lines = balance(draw, lines, font, max_width)

    total = pitch * (len(lines) - 1) + size
    y = (height - total) / 2 + band.get("offset_y", 0)
    for line in lines:
        w = draw.textlength(line, font=font)
        draw.text(((width - w) / 2, y + size / 2), line, font=font,
                  fill=hex_rgb(band["text_color"]), anchor="lm")
        y += pitch
    image.save(out_png)
    return size, len(lines)


def has_audio(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
         "stream=codec_type", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True)
    return "audio" in out.stdout


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
         "csv=p=0", str(path)], capture_output=True, text=True)
    return float(out.stdout.strip())


def slug(text):
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return s[:40] or "meme"


def build(args):
    cfg = load_config()
    canvas, band, clip = cfg["canvas"], cfg["band"], cfg["clip"]
    W, H, FPS = canvas["width"], canvas["height"], cfg["fps"]

    segments = []  # (path, start, dur)
    for key in ("a", "b", "c", "d"):
        path = getattr(args, key)
        if not path:
            continue
        start = getattr(args, f"{key}_start") or 0.0
        dur = getattr(args, f"{key}_dur")
        if dur is None:
            dur = min(duration(path) - start, cfg["default_clip_seconds"])
        segments.append((path, start, dur))
    if not segments:
        sys.exit("Donne au moins un clip : --a chemin.mp4")

    out = Path(args.out) if args.out else ROOT / "sortie" / f"{slug(args.text)}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        band_png = Path(tmp) / "band.png"
        size, n_lines = render_band(args.text, cfg, band_png)
        print(f"Bande : {n_lines} ligne(s), police {size}px")

        cmd = ["ffmpeg", "-y", "-v", "error", "-stats"]
        for path, start, dur in segments:
            cmd += ["-ss", f"{start}", "-t", f"{dur}", "-i", str(path)]
        cmd += ["-i", str(band_png)]
        band_idx = len(segments)
        music_idx = None
        if args.music:
            cmd += ["-stream_loop", "-1", "-i", str(args.music)]
            music_idx = band_idx + 1

        filters, concat_in = [], ""
        for i, (path, _, dur) in enumerate(segments):
            filters.append(
                f"[{i}:v]scale={W}:{clip['height']}:force_original_aspect_ratio=increase,"
                f"crop={W}:{clip['height']},setsar=1,fps={FPS},format=yuv420p[v{i}]")
            if has_audio(path) and not args.mute:
                filters.append(
                    f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,"
                    f"atrim=0:{dur},asetpts=N/SR/TB[a{i}]")
            else:
                filters.append(
                    f"anullsrc=r=48000:cl=stereo,atrim=0:{dur},asetpts=N/SR/TB[a{i}]")
            concat_in += f"[v{i}][a{i}]"
        filters.append(f"{concat_in}concat=n={len(segments)}:v=1:a=1[vc][ac]")
        filters.append(
            f"[vc]pad={W}:{H}:0:{clip['top']}:{canvas['background']}[pad];"
            f"[pad][{band_idx}:v]overlay=0:{band['top']}[vout]")
        if music_idx is not None:
            filters.append(
                f"[{music_idx}:a]volume={cfg['music_volume'] if args.music_volume is None else args.music_volume}[m];"
                f"[ac][m]amix=inputs=2:duration=first:normalize=0[aout]")
            audio_map = "[aout]"
        else:
            audio_map = "[ac]"

        cmd += ["-filter_complex", ";".join(filters), "-map", "[vout]", "-map", audio_map,
                "-c:v", "libx264", "-preset", "medium", "-crf", str(cfg["crf"]),
                "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart", str(out)]
        subprocess.run(cmd, check=True)
    print(f"OK -> {out}")
    return out


def main():
    p = argparse.ArgumentParser(description="MEME PRODUCTION - montage d'un meme 9:16")
    p.add_argument("--text", required=True, help="Texte de la bande blanche")
    for key in ("a", "b", "c", "d"):
        p.add_argument(f"--{key}", help=f"Clip {key.upper()}")
        p.add_argument(f"--{key}-start", type=float, help=f"Debut dans le clip {key.upper()} (s)")
        p.add_argument(f"--{key}-dur", type=float, help=f"Duree retenue du clip {key.upper()} (s)")
    p.add_argument("--music", help="Musique de fond (optionnel)")
    p.add_argument("--music-volume", type=float, help="Volume de la musique (0-1)")
    p.add_argument("--mute", action="store_true", help="Couper le son des clips")
    p.add_argument("--out", help="Fichier de sortie (defaut: sortie/<texte>.mp4)")
    build(p.parse_args())


if __name__ == "__main__":
    main()
