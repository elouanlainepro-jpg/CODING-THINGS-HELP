#!/usr/bin/env python3
"""Indexe la bibliotheque de clips B.

Pour chaque clip de bibliotheque/ non encore indexe : relevé de la duree, de la
resolution, et creation d'une planche-contact (bibliotheque/.vignettes/<nom>.jpg)
que Claude regarde pour ecrire les tags dans bibliotheque/index.json.

  python scripts/index_library.py            # ajoute les nouveaux clips
  python scripts/index_library.py --list     # affiche les clips sans tags
"""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "bibliotheque"
INDEX = LIB / "index.json"
THUMBS = LIB / ".vignettes"
EXT = {".mp4", ".mov", ".mkv", ".webm", ".m4v"}


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height:format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True)
    data = json.loads(out.stdout)
    stream = data["streams"][0]
    return round(float(data["format"]["duration"]), 2), stream["width"], stream["height"]


def contact_sheet(path, out_jpg, duration):
    out_jpg.parent.mkdir(exist_ok=True)
    step = max(duration / 6, 0.2)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(path), "-vf",
         f"fps=1/{step:.3f},scale=240:-1,tile=6x1", "-frames:v", "1", str(out_jpg)],
        check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true", help="liste les clips sans tags")
    args = parser.parse_args()

    index = json.loads(INDEX.read_text(encoding="utf-8")) if INDEX.exists() else {}
    if args.list:
        for name, meta in index.items():
            if not meta.get("tags"):
                print(name, "->", meta.get("vignette"))
        return

    added = 0
    for path in sorted(LIB.rglob("*")):
        if path.suffix.lower() not in EXT or ".vignettes" in path.parts:
            continue
        key = path.relative_to(LIB).as_posix()
        if key in index:
            continue
        duration, width, height = probe(path)
        thumb = THUMBS / (key.replace("/", "__") + ".jpg")
        contact_sheet(path, thumb, duration)
        index[key] = {"duree": duration, "resolution": f"{width}x{height}",
                      "vignette": thumb.relative_to(ROOT).as_posix(), "tags": [], "description": ""}
        added += 1
        print("+", key)

    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    todo = sum(1 for m in index.values() if not m.get("tags"))
    print(f"{added} nouveau(x) clip(s), {todo} a decrire (tags vides).")


if __name__ == "__main__":
    main()
