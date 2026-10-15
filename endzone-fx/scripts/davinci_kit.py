#!/usr/bin/env python3
"""Fabrique le kit DaVinci Resolve d'un edit (appelé par « npm run davinci »).

Contenu du dossier davinci/<edit>/ :
  segments/       un fichier vidéo par plan, déjà coupé sur les beats, vertical, ralentis inclus
  music.wav       le passage exact de la musique (fondu de fin compris)
  sfx/            les bruitages placés dans la timeline
  graphics.mov    titres, logo, outro, flashs sur fond transparent (ProRes 4444)
  timeline.xml    la timeline à importer (Fichier > Importer > Timeline)
  timeline.otio   la même timeline au format OpenTimelineIO (DaVinci 18.5+)
  markers.edl     marqueurs : beats, coupes, impacts, drop (Timelines > Import > Timeline Markers from EDL)
  PLAN.md         liste des plans et des effets conseillés, avec les clips d'origine

Usage : python3 scripts/davinci_kit.py build/<edit> davinci/<edit> [--graphics x.mov] [--smooth] [--full-frame]
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import opentimelineio as otio

RT = otio.opentime.RationalTime
TR = otio.opentime.TimeRange
TC_START_HOURS = 1  # DaVinci démarre ses timelines à 01:00:00:00

# Priorité et couleur des marqueurs (couleurs reconnues par DaVinci Resolve).
MARKERS = {
    "drop": (0, "Red"),
    "impact": (1, "Yellow"),
    "cut": (2, "Green"),
    "freeze": (3, "Purple"),
    "outro": (4, "Cream"),
    "bar": (5, "Sky"),
    "beat": (6, "Blue"),
}


OTIO_COLORS = {
    "Red": otio.schema.MarkerColor.RED,
    "Yellow": otio.schema.MarkerColor.YELLOW,
    "Green": otio.schema.MarkerColor.GREEN,
    "Purple": otio.schema.MarkerColor.PURPLE,
    "Cream": otio.schema.MarkerColor.WHITE,
    "Sky": otio.schema.MarkerColor.CYAN,
    "Blue": otio.schema.MarkerColor.BLUE,
}


def ffmpeg(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def probe_duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def tc(frames, fps):
    frames += TC_START_HOURS * 3600 * fps
    f = frames % fps
    s = frames // fps
    return f"{s // 3600:02d}:{s // 60 % 60:02d}:{s % 60:02d}:{f:02d}"


def frame_filter(kit, focus, full_frame):
    w, h = kit["width"], kit["height"]
    if full_frame:
        return f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2"
    # Recadrage « cover » centré sur l'action (comme dans le rendu HyperFrames).
    return (f"scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h}:(iw-{w})*{focus:.4f}:(ih-{h})/2,setsar=1")


ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", "-an"]


def frames_between(a, b, fps):
    # Arrondi cumulé : les plans et morceaux s'enchaînent sans trou ni image en trop.
    return round(b * fps) - round(a * fps)


def render_piece(kit, shot, j, piece, out, full_frame, smooth):
    fps = kit["fps"]
    n = max(1, frames_between(piece["start"], piece["start"] + piece["dur"], fps))
    crop = frame_filter(kit, shot["focus"], full_frame)
    if piece["kind"] == "freeze":
        img = kit["freezes"][f"{shot['index']}-{j}"]
        ffmpeg(["-loop", "1", "-framerate", str(fps), "-i", img, "-vf", f"{crop},format=yuv420p",
                "-frames:v", str(n), "-r", str(fps), *ENC, str(out)])
        return
    src = kit["clips"][shot["clipIndex"]]
    rate = piece["rate"]
    # Le plan prévoit une marge d'un quart d'image (pour HyperFrames) : ffmpeg, lui, garde
    # la première image APRÈS le point de départ, on recule donc d'une demi-image source.
    start = max(0.0, piece["mediaStart"] - 0.5 / kit["clipFps"][shot["clipIndex"]])
    length = rate * piece["dur"] + 0.1
    chain = [f"trim=start={start:.5f}:end={start + length:.5f}", f"setpts=(PTS-STARTPTS)/{rate:.5f}"]
    if smooth and rate < 0.7:
        # Ralenti lissé : images intermédiaires calculées (plus fluide, plus long à fabriquer).
        chain.append(f"minterpolate=fps={fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
    chain += [f"fps={fps}", crop, "tpad=stop_mode=clone:stop_duration=1", "format=yuv420p"]
    ffmpeg(["-i", src, "-vf", ",".join(chain), "-frames:v", str(n), "-r", str(fps), *ENC, str(out)])


def build_segments(kit, plan, out_dir, full_frame, smooth):
    seg_dir = out_dir / "segments"
    tmp = out_dir / ".tmp"
    seg_dir.mkdir(parents=True, exist_ok=True)
    tmp.mkdir(exist_ok=True)
    segments = []
    for shot in plan["shots"]:
        parts = []
        for j, piece in enumerate(shot["pieces"]):
            p = tmp / f"s{shot['index']:02d}_{j}.mp4"
            render_piece(kit, shot, j, piece, p, full_frame, smooth)
            parts.append(p)
        name = f"S{shot['index'] + 1:02d}_{Path(shot['clip']).stem}.mp4"
        listing = tmp / f"s{shot['index']:02d}.txt"
        listing.write_text("".join(f"file '{p.resolve().as_posix()}'\n" for p in parts))
        ffmpeg(["-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", "-movflags", "+faststart", str(seg_dir / name)])
        frames = frames_between(shot["start"], shot["end"], kit["fps"])
        segments.append({"shot": shot, "file": seg_dir / name, "frames": frames})
        print(f"  🎞️  {name} ({shot['end'] - shot['start']:.2f} s)", file=sys.stderr)
    shutil.rmtree(tmp, ignore_errors=True)
    return segments


def build_markers(plan, fps):
    events = {}

    def add(t, kind, label):
        f = round(t * fps)
        events.setdefault(f, []).append((MARKERS[kind][0], kind, label))

    for i, b in enumerate(plan["beats"]):
        add(b, "beat", f"beat {i + 1}")
    if plan.get("drop") is not None:
        beats = plan["beats"]
        k = min(range(len(beats)), key=lambda i: abs(beats[i] - plan["drop"]))
        for i, b in enumerate(beats):
            if (i - k) % 4 == 0:
                add(b, "bar", "mesure")
        add(plan["drop"], "drop", "DROP")
    for s in plan["shots"]:
        n = s["index"] + 1
        if not s["continuing"]:
            add(s["start"], "cut", f"CUT {n} {Path(s['clip']).stem}")
        add(s["accent"], "impact", f"IMPACT {n}")
        if s.get("freeze"):
            add(s["freeze"]["start"], "freeze", "FREEZE")
    if plan.get("outro"):
        add(plan["outro"]["start"], "outro", "OUTRO")
    markers = []
    for f in sorted(events):
        items = sorted(events[f])
        kind = items[0][1]
        labels = [l for _, k, l in items if k not in ("beat", "bar") or len(items) == 1]
        markers.append({"frame": f, "kind": kind, "color": MARKERS[kind][1], "name": " + ".join(labels)})
    return markers


def write_marker_edl(markers, fps, path, title):
    lines = [f"TITLE: {title}", "FCM: NON-DROP FRAME", ""]
    for i, m in enumerate(markers, start=1):
        a, b = tc(m["frame"], fps), tc(m["frame"] + 1, fps)
        lines.append(f"{i:03d}  001      V     C        {a} {b} {a} {b}  ")
        # Pas de caractères spéciaux : DaVinci les accepte mal dans les noms de marqueurs.
        name = "".join(c for c in m["name"] if c.isalnum() or c in " +-_")
        lines.append(f" |C:Resolve{m['color']} |M:{name} |D:1")
        lines.append("")
    path.write_text("\r\n".join(lines))


def ext_ref(path, frames, fps):
    return otio.schema.ExternalReference(target_url=Path(path).resolve().as_uri(),
                                         available_range=TR(RT(0, fps), RT(frames, fps)))


def build_timeline(kit, plan, segments, music, sfx, graphics, markers, title):
    fps = kit["fps"]
    D = round(plan["duration"] * fps)
    tl = otio.schema.Timeline(name=title, global_start_time=RT(TC_START_HOURS * 3600 * fps, fps))
    tl.metadata["fcp_xml"] = {"media": {"video": {"format": {"samplecharacteristics": {
        "width": str(kit["width"]), "height": str(kit["height"]), "pixelaspectratio": "square",
        "rate": {"timebase": str(fps), "ntsc": "FALSE"}}}}}}
    v1 = otio.schema.Track(name="V1 clips", kind=otio.schema.TrackKind.Video)
    for seg in segments:
        v1.append(otio.schema.Clip(name=seg["file"].stem, media_reference=ext_ref(seg["file"], seg["frames"], fps),
                                   source_range=TR(RT(0, fps), RT(seg["frames"], fps))))
    tl.tracks.append(v1)
    if graphics:
        v2 = otio.schema.Track(name="V2 titres logo", kind=otio.schema.TrackKind.Video)
        v2.append(otio.schema.Clip(name="graphics", media_reference=ext_ref(graphics, D, fps), source_range=TR(RT(0, fps), RT(D, fps))))
        tl.tracks.append(v2)
    a1 = otio.schema.Track(name="A1 musique", kind=otio.schema.TrackKind.Audio)
    a1.append(otio.schema.Clip(name="music", media_reference=ext_ref(music, D, fps), source_range=TR(RT(0, fps), RT(D, fps))))
    tl.tracks.append(a1)
    # Bruitages : une piste par superposition.
    lanes = []
    for x in sorted(sfx, key=lambda x: x["start"]):
        start, dur = round(x["start"] * fps), max(1, round(x["dur"] * fps))
        lane = next((l for l in lanes if l["end"] <= start), None)
        if lane is None:
            lane = {"end": 0, "track": otio.schema.Track(name=f"A{len(lanes) + 2} bruitages", kind=otio.schema.TrackKind.Audio)}
            lanes.append(lane)
        if start > lane["end"]:
            lane["track"].append(otio.schema.Gap(source_range=TR(RT(0, fps), RT(start - lane["end"], fps))))
        total = round(x["fileDur"] * fps)
        lane["track"].append(otio.schema.Clip(name=Path(x["file"]).stem, media_reference=ext_ref(x["file"], total, fps),
                                              source_range=TR(RT(round(x["mediaStart"] * fps), fps), RT(dur, fps))))
        lane["end"] = start + dur
    for lane in lanes:
        tl.tracks.append(lane["track"])
    for m in markers:
        if m["kind"] in ("beat", "bar"):
            continue  # les beats passent par markers.edl (sinon la timeline est illisible)
        color = OTIO_COLORS.get(m["color"], otio.schema.MarkerColor.RED)
        tl.tracks.markers.append(otio.schema.Marker(name=m["name"], marked_range=TR(RT(m["frame"], fps), RT(1, fps)), color=color))
    return tl


def write_plan_md(kit, plan, segments, markers, path, title):
    fps = kit["fps"]
    rows = []
    for seg in segments:
        s = seg["shot"]
        fx = s["fx"]
        tips = []
        if s["continuing"]:
            tips.append("suite du plan précédent (impact sur le drop)")
        if fx.get("enter") and fx["enter"] != "none" and not s["continuing"]:
            tips.append({"zoomblur": "entrée zoom-flou", "whip": "entrée whip", "fade": "ouverture au noir"}.get(fx["enter"], fx["enter"]))
        if fx.get("flash"):
            tips.append(f"flash {int(fx['flash'] * 100)} %")
        if fx.get("punch"):
            tips.append(f"zoom punch {int(fx['punch'] * 100)} %")
        if fx.get("shake"):
            tips.append(f"shake {fx['shake']} px")
        if fx.get("rgb"):
            tips.append("RVB")
        if s.get("freeze"):
            tips.append("FREEZE + tampon")
        speeds = " → ".join(f"{int(p['rate'] * 100)} %" if p["kind"] == "video" else "figé" for p in s["pieces"])
        orig = Path(kit["originals"][s["clipIndex"]]).name
        rows.append(f"| {s['index'] + 1} | {tc(round(s['start'] * fps), fps)} | {tc(round(s['accent'] * fps), fps)} | "
                    f"{seg['file'].name} | {orig} | {speeds} | {fx.get('grade', '')} | {', '.join(tips)} |")
    drop = "—" if plan.get("drop") is None else tc(round(plan["drop"] * fps), fps)
    text = f"""# {title} — plan de montage

- Durée : {plan['duration']:.2f} s · {plan['bpm']} BPM · drop : {drop} · style : {plan['style']}
- Musique : passage à partir de {plan['musicStart']:.2f} s du morceau d'origine (déjà coupé dans music.wav)
- Timecodes de la timeline DaVinci (début 01:00:00:00, 60 i/s)

| Plan | Début | Impact | Segment | Clip d'origine | Vitesses | Étalonnage | Effets conseillés |
|---|---|---|---|---|---|---|---|
{chr(10).join(rows)}

Couleurs des marqueurs : rouge = drop · jaune = impact · vert = coupe · violet = freeze · crème = outro · bleu ciel = début de mesure · bleu = beat.
"""
    path.write_text(text)


README = """KIT DAVINCI RESOLVE — {title}

1. Projet DaVinci réglé en 1080 x 1920, 60 i/s (voir DAVINCI.md, préparation unique).
2. Fichier > Importer > Timeline...  -> timeline.xml
   (coche « Automatically import source clips into media pool »).
   Si le XML pose problème : importe timeline.otio à la place (DaVinci 18.5 ou plus).
3. Dans le Media Pool : clic droit sur la timeline > Timelines > Import > Timeline Markers from EDL
   -> markers.edl  (tous les beats, coupes, impacts et le drop apparaissent en marqueurs).
4. Pistes : V1 = clips coupés sur les beats · V2 = titres/logo/outro transparents
            A1 = musique · A2+ = bruitages.
5. Ajoute tes effets aux marqueurs jaunes (impacts) — recettes dans DAVINCI.md.
   PLAN.md liste chaque plan, son clip d'origine et les effets conseillés.
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("build")
    ap.add_argument("out")
    ap.add_argument("--graphics", help="calque transparent rendu par HyperFrames (.mov)")
    ap.add_argument("--smooth", action="store_true", help="ralentis lissés par interpolation d'images")
    ap.add_argument("--full-frame", action="store_true", help="garde le cadre 16:9 d'origine au lieu du recadrage vertical")
    args = ap.parse_args()

    build = Path(args.build)
    kit = json.loads((build / "kit.json").read_text())
    plan = json.loads((build / "plan.json").read_text())
    out = Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    fps = kit["fps"]
    title = f"EFX {kit['id']}"

    print("🎞️  Segments (un fichier par plan, coupés sur les beats)…", file=sys.stderr)
    segments = build_segments(kit, plan, out, args.full_frame, args.smooth)

    print("♪  Musique…", file=sys.stderr)
    music = out / "music.wav"
    D = plan["duration"]
    ffmpeg(["-ss", f"{plan['musicStart']:.5f}", "-i", kit["music"], "-t", f"{D:.5f}",
            "-af", f"afade=t=in:d=0.03,afade=t=out:st={max(0, D - 1):.3f}:d=1", "-ar", "48000", "-ac", "2", str(music)])

    sfx = []
    if kit["sfx"]:
        (out / "sfx").mkdir()
        for x in kit["sfx"]:
            dst = out / "sfx" / Path(x["src"]).name
            if not dst.exists():
                shutil.copy(x["src"], dst)
            sfx.append({**x, "file": dst, "fileDur": probe_duration(dst)})

    graphics = None
    if args.graphics and os.path.exists(args.graphics):
        print("🅰️  Calque titres/logo (ProRes 4444 transparent)…", file=sys.stderr)
        graphics = out / "graphics.mov"
        ffmpeg(["-i", args.graphics, "-c:v", "prores_ks", "-profile:v", "4444", "-qscale:v", "11",
                "-pix_fmt", "yuva444p10le", "-vendor", "apl0", "-an", str(graphics)])

    markers = build_markers(plan, fps)
    write_marker_edl(markers, fps, out / "markers.edl", title)
    tl = build_timeline(kit, plan, segments, music, sfx, graphics, markers, title)
    otio.adapters.write_to_file(tl, str(out / "timeline.otio"))
    otio.adapters.write_to_file(tl, str(out / "timeline.xml"), adapter_name="fcp_xml")
    write_plan_md(kit, plan, segments, markers, out / "PLAN.md", title)
    (out / "LISEZMOI.txt").write_text(README.format(title=title))
    print(f"✅ Kit DaVinci prêt : {out}  ({len(segments)} plans, {len(markers)} marqueurs)", file=sys.stderr)


if __name__ == "__main__":
    main()
