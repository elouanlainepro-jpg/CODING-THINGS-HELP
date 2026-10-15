#!/usr/bin/env python3
"""Analyse des clips : durée, cadence, résolution, moment de l'impact et cadrage vertical.

Le moment de l'impact est estimé automatiquement (pic de mouvement dans l'image) ;
on peut toujours le forcer dans edit.json avec "impact": 1.8.

Usage : python3 scripts/analyze_clips.py clip1.mp4 clip2.mp4 -o clips.json --sheet impacts.jpg
"""
import argparse
import json
import subprocess
import sys

import numpy as np

AW, AH, AFPS = 192, 108, 60  # résolution / cadence d'analyse (petite image = rapide)


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate,duration:format=duration", "-of", "json", path],
        capture_output=True, text=True, check=True,
    ).stdout
    info = json.loads(out)
    st = info["streams"][0]
    num, den = st.get("r_frame_rate", "30/1").split("/")
    fps = float(num) / float(den or 1)
    dur = float(st.get("duration") or info["format"]["duration"])
    return {"width": int(st["width"]), "height": int(st["height"]), "fps": round(fps, 3), "duration": round(dur, 3)}


def motion(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf",
         f"fps={AFPS},scale={AW}:{AH}:force_original_aspect_ratio=disable,format=gray",
         "-f", "rawvideo", "-"],
        capture_output=True, check=True,
    ).stdout
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, AH, AW).astype(np.float32)
    if len(frames) < 3:
        return None, None
    diff = np.abs(np.diff(frames, axis=0))  # (n-1, AH, AW)
    return frames, diff


def smooth(x, n=5):
    k = np.ones(n) / n
    return np.convolve(x, k, mode="same")


def estimate(path, meta):
    frames, diff = motion(path)
    dur = meta["duration"]
    if diff is None:
        return dur / 2, 0.5, 0.0
    # Mouvement local : on retire le mouvement moyen de chaque image (panoramique caméra).
    per_frame = diff.reshape(len(diff), -1)
    energy = per_frame.mean(axis=1)
    local = np.abs(per_frame - np.median(per_frame, axis=1, keepdims=True)).mean(axis=1)
    raw = 0.4 * energy / (energy.max() + 1e-6) + 0.6 * local / (local.max() + 1e-6)
    score = smooth(raw, 3)
    t = (np.arange(len(score)) + 1) / AFPS
    lo, hi = 0.18 * dur, 0.88 * dur
    window = (t >= lo) & (t <= hi)
    if not window.any():
        window = np.ones_like(score, dtype=bool)
    peak = int(np.argmax(np.where(window, score, -1)))
    # Le choc, c'est le début de l'explosion de mouvement, pas son maximum :
    # on remonte jusqu'à la plus forte hausse dans les 0,5 s qui précèdent le pic.
    rise = np.diff(raw, prepend=raw[0])  # non lissé : précis à l'image près
    a = max(0, peak - AFPS // 2)
    idx = a + int(np.argmax(rise[a:peak + 1]))
    # diff[i] compare les images i et i+1 : la nouvelle image du choc est la i+1.
    impact = float(t[idx])
    confidence = float((score[idx] - np.median(score)) / (score.max() + 1e-6))
    # Cadrage : centre horizontal du mouvement autour de l'impact.
    a, b = max(0, idx - AFPS // 3), min(len(diff), idx + AFPS // 3)
    cols = diff[a:b].sum(axis=(0, 1))
    cols = cols - np.median(cols)
    cols[cols < 0] = 0
    if cols.sum() > 0:
        cx = float((cols * np.arange(AW)).sum() / cols.sum() / (AW - 1))
    else:
        cx = 0.5
    focus = float(np.clip(0.75 * cx + 0.25 * 0.5, 0.15, 0.85))
    return round(impact, 3), round(focus, 3), round(confidence, 3)


def contact_sheet(results, out):
    from PIL import Image, ImageDraw
    thumbs = []
    for r in results:
        png = subprocess.run(
            ["ffmpeg", "-v", "error", "-ss", str(r["impact"]), "-i", r["file"], "-frames:v", "1",
             "-vf", "scale=360:-2", "-f", "image2pipe", "-vcodec", "png", "-"],
            capture_output=True, check=True,
        ).stdout
        from io import BytesIO
        im = Image.open(BytesIO(png)).convert("RGB")
        d = ImageDraw.Draw(im)
        x = int(r["focus"] * (im.width - 1))
        d.line([(x, 0), (x, im.height)], fill=(255, 60, 40), width=2)
        d.rectangle([0, 0, im.width, 18], fill=(0, 0, 0))
        d.text((4, 3), f"{r['name']}  impact {r['impact']:.2f}s", fill=(255, 255, 255))
        thumbs.append(im)
    if not thumbs:
        return
    cols = 3
    w, h = thumbs[0].width, max(t.height for t in thumbs)
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * h), (20, 20, 20))
    for i, im in enumerate(thumbs):
        sheet.paste(im, ((i % cols) * w, (i // cols) * h))
    sheet.save(out, quality=88)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("clips", nargs="+")
    ap.add_argument("-o", "--out")
    ap.add_argument("--sheet", help="planche JPG des images d'impact (pour vérifier)")
    args = ap.parse_args()
    results = []
    for path in args.clips:
        meta = probe(path)
        impact, focus, conf = estimate(path, meta)
        results.append({"file": path, "name": path.rsplit("/", 1)[-1], **meta,
                        "impact": impact, "focus": focus, "confidence": conf})
        print(f"🎬 {path.rsplit('/', 1)[-1]} · {meta['duration']:.2f} s · {meta['fps']:.0f} i/s · impact ≈ {impact:.2f} s",
              file=sys.stderr)
    if args.sheet:
        contact_sheet(results, args.sheet)
    text = json.dumps(results, indent=1)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text)
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    main()
