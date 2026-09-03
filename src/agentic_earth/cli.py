import argparse
import asyncio
import json

from .models import AnalysisRequest
from .workflow import execute_workflow


def main():
    parser = argparse.ArgumentParser(prog="agentic-earth")
    parser.add_argument("prompt")
    parser.add_argument("--bbox", nargs=4, type=float, required=True, metavar=("W", "S", "E", "N"))
    parser.add_argument("--collection", action="append", default=["sentinel-2-l2a"])
    args = parser.parse_args()
    request = AnalysisRequest(prompt=args.prompt, bbox=args.bbox, collections=args.collection)
    result = asyncio.run(execute_workflow(request))
    print(json.dumps(result.model_dump(mode="json"), indent=2))


if __name__ == "__main__":
    main()
