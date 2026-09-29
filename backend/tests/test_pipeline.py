"""Tests de la chaîne de traitement (moteurs classiques, sans IA)."""
from __future__ import annotations

import numpy as np

from app.pipeline import maskops
from app.pipeline.compositing import CompositeOptions, Compositor, detect_shadow
from app.pipeline.generation import sprite_from_image
from app.pipeline.inpainting import remove_object
from app.pipeline.restyle import parse_prompt, restyle_frame
from app.pipeline.segmentation import Point, segment
from app.pipeline.tracking import estimate_camera, estimate_object_motion, track_masks

from .conftest import N, disk_center, iou


def test_click_segmentation(scene):
    frames, masks, _ = scene
    cx, cy = disk_center(5)
    result = segment(frames[5], [Point(cx, cy, 1)])
    assert result.engine == "grabcut"
    assert iou(result.mask, masks[5]) > 0.85


def test_tracking_follows_object(scene, tmp_path):
    frames, masks, _ = scene
    key = 10
    tracked, engine = track_masks(frames, key, masks[key], tmp_path, lambda *_: None)
    assert engine == "optical-flow"
    scores = [iou(tracked[t], masks[t]) for t in range(N)]
    assert min(scores) > 0.75, scores


def test_object_motion_and_camera(scene):
    frames, masks, _ = scene
    key = 10
    T = estimate_object_motion(frames, masks, key)
    for t in (0, 5, 15, N - 1):
        pred = T[t] @ np.array([*disk_center(key), 1.0])
        assert np.linalg.norm(pred - np.array(disk_center(t))) < 3.0, (t, pred)
    G = estimate_camera(frames, masks, key)
    # la caméra panoramique de 2 px/frame : frame t -> keyframe = translation de 2*(t-key)
    for t in (0, N - 1):
        assert abs(G[t][0, 2] - 2 * (t - key)) < 1.5, G[t]


def test_shadow_detection(scene):
    frames, masks, _ = scene
    for t in (2, 8, 20):
        shadow, spec = detect_shadow(frames[t], masks[t])
        assert spec is not None
        cx, cy = disk_center(t)
        ys, xs = np.nonzero(shadow)
        assert xs.mean() > cx + 5  # l'ombre part vers la droite
        assert (shadow > 0).sum() > 350
        assert np.all(spec.ratio < 0.8)


def test_erase_reconstructs_background(scene, tmp_path):
    frames, masks, bgs = scene
    key = 10
    G = estimate_camera(frames, masks, key)
    holes = np.stack([maskops.dilate(m, 4) for m in masks])
    for t in range(N):
        sh, _ = detect_shadow(frames[t], masks[t])
        holes[t] |= maskops.dilate(sh, 3)
    clean, engine = remove_object(frames, holes, G, key, tmp_path, lambda *_: None, n_candidates=8)
    assert engine == "temporal"
    errors = []
    for t in range(N):
        sel = masks[t] > 0
        errors.append(np.abs(clean[t][sel].astype(float) - bgs[t][sel].astype(float)).mean())
    # le décor derrière le disque est retrouvé dans les autres frames (quasi parfait)
    assert np.median(errors) < 12, errors


def test_restyle_parsing_and_color():
    assert parse_prompt("une voiture ROSE bonbon").label == "rose"
    assert parse_prompt("en or massif").label.startswith("or")
    assert parse_prompt("licorne magique").kind == "rainbow"
    assert parse_prompt("néon bleu").neon


def test_restyle_frame_changes_hue(scene):
    frames, masks, _ = scene
    spec = parse_prompt("vert")
    out = restyle_frame(frames[3], maskops.feather(masks[3], 1.0), spec)
    sel = maskops.erode(masks[3], 3) > 0
    b, g, r = out[sel].astype(float).mean(0)
    assert g > r and g > b  # le disque rouge est devenu vert
    outside = masks[3] == 0
    assert np.abs(out[outside].astype(int) - frames[3][outside].astype(int)).mean() < 1.0


def test_replace_with_uploaded_element(scene, tmp_path):
    frames, masks, bgs = scene
    key = 10
    # élément : carré jaune avec transparence
    element = np.zeros((80, 80, 4), np.uint8)
    element[10:70, 10:70] = (0, 230, 255, 255)
    clean = bgs.copy()  # décor parfait pour isoler le compositing
    sprite = sprite_from_image(element, masks[key], clean[key])
    T = estimate_object_motion(frames, masks, key)
    comp = Compositor(sprite, frames, clean, masks, T, key, CompositeOptions(occlusion=False))
    for t in (0, key, N - 1):
        out = comp.render(t)
        cx, cy = disk_center(t)
        b, g, r = out[cy - 5:cy + 5, cx - 5:cx + 5].reshape(-1, 3).mean(0)
        assert r > 150 and g > 150 and b < 120, (t, b, g, r)  # jaune au bon endroit
