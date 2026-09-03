from datetime import date

from agentic_earth.models import AnalysisRequest
from agentic_earth.planner import build_plan


def test_plans_change_request_and_extracts_years():
    request = AnalysisRequest(
        prompt="Analyze urban expansion around Pune from 2020 to 2026",
        bbox=[73.7, 18.4, 74.0, 18.7],
    )
    plan = build_plan(request, today=date(2026, 1, 1))
    assert plan.intent == "change_detection"
    assert plan.location_text == "Pune"
    assert (plan.start_date.year, plan.end_date.year) == (2020, 2026)
    assert "select_temporal_pair" in plan.steps


def test_rejects_invalid_bbox():
    try:
        AnalysisRequest(prompt="Find available satellite scenes", bbox=[200, 0, 201, 1])
    except ValueError:
        return
    assert False
