from __future__ import annotations

from collections.abc import Awaitable, Callable

from .models import AnalysisRequest, SceneSummary, WorkflowEvent, WorkflowResult
from .planner import build_plan
from .stac import EarthSearchClient

SceneSearch = Callable[[AnalysisRequest, object], Awaitable[list[SceneSummary]]]


def _report(request, plan, scenes):
    collection_names = ", ".join(sorted({scene.collection for scene in scenes})) or "none"
    return (
        f"Planned {plan.intent.replace('_', ' ')} for {plan.start_date.year}–{plan.end_date.year}. "
        f"Earth Search returned {len(scenes)} scene(s) inside the supplied bounding box "
        f"from collection(s): {collection_names}. "
        "This response summarizes catalog metadata; pixel-level analysis requires selected asset reads."
    )


async def execute_workflow(
    request: AnalysisRequest,
    search: SceneSearch | None = None,
) -> WorkflowResult:
    trace = [WorkflowEvent(stage="request", status="completed", detail="request schema validated")]
    plan = build_plan(request)
    trace.append(WorkflowEvent(stage="planner", status="completed", detail=f"intent={plan.intent}"))
    search_fn = search or EarthSearchClient().search
    trace.append(WorkflowEvent(stage="earth_search", status="started", detail="querying Element 84 STAC"))
    scenes = await search_fn(request, plan)
    trace.append(WorkflowEvent(stage="earth_search", status="completed", detail=f"{len(scenes)} scenes"))
    scenes = sorted(
        scenes, key=lambda scene: (scene.cloud_cover is None, scene.cloud_cover or 0, scene.datetime)
    )
    trace.append(WorkflowEvent(stage="scene_ranker", status="completed", detail="ranked by cloud cover"))
    report = _report(request, plan, scenes)
    trace.append(WorkflowEvent(stage="reporter", status="completed", detail="metadata report assembled"))
    return WorkflowResult(plan=plan, trace=trace, scenes=scenes, report=report)
