"""Schémas d'API (pydantic)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ClickPoint(BaseModel):
    x: float = Field(..., ge=0, le=1, description="Abscisse normalisée [0,1]")
    y: float = Field(..., ge=0, le=1, description="Ordonnée normalisée [0,1]")
    label: Literal[0, 1] = 1  # 1 = inclure, 0 = exclure


class SegmentRequest(BaseModel):
    video_id: str
    frame_index: int = Field(..., ge=0)
    points: list[ClickPoint] = Field(..., min_length=1, max_length=32)


class SegmentResponse(BaseModel):
    mask_id: str
    frame_index: int
    engine: str
    score: float
    area: float  # fraction de l'image
    bbox: list[float]  # normalisée x0,y0,x1,y1
    mask_png: str  # base64 (PNG niveaux de gris, taille du proxy)
    contours: list[list[list[float]]]


Preset = Literal["rapide", "equilibre", "perfect"]


class ReplaceOptions(BaseModel):
    preset: Preset = "equilibre"
    shadows: Literal["auto", "keep", "contact", "off"] = "auto"
    relight: bool = True
    grain: bool = True
    motion_blur: bool = True
    light_wrap: bool = True
    occlusion: bool | None = None  # None = selon le preset
    remove_original_shadow: bool | None = None
    use_propainter: bool | None = None
    motion_model: Literal["rigid", "deformable"] = "rigid"
    shape_mode: Literal["follow", "free"] = "follow"
    mask_expand: int | None = Field(None, ge=0, le=80)
    seed: int = -1
    steps: int | None = Field(None, ge=5, le=100)
    guidance: float = Field(7.0, ge=1.0, le=20.0)
    element_scale: float = Field(1.0, ge=0.2, le=3.0)


class ReplaceRequest(BaseModel):
    video_id: str
    mask_id: str
    mode: Literal["replace", "restyle", "erase"] = "replace"
    prompt: str = Field("", max_length=500)
    negative_prompt: str = Field("", max_length=500)
    element_id: str | None = None
    options: ReplaceOptions = Field(default_factory=ReplaceOptions)


class JobView(BaseModel):
    id: str
    status: Literal["queued", "running", "done", "error"]
    progress: float
    stage: str
    message: str = ""
    error: str | None = None
    result: dict | None = None
    created_at: float
    updated_at: float
