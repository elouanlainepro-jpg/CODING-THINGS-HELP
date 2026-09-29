"""Test de bout en bout de l'API : import -> clic -> remplacement -> galerie."""
from __future__ import annotations

import time

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

from .conftest import H, W, disk_center


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _wait(client, job_id, timeout=240):
    start = time.time()
    while time.time() - start < timeout:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.3)
    raise TimeoutError(job_id)


@pytest.fixture(scope="module")
def uploaded(client, scene_video):
    with scene_video.open("rb") as f:
        res = client.post("/api/videos", files={"file": ("scene.mp4", f, "video/mp4")})
    assert res.status_code == 200, res.text
    meta = res.json()
    assert meta["width"] == W and meta["height"] == H
    assert meta["frame_count"] == 24
    return meta


@pytest.fixture(scope="module")
def selection(client, uploaded):
    cx, cy = disk_center(10)
    res = client.post("/api/segment", json={
        "video_id": uploaded["id"], "frame_index": 10,
        "points": [{"x": cx / (W - 1), "y": cy / (H - 1), "label": 1}],
    })
    assert res.status_code == 200, res.text
    sel = res.json()
    assert sel["engine"] == "grabcut"
    assert 0.02 < sel["area"] < 0.05
    assert sel["contours"]
    return sel


def test_health(client):
    data = client.get("/api/health").json()
    assert data["ok"] and data["capabilities"]["ai_disabled"]
    assert data["clips_dir"].endswith("YOUR DAIL CLIPS")


def test_proxy_is_served_with_range(client, uploaded):
    res = client.get(uploaded["proxy_url"], headers={"Range": "bytes=0-99"})
    assert res.status_code == 206 and len(res.content) == 100


@pytest.mark.parametrize("mode,prompt", [("restyle", "licorne arc-en-ciel"), ("erase", "")])
def test_modes_end_to_end(client, uploaded, selection, mode, prompt):
    res = client.post("/api/replace", json={
        "video_id": uploaded["id"], "mask_id": selection["mask_id"], "mode": mode,
        "prompt": prompt, "options": {"preset": "rapide"},
    })
    assert res.status_code == 200, res.text
    job = _wait(client, res.json()["job_id"])
    assert job["status"] == "done", job
    item = job["result"]
    assert "final.mp4" in item["files"] and "source.mp4" in item["files"]
    folder = settings.clips_dir / item["id"]
    assert (folder / "final.mp4").stat().st_size > 1000
    assert (folder / "recipe.json").is_file()
    cap = cv2.VideoCapture(str(folder / "final.mp4"))
    frames = 0
    while cap.grab():
        frames += 1
    assert frames == 24


def test_replace_without_diffusion_falls_back_to_restyle(client, uploaded, selection):
    res = client.post("/api/replace", json={
        "video_id": uploaded["id"], "mask_id": selection["mask_id"], "mode": "replace",
        "prompt": "un ballon bleu", "options": {"preset": "rapide"},
    })
    job = _wait(client, res.json()["job_id"])
    assert job["status"] == "done", job
    assert job["result"]["mode"] == "restyle"
    assert job["result"]["warnings"]


def test_replace_with_element_upload(client, uploaded, selection):
    element = np.zeros((64, 64, 4), np.uint8)
    cv2.circle(element, (32, 32), 28, (255, 200, 0, 255), -1)
    ok, buf = cv2.imencode(".png", element)
    res = client.post("/api/elements", files={"file": ("star.png", buf.tobytes(), "image/png")})
    assert res.status_code == 200 and res.json()["has_alpha"]
    res = client.post("/api/replace", json={
        "video_id": uploaded["id"], "mask_id": selection["mask_id"], "mode": "replace",
        "element_id": res.json()["element_id"],
        "options": {"preset": "equilibre", "shadows": "auto"},
    })
    job = _wait(client, res.json()["job_id"])
    assert job["status"] == "done", job
    item = job["result"]
    assert item["mode"] == "replace"
    assert {"element.png", "clean_plate.mp4", "mask_track.mp4"} <= set(item["files"])
    assert item["engines"]["shadow_copied_from_original"]


def test_gallery_and_delete(client):
    items = client.get("/api/gallery").json()["items"]
    assert len(items) >= 3
    target = items[-1]["id"]
    assert client.delete(f"/api/gallery/{target}").status_code == 200
    assert target not in [i["id"] for i in client.get("/api/gallery").json()["items"]]
    # tentative de sortie du dossier : jamais de suppression (404, ou 405 si le frontend buildé
    # est monté sur "/" et récupère le chemin normalisé)
    assert client.delete("/api/gallery/..%2F..").status_code in (404, 405)
    assert client.delete("/api/gallery/not%20valid!").status_code == 404
    assert settings.clips_dir.is_dir()


def test_bad_inputs(client, uploaded):
    res = client.post("/api/videos", files={"file": ("x.txt", b"hello", "text/plain")})
    assert res.status_code == 415
    res = client.post("/api/segment", json={
        "video_id": uploaded["id"], "frame_index": 0, "points": [{"x": 0.5, "y": 0.5, "label": 0}],
    })
    assert res.status_code == 400
