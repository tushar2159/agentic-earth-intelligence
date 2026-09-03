from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .analysis import change_statistics
from .models import AnalysisRequest, ChangeRequest, WorkflowResult
from .workflow import execute_workflow

app = FastAPI(
    title="Agentic Earth Intelligence",
    version="0.1.0",
    description="Natural-language planning and Earth Search orchestration for public EO analysis.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    return {"status": "ready", "earth_search": "https://earth-search.aws.element84.com/v1"}


@app.post("/v1/analyze", response_model=WorkflowResult)
async def analyze(request: AnalysisRequest):
    return await execute_workflow(request)


@app.post("/v1/change")
def analyze_change(request: ChangeRequest):
    return change_statistics(
        request.before,
        request.after,
        request.threshold,
        request.minimum_pixels,
    )
