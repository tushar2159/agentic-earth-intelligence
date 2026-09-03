from __future__ import annotations

import re
from datetime import date, datetime, timezone

from .models import AnalysisPlan, AnalysisRequest

YEAR = re.compile(r"\b(19\d{2}|20\d{2})\b")


def build_plan(request: AnalysisRequest, today: date | None = None) -> AnalysisPlan:
    text = request.prompt.strip()
    lower = text.lower()
    years = [int(value) for value in YEAR.findall(text)]
    current = today or datetime.now(timezone.utc).date()
    if len(years) >= 2:
        start_year, end_year = min(years), max(years)
    elif years:
        start_year = end_year = years[0]
    else:
        start_year, end_year = current.year - 1, current.year

    intent = "scene_discovery"
    if any(term in lower for term in ("change", "expansion", "before", "after")):
        intent = "change_detection"
    elif any(term in lower for term in ("trend", "time series", "season")):
        intent = "timeseries"

    location = None
    match = re.search(
        r"\b(?:around|near|in|for)\s+([A-Z][A-Za-z .-]{2,40}?)(?:\s+from|\s+between|\s+in\s+\d|$)", text
    )
    if match:
        location = match.group(1).strip()

    steps = [
        "validate_request",
        "plan_analysis",
        "search_earth_catalog",
        "rank_scenes",
    ]
    if intent == "change_detection":
        steps.extend(["select_temporal_pair", "compute_change", "summarize"])
    elif intent == "timeseries":
        steps.extend(["order_observations", "derive_temporal_features", "summarize"])
    else:
        steps.append("summarize")

    return AnalysisPlan(
        intent=intent,
        location_text=location,
        start_date=date(start_year, 1, 1),
        end_date=date(end_year, 12, 31),
        collections=request.collections,
        steps=steps,
    )
