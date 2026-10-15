#!/usr/bin/env python3
"""Analyse une musique pour le montage : tempo, beats, temps forts, énergie et drop.

Usage : python3 scripts/analyze_music.py musique.mp3 -o music.json
"""
import argparse
import json
import sys

import librosa
import numpy as np

SR = 22050
HOP = 256


def moving_mean(x, n):
    if n <= 1:
        return x
    k = np.ones(n) / n
    return np.convolve(x, k, mode="same")


def analyze(path):
    y, sr = librosa.load(path, sr=SR, mono=True)
    duration = len(y) / sr
    if duration < 5:
        raise SystemExit(f"Musique trop courte ({duration:.1f} s)")

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    # trim=False : garder les beats d'une intro calme (sinon librosa les supprime).
    _, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_env, sr=sr, hop_length=HOP, units="frames", trim=False
    )
    beats = librosa.frames_to_time(beat_frames, sr=sr, hop_length=HOP)
    if len(beats) < 8:
        raise SystemExit("Pas assez de beats détectés : choisis une musique plus rythmée.")
    # Période réelle : régression sur la plus longue suite de beats réguliers
    # (la grille de librosa est arrondie à la trame et peut glisser dans une intro calme).
    gaps = np.diff(beats)
    med = np.median(gaps)
    ok = np.abs(gaps - med) < 0.03
    best_len, best_start, run = 0, 0, 0
    for i, good in enumerate(ok):
        run = run + 1 if good else 0
        if run > best_len:
            best_len, best_start = run, i - run + 1
    seg = beats[best_start:best_start + best_len + 1]
    beat_len, offset = np.polyfit(np.arange(len(seg)), seg, 1)
    first = offset - beat_len * np.floor(offset / beat_len)
    grid = np.arange(first, duration - 0.05, beat_len)
    # Tempo constant (phonk, trap, électro…) si la grille colle à la majorité des beats détectés.
    # (un beat calé sur le contretemps compte aussi : même tempo, phase glissée)
    half = np.concatenate([grid, grid + beat_len / 2])
    near = np.array([np.min(np.abs(half - t)) for t in beats])
    steady = bool(len(seg) >= 16 and np.mean(near < 0.04) >= 0.75)
    if steady:
        beats = grid
    beat_len = float(beat_len)
    bpm = 60.0 / beat_len

    # Énergie (RMS) et énergie des basses (kick / 808) par trame.
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    spec = np.abs(librosa.stft(y, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=sr)
    low = spec[freqs < 150].sum(axis=0)
    n = min(len(rms), len(low), len(onset_env))
    rms, low, onset_env = rms[:n], low[:n], onset_env[:n]
    times = librosa.frames_to_time(np.arange(n), sr=sr, hop_length=HOP)
    frames_per_sec = sr / HOP

    def frame_at(t):
        return int(np.clip(round(t * frames_per_sec), 0, n - 1))

    # Temps forts : la phase (0..3) dont les beats portent le plus de basses.
    low_n = low / (low.max() + 1e-9)
    beat_low = np.array([low_n[frame_at(t)] for t in beats])
    phase = int(np.argmax([beat_low[p::4].mean() if len(beat_low[p::4]) else 0 for p in range(4)]))
    downbeats = beats[phase::4]

    # Drop : le beat où l'énergie des 2 s suivantes dépasse le plus celle des 2 s précédentes.
    energy = moving_mean(rms / (rms.max() + 1e-9), int(frames_per_sec * 0.25))
    win = int(frames_per_sec * 2)
    best, drop = 0.0, None
    for t in beats:
        f = frame_at(t)
        if t < 2.5 or t > duration - 4 or f - win < 0 or f + win >= n:
            continue
        before = energy[f - win:f].mean()
        after = energy[f:f + win].mean()
        score = (after - before) * after
        if score > best:
            best, drop = score, float(t)
    if drop is not None and best < 0.02:
        drop = None  # pas de vrai drop : musique plutôt linéaire
    if drop is not None and len(downbeats):
        # Un drop tombe presque toujours sur un temps fort.
        near = downbeats[np.argmin(np.abs(downbeats - drop))]
        if abs(near - drop) <= beat_len * 1.01:
            drop = float(near)

    step = 0.25
    curve = [
        {"t": round(float(t), 3), "e": round(float(energy[frame_at(t)]), 3)}
        for t in np.arange(0, duration, step)
    ]
    return {
        "file": path,
        "duration": round(duration, 3),
        "bpm": round(bpm, 2),
        "beatLen": round(beat_len, 4),
        "steadyTempo": bool(steady),
        "beats": [round(float(t), 4) for t in beats],
        "downbeats": [round(float(t), 4) for t in downbeats],
        "drop": None if drop is None else round(drop, 4),
        "energy": curve,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("audio")
    ap.add_argument("-o", "--out")
    args = ap.parse_args()
    result = analyze(args.audio)
    text = json.dumps(result, indent=1)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text)
    else:
        sys.stdout.write(text)
    drop = "aucun" if result["drop"] is None else f"{result['drop']:.2f} s"
    print(f"♪ {result['bpm']:.1f} BPM · {len(result['beats'])} beats · drop : {drop}", file=sys.stderr)


if __name__ == "__main__":
    main()
