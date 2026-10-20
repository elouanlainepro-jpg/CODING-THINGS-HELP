#!/usr/bin/env python3
"""Verifie que tout est installe pour MEME PRODUCTION."""
import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ok = True


def check(label, good, fix="", optional=False):
    global ok
    print(("  [OK]  " if good else "  [!!]  ") + label + ("" if good else f"  ->  {fix}"))
    ok = ok and (good or optional)


print("MEME PRODUCTION - verification\n")
check("Python 3.9+", sys.version_info >= (3, 9), "installe Python depuis python.org")
for tool in ("ffmpeg", "ffprobe"):
    check(tool, shutil.which(tool) is not None,
          "Windows: winget install Gyan.FFmpeg | Mac: brew install ffmpeg")
check("Pillow (texte de la bande)", importlib.util.find_spec("PIL") is not None,
      "pip install pillow")
check("faster-whisper (sous-titres, optionnel)",
      importlib.util.find_spec("faster_whisper") is not None, "pip install faster-whisper", optional=True)
for font in ("Inter-SemiBold.otf", "Montserrat-Variable.ttf", "Anton-Regular.ttf", "BebasNeue-Regular.ttf"):
    check(f"police fonts/{font}", (ROOT / "fonts" / font).exists(), "remets la police dans fonts/")

if shutil.which("ffmpeg"):
    ver = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[0]
    print("\n" + ver)
print("\nTout est pret." if ok else "\nCorrige les lignes [!!] puis relance ce script.")
