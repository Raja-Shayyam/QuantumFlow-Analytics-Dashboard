"""Smoke tests: `cd backend && QF_DATA_MODE=synthetic pytest -q`."""

import os
import time

os.environ.setdefault("QF_DATA_MODE", "synthetic")
os.environ.setdefault("QF_MAX_TRAINING_WINDOWS", "120")

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def wait(job_id: str, timeout: float = 180) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("completed", "failed"):
            return job
        time.sleep(0.2)
    raise TimeoutError(job_id)


def test_health_and_datasets():
    assert client.get("/api/health").json()["status"] == "ok"
    rows = client.get("/api/datasets").json()["datasets"]
    assert {r["id"] for r in rows} >= {"sp500", "nasdaq_tech", "crypto_vol", "synthetic_qcbm"}
    assert "kurtosis" in client.get("/api/datasets/sp500/preview").json()["stats"]


def test_validation_rejects_bad_config():
    assert client.post("/api/qrc/train", json={"n_qubits": 20}).status_code == 422
    assert client.post("/api/qrc/train", json={"measurement_basis": []}).status_code == 422


def test_train_compare_and_run():
    job = client.post("/api/qrc/train", json={"n_qubits": 4, "circuit_depth": 2, "measurement_basis": ["Z", "X"]}).json()
    done = wait(job["id"])
    assert done["status"] == "completed", done["error"]
    result = done["result"]
    assert len(result["forecast"]["actual"]) == len(result["forecast"]["predicted"])
    assert len(result["correlation_matrix"]) == 4

    comparison = client.get("/api/metrics/compare").json()
    assert comparison["models"][0]["quantum"] is True

    run = client.post("/api/backends/run", json={"backend_id": "local_statevector", "shots": 256}).json()
    finished = wait(run["id"])
    assert finished["status"] == "completed"
    assert sum(finished["result"]["counts"].values()) == 256


def test_classiq_falls_back_cleanly():
    job = client.post("/api/classiq/optimize", json={"n_qubits": 3, "circuit_depth": 2}).json()
    result = wait(job["id"])["result"]
    assert result["after"]["gate_count"] > 0


def test_portfolio_qaoa():
    job = client.post("/api/portfolio/optimize", json={"symbols": ["A", "B", "C", "D"], "budget": 2, "layers": 1}).json()
    result = wait(job["id"])["result"]
    assert len(result["selected_portfolio"]) == 2
