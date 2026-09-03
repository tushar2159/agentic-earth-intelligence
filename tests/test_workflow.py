import asyncio

from agentic_earth.models import AnalysisRequest, SceneSummary
from agentic_earth.workflow import execute_workflow


async def fake_search(request, plan):
    return [
        SceneSummary(
            id="cloudy",
            collection=plan.collections[0],
            datetime="2026-02-01T00:00:00Z",
            cloud_cover=18,
        ),
        SceneSummary(
            id="clear",
            collection=plan.collections[0],
            datetime="2026-01-01T00:00:00Z",
            cloud_cover=2,
        ),
    ]


def test_workflow_trace_and_scene_ranking():
    request = AnalysisRequest(
        prompt="Analyze change around Pune from 2020 to 2026",
        bbox=[73.7, 18.4, 74.0, 18.7],
    )
    result = asyncio.run(execute_workflow(request, search=fake_search))
    assert result.scenes[0].id == "clear"
    assert [event.stage for event in result.trace] == [
        "request",
        "planner",
        "earth_search",
        "earth_search",
        "scene_ranker",
        "reporter",
    ]
    assert "catalog metadata" in result.report
