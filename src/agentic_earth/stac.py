from __future__ import annotations

from dataclasses import dataclass

import httpx

from .models import AnalysisPlan, AnalysisRequest, SceneSummary

EARTH_SEARCH_URL = "https://earth-search.aws.element84.com/v1"


@dataclass
class EarthSearchClient:
    endpoint: str = EARTH_SEARCH_URL
    timeout_seconds: float = 30
    transport: httpx.AsyncBaseTransport | None = None

    async def search(self, request: AnalysisRequest, plan: AnalysisPlan) -> list[SceneSummary]:
        payload = {
            "bbox": list(request.bbox),
            "datetime": (f"{plan.start_date.isoformat()}T00:00:00Z/{plan.end_date.isoformat()}T23:59:59Z"),
            "collections": plan.collections,
            "query": {"eo:cloud_cover": {"lte": request.max_cloud_cover}},
            "limit": 20,
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds, transport=self.transport) as client:
            response = await client.post(f"{self.endpoint.rstrip('/')}/search", json=payload)
            response.raise_for_status()
            return parse_features(response.json())


def parse_features(payload: dict) -> list[SceneSummary]:
    features = payload.get("features")
    if not isinstance(features, list):
        raise TypeError("STAC response must contain a features list")
    scenes = []
    for feature in features:
        properties = feature.get("properties", {})
        assets = {
            key: asset["href"]
            for key, asset in feature.get("assets", {}).items()
            if isinstance(asset, dict) and isinstance(asset.get("href"), str)
        }
        scenes.append(
            SceneSummary(
                id=feature["id"],
                collection=feature.get("collection", "unknown"),
                datetime=properties.get("datetime", ""),
                cloud_cover=properties.get("eo:cloud_cover"),
                geometry=feature.get("geometry"),
                assets=assets,
            )
        )
    return sorted(scenes, key=lambda scene: scene.datetime)
