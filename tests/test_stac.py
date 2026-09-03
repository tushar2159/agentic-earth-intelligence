import asyncio
import json

import httpx

from agentic_earth.models import AnalysisRequest
from agentic_earth.planner import build_plan
from agentic_earth.stac import EarthSearchClient, parse_features


def test_parses_and_orders_stac_features():
    payload = {
        "features": [
            {
                "id": "later",
                "collection": "sentinel-2-l2a",
                "geometry": {"type": "Point", "coordinates": [1, 1]},
                "properties": {"datetime": "2026-02-01T00:00:00Z", "eo:cloud_cover": 5},
                "assets": {
                    "visual": {
                        "href": "https://sentinel-cogs.s3.us-west-2.amazonaws.com/"
                        "sentinel-s2-l2a-cogs/example-scene/visual.tif"
                    }
                },
            },
            {
                "id": "earlier",
                "collection": "sentinel-2-l2a",
                "properties": {"datetime": "2026-01-01T00:00:00Z", "eo:cloud_cover": 10},
                "assets": {},
            },
        ]
    }
    scenes = parse_features(payload)
    assert [scene.id for scene in scenes] == ["earlier", "later"]
    assert scenes[1].assets["visual"].endswith(".tif")


def test_rejects_invalid_stac_payload():
    try:
        parse_features({})
    except TypeError:
        return
    assert False


def test_client_builds_rfc3339_earth_search_request():
    async def handler(request):
        body = json.loads(request.content)
        assert body["datetime"] == "2020-01-01T00:00:00Z/2026-12-31T23:59:59Z"
        assert body["collections"] == ["sentinel-2-l2a"]
        return httpx.Response(200, json={"type": "FeatureCollection", "features": []})

    request = AnalysisRequest(
        prompt="Analyze change around Pune from 2020 to 2026",
        bbox=[73.7, 18.4, 74.0, 18.7],
    )
    client = EarthSearchClient(transport=httpx.MockTransport(handler))
    scenes = asyncio.run(client.search(request, build_plan(request)))
    assert scenes == []
