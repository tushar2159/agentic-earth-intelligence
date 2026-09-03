from fastapi.testclient import TestClient

from agentic_earth.api import app


def test_health_contract():
    client = TestClient(app)
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/ready").status_code == 200


def test_change_endpoint():
    client = TestClient(app)
    before = [[0, 0], [0, 0]]
    after = [[1, 0], [0, 0]]
    response = client.post(
        "/v1/change",
        json={"before": before, "after": after, "threshold": 0.2, "minimum_pixels": 1},
    )
    assert response.status_code == 200
    assert response.json()["changed_pixels"] == 1
