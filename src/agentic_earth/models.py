from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class AnalysisRequest(BaseModel):
    prompt: str = Field(min_length=8, max_length=500)
    bbox: tuple[float, float, float, float]
    collections: list[str] = Field(default_factory=lambda: ["sentinel-2-l2a"])
    max_cloud_cover: float = Field(default=20, ge=0, le=100)

    @model_validator(mode="after")
    def validate_bbox(self):
        west, south, east, north = self.bbox
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
            raise ValueError("bbox must be ordered [west, south, east, north] in EPSG:4326")
        return self


class AnalysisPlan(BaseModel):
    intent: Literal["change_detection", "scene_discovery", "timeseries"]
    location_text: Optional[str]  # noqa: UP045 - keeps Pydantic importable on Python 3.9 test hosts
    start_date: date
    end_date: date
    collections: list[str]
    steps: list[str]


class SceneSummary(BaseModel):
    id: str
    collection: str
    datetime: str
    cloud_cover: Optional[float]  # noqa: UP045
    geometry: Optional[dict] = None  # noqa: UP045
    assets: dict[str, str] = Field(default_factory=dict)


class WorkflowEvent(BaseModel):
    stage: str
    status: Literal["started", "completed", "skipped"]
    detail: str


class WorkflowResult(BaseModel):
    plan: AnalysisPlan
    trace: list[WorkflowEvent]
    scenes: list[SceneSummary]
    report: str


class ChangeRequest(BaseModel):
    before: list
    after: list
    threshold: float = Field(default=0.2, ge=0, le=1)
    minimum_pixels: int = Field(default=1, ge=1)
