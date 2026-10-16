"""Every JSON example in docs/api/v1.md must validate against the API's response models."""

import json
import re
from pathlib import Path

from swale.api.models import CatchBasinCollection, HealthResponse, IncidentFeature

DOC = Path(__file__).resolve().parents[2] / "docs" / "api" / "v1.md"


def test_doc_examples_validate_against_the_models():
    seen = set()
    for block in re.findall(r"```json\n(.*?)```", DOC.read_text(), re.S):
        example = json.loads(block)
        if example.get("type") == "FeatureCollection":
            CatchBasinCollection.model_validate(example)
            seen.add("catch_basin_collection")
        elif example.get("type") == "Feature":
            IncidentFeature.model_validate(example)
            seen.add("incident_feature")
        elif str(example.get("type", "")).startswith("/api/v1/problems/"):
            assert {"type", "title", "status", "detail", "instance"} <= example.keys()
            seen.add("problem")
        elif "db" in example:
            HealthResponse.model_validate(example)
            seen.add("health")
    assert seen == {"catch_basin_collection", "incident_feature", "problem", "health"}
