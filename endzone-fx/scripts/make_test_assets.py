#!/usr/bin/env python3
"""Fabrique un edit de TEST (clips et musique synthétiques) pour vérifier la chaîne complète.

Chaque clip montre deux joueurs (rectangles) qui se percutent à un instant connu,
avec « IMPACT » écrit sur l'image exacte du choc : on peut ainsi vérifier dans le rendu
que chaque impact tombe bien sur un beat. La musique fait 140 BPM avec un drop au beat 32.

Usage : python3 scripts/make_test_assets.py [dossier]   (défaut : edits/demo-test)
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 60
BPM = 140.0
DROP_BEAT = 32
CLIPS = [  # (durée, instant de l'impact, position x du choc en fraction de l'image, couleur)
    (3.6, 1.70, 0.50, (200, 40, 40)),
    (3.2, 1.25, 0.35, (230, 120, 20)),
    (4.2, 2.40, 0.62, (40, 90, 210)),
    (3.0, 1.10, 0.45, (150, 40, 160)),
    (3.8, 2.05, 0.70, (20, 150, 90)),
    (4.0, 1.85, 0.40, (200, 40, 40)),
    (3.4, 1.50, 0.55, (230, 200, 30)),
    (3.6, 1.95, 0.30, (40, 90, 210)),
]


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def make_clip(path, n, dur, impact, xfrac, color):
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
         "-pix_fmt", "yuv420p", path],
        stdin=subprocess.PIPE,
    )
    f_big, f_mid, f_small = font(170), font(64), font(40)
    xc = xfrac * W
    nframes = int(round(dur * FPS))
    impact_frame = int(round(impact * FPS))
    for i in range(nframes):
        t = i / FPS
        im = Image.new("RGB", (W, H), (34, 110, 52))
        d = ImageDraw.Draw(im)
        pan = (t * 140) % 160  # panoramique caméra
        for k in range(-1, W // 160 + 2):
            x = k * 160 - pan
            d.line([(x, 0), (x, H)], fill=(225, 235, 225), width=6)
        dt = t - impact
        if dt < 0:
            rx = xc - 70 + dt * 700
            bx = xc + 70 - dt * 500
            ry = by = H * 0.55
        else:
            rx = xc - 70 - 900 * dt * np.exp(-2 * dt)
            bx = xc + 70 + 400 * dt
            ry = H * 0.55 + 600 * dt * dt
            by = H * 0.55 - 200 * dt
        d.rectangle([rx - 60, ry - 150, rx + 60, ry + 150], fill=color)
        d.rectangle([bx - 60, by - 150, bx + 60, by + 150], fill=(245, 245, 245))
        if 0 <= dt < 0.35:  # onde de choc
            r = 80 + 1400 * dt
            d.ellipse([xc - r, H * 0.55 - r, xc + r, H * 0.55 + r], outline=(255, 255, 210), width=int(40 * (1 - dt / 0.35)) + 2)
        d.text((40, 30), f"CLIP {n}", fill=(255, 255, 255), font=f_mid)
        d.text((W - 420, 30), f"t={t:5.2f}s  f{i}", fill=(255, 255, 255), font=f_small)
        if i == impact_frame:
            d.rectangle([0, H * 0.42, W, H * 0.68], fill=(255, 255, 255))
            d.text((W * 0.5 - 330, H * 0.45), "IMPACT", fill=(220, 0, 0), font=f_big)
        proc.stdin.write(im.tobytes())
    proc.stdin.close()
    proc.wait()


def make_music(path, seconds=40.0):
    sr = 44100
    n = int(seconds * sr)
    out = np.zeros(n, dtype=np.float32)
    beat = 60.0 / BPM
    rng = np.random.default_rng(7)

    def add(sig, t, gain):
        i = int(t * sr)
        if i >= n:
            return
        j = min(n, i + len(sig))
        out[i:j] += gain * sig[: j - i]

    tk = np.arange(int(0.35 * sr)) / sr
    kick = np.sin(2 * np.pi * (50 + 120 * np.exp(-tk * 30)) * tk) * np.exp(-tk * 9)
    ts = np.arange(int(0.2 * sr)) / sr
    snare = rng.standard_normal(len(ts)) * np.exp(-ts * 22)
    th = np.arange(int(0.05 * sr)) / sr
    hat = np.diff(rng.standard_normal(len(th) + 1)) * np.exp(-th * 80)
    tc = np.arange(int(0.12 * sr)) / sr
    bell = (np.sign(np.sin(2 * np.pi * 800 * tc)) + np.sign(np.sin(2 * np.pi * 540 * tc))) * np.exp(-tc * 25)

    total_beats = int(seconds / beat)
    for b in range(total_beats):
        t = b * beat
        if b < DROP_BEAT:
            add(kick, t, 0.18)
            add(hat, t + beat / 2, 0.05)
        else:
            add(kick, t, 0.95)
            if b % 2 == 1:
                add(snare, t, 0.45)
            add(bell, t, 0.12)
            add(bell, t + beat / 2, 0.09)
            add(hat, t + beat / 4, 0.12)
            add(hat, t + 3 * beat / 4, 0.12)
    # Nappe d'intro et 808 après le drop.
    t_all = np.arange(n) / sr
    drop_t = DROP_BEAT * beat
    pad = 0.05 * (np.sin(2 * np.pi * 220 * t_all) + np.sin(2 * np.pi * 277.2 * t_all) + np.sin(2 * np.pi * 329.6 * t_all))
    out += np.where(t_all < drop_t, pad, 0).astype(np.float32)
    bass = 0.35 * np.sin(2 * np.pi * 55 * t_all)
    out += np.where(t_all >= drop_t, bass, 0).astype(np.float32)
    # Montée (riser) sur les 8 beats avant le drop.
    rs, re = (DROP_BEAT - 8) * beat, drop_t
    mask = (t_all >= rs) & (t_all < re)
    ramp = np.zeros(n, dtype=np.float32)
    ramp[mask] = ((t_all[mask] - rs) / (re - rs)) ** 2
    out += (rng.standard_normal(n).astype(np.float32) * 0.12 * ramp)
    out /= max(1.0, float(np.abs(out).max()) / 0.95)
    import soundfile as sf
    sf.write(path, np.stack([out, out], axis=1), sr)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "edits/demo-test"
    os.makedirs(os.path.join(root, "clips"), exist_ok=True)
    truth = []
    for k, (dur, impact, xfrac, color) in enumerate(CLIPS, start=1):
        p = os.path.join(root, "clips", f"{k:02d}-test.mp4")
        make_clip(p, k, dur, impact, xfrac, color)
        truth.append({"file": f"clips/{k:02d}-test.mp4", "impact": impact, "focus": xfrac})
        print(f"clip {p}", file=sys.stderr)
    make_music(os.path.join(root, "music.wav"))
    edit_path = os.path.join(root, "edit.json")
    if not os.path.exists(edit_path):
        with open(edit_path, "w") as f:
            json.dump({
                "request": "Test Player biggest hits",
                "style": "hits",
                "player": "TEST PLAYER",
                "title": "BIGGEST HITS",
                "duration": 15,
                "format": "vertical",
                "music": {"file": "music.wav"},
                "clips": [],
            }, f, indent=2, ensure_ascii=False)
    with open(os.path.join(root, "truth.json"), "w") as f:
        json.dump({"bpm": BPM, "drop": DROP_BEAT * 60.0 / BPM, "clips": truth}, f, indent=2)
    print(f"✅ Edit de test prêt dans {root}", file=sys.stderr)


if __name__ == "__main__":
    main()
