#!/usr/bin/env python3
"""Transcrit l'audio d'une video avec Whisper (local, gratuit) et ecrit un .srt.

  python scripts/subtitles.py sortie/mon-meme.mp4                # -> sortie/mon-meme.srt
  python scripts/subtitles.py sortie/mon-meme.mp4 --burn         # + mon-meme_sub.mp4 sous-titre
  python scripts/subtitles.py clip.mp4 --lang fr --model small
"""
import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def stamp(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--lang", default=None, help="fr, en... (defaut: detection auto)")
    p.add_argument("--model", default="base", help="tiny, base, small, medium")
    p.add_argument("--burn", action="store_true", help="incruste les sous-titres dans la video")
    args = p.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise SystemExit("Installe Whisper : pip install faster-whisper")

    video = Path(args.video).resolve()
    srt = video.with_suffix(".srt")
    model = WhisperModel(args.model, compute_type="int8")
    segments, info = model.transcribe(str(video), language=args.lang, vad_filter=True)
    with srt.open("w", encoding="utf-8") as f:
        for i, seg in enumerate(segments, 1):
            f.write(f"{i}\n{stamp(seg.start)} --> {stamp(seg.end)}\n{seg.text.strip()}\n\n")
    print(f"Langue : {info.language} -> {srt}")

    if args.burn:
        out = video.with_name(video.stem + "_sub.mp4")
        # zone noire en bas du format meme : sous-titres centres vers y=1650
        style = ("FontName=Inter SemiBold,FontSize=14,PrimaryColour=&H00FFFFFF&,"
                 "OutlineColour=&H00000000&,Outline=2,Alignment=2,MarginV=300")
        # cwd = dossier du srt : evite les problemes d'echappement de chemins Windows
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", video.name, "-vf",
             f"subtitles={srt.name}:force_style='{style}'", "-c:a", "copy", out.name],
            check=True, cwd=video.parent)
        print("->", out)


if __name__ == "__main__":
    main()
