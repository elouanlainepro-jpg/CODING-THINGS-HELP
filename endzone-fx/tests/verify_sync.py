#!/usr/bin/env python3
"""Vérifie dans un rendu de TEST que chaque impact tombe sur son beat.

Les clips de test (make_test_assets.py) affichent une bande blanche « IMPACT » sur l'image
exacte du choc. On cherche cette bande autour de chaque temps d'impact prévu par le plan.

Usage : node scripts/py.mjs tests/verify_sync.py build/demo-test/plan.json renders/demo-test-draft.mp4
"""
import json
import subprocess
import sys

import numpy as np

FPS = 60
W, H = 108, 192  # analyse en petit


def frames(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={FPS},scale={W}:{H},format=gray", "-f", "rawvideo", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W).astype(np.float32)


def main():
    plan = json.load(open(sys.argv[1]))
    video = frames(sys.argv[2])
    tol = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    band = video[:, int(H * 0.47):int(H * 0.63), :].mean(axis=(1, 2))
    rest = video[:, int(H * 0.15):int(H * 0.35), :].mean(axis=(1, 2))
    is_band = (band > 200) & (band - rest > 60)
    worst = 0
    ok = True
    for s in plan["shots"]:
        k = int(round(s["accent"] * FPS))
        hits = [i for i in range(max(0, k - 12), min(len(video), k + 13)) if is_band[i]]
        if not hits:
            print(f"plan {s['index']:2d} {s['clip']:14s} impact prévu {s['accent']:6.3f}s  ❌ bande IMPACT introuvable")
            ok = False
            continue
        off = min(hits, key=lambda i: abs(i - k)) - k
        worst = max(worst, abs(off))
        mark = "✅" if abs(off) <= tol else "❌"
        ok &= abs(off) <= tol
        print(f"plan {s['index']:2d} {s['clip']:14s} impact prévu {s['accent']:6.3f}s  écart {off:+d} image(s) {mark}")
    print(f"\nécart max : {worst} image(s) à {FPS} i/s → {'OK' if ok else 'ÉCHEC'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
