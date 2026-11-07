"""HTTP routes. Heavy work is dispatched to the JobManager; clients poll /api/jobs/{id}."""

from __future__ import annotations

import importlib.util
import threading

import numpy as np
from fastapi import APIRouter, HTTPException, status

from api.models import BackendRunRequest, ClassiqRequest, DatasetUpload, PortfolioRequest, QCBMRequest, QRCTrainRequest
from config import settings
from data.fetcher import DatasetRegistry, PriceSeries, business_days, fetch_stock_data
from data.preprocessor import describe, downsample
from jobs import JobManager
from quantum import classiq_integration, qbraid_integration
from quantum.qcbm import QCBMConfig, QuantumCircuitBornMachine
from quantum.reservoir import FinancialQRC, QRCConfig, QuantumReservoir
from quantum.warm_start_qaoa import optimize_portfolio
from utils.metrics import compare_models

VERSION = "1.1.0"
router = APIRouter(prefix="/api")
jobs = JobManager(max_workers=settings.max_workers)
datasets = DatasetRegistry(settings.data_mode)
qbraid = qbraid_integration.QBraidRunner(settings.qbraid_api_key)


class ModelState:
    """Latest trained model, shared between request threads."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.qrc: FinancialQRC | None = None
        self.result: dict | None = None
        self.version = 0
        self.comparison: tuple[int, dict] | None = None


state = ModelState()


def _series(dataset_id: str) -> PriceSeries:
    try:
        return datasets.series(dataset_id)
    except KeyError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown dataset '{dataset_id}'")


def _require_model() -> FinancialQRC:
    with state.lock:
        if state.qrc is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "No trained model yet. POST /api/qrc/train first.")
        return state.qrc


@router.get("/health")
def health() -> dict:
    has = lambda name: importlib.util.find_spec(name) is not None  # noqa: E731
    return {
        "status": "ok",
        "version": VERSION,
        "data_mode": settings.data_mode,
        "model_trained": state.qrc is not None,
        "integrations": {
            "qiskit": True,
            "qiskit_aer": has("qiskit_aer"),
            "yfinance": has("yfinance"),
            "classiq": classiq_integration.available(),
            "qbraid": qbraid_integration.available() and bool(settings.qbraid_api_key),
        },
    }


# ---- datasets ------------------------------------------------------------------
def _dataset_summary(dataset_id: str) -> dict:
    meta = datasets.meta(dataset_id)
    try:
        series = datasets.series(dataset_id)
        return {**meta, "rows": len(series.values), "start": series.dates[0], "end": series.dates[-1], "source": series.source, "status": "ready"}
    except Exception as exc:
        return {**meta, "rows": None, "start": None, "end": None, "source": None, "status": "error", "error": str(exc)}


@router.get("/datasets")
def list_datasets() -> dict:
    return {"datasets": [_dataset_summary(i) for i in datasets.ids()]}


@router.get("/datasets/{dataset_id}/preview")
def dataset_preview(dataset_id: str) -> dict:
    series = _series(dataset_id)
    return {"id": dataset_id, "values": downsample(series.values, 60), "stats": describe(series.values), "source": series.source}


@router.post("/datasets", status_code=status.HTTP_201_CREATED)
def upload_dataset(body: DatasetUpload) -> dict:
    try:
        meta = datasets.add_upload(body.name, body.csv)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))
    return _dataset_summary(meta["id"])


# ---- QRC -----------------------------------------------------------------------
@router.post("/qrc/train", status_code=status.HTTP_202_ACCEPTED)
def train_qrc(body: QRCTrainRequest) -> dict:
    series = _series(body.dataset_id)
    if body.execution_backend and body.execution_backend != qbraid_integration.LOCAL_ID:
        known = {b["id"] for b in qbraid.list_backends()["backends"]}
        if body.execution_backend not in known:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Backend '{body.execution_backend}' is not available.")

    def work(report):
        config = QRCConfig(
            n_qubits=body.n_qubits,
            circuit_depth=body.circuit_depth,
            entanglement=body.entanglement,
            input_encoding=body.input_encoding,
            measurement_basis=list(body.measurement_basis),
            ridge_alpha=body.ridge_alpha,
            include_input=body.include_input,
            seed=body.seed,
        )
        model = FinancialQRC(config, window_size=body.window_size)
        result = model.train(
            series.dates, series.values, body.train_split, body.normalize, body.scale, settings.max_training_windows, report
        )
        result["dataset"] = {**datasets.meta(body.dataset_id), "source": series.source}
        if body.execution_backend:
            # Training uses exact simulation; the selected backend runs one verification circuit.
            report(0.96, f"Verification run on {body.execution_backend}")
            circuit = model.reservoir.measured_circuit(model.X_test[-1])
            result["verification"] = qbraid.run(circuit, body.execution_backend, 1024, report, settings.job_poll_timeout_s)
        with state.lock:
            state.qrc, state.result = model, result
            state.version += 1
        return result

    return jobs.submit("qrc_train", work, {"dataset_id": body.dataset_id, "n_qubits": body.n_qubits, "backend": body.execution_backend or "exact simulator", "algorithm": "QRC Forecast"})


@router.get("/qrc/latest")
def latest_model() -> dict:
    with state.lock:
        if state.result is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No trained model yet.")
        return state.result


@router.get("/metrics/compare")
def compare(noise_p: float = 0.01) -> dict:
    qrc = _require_model()
    with state.lock:
        cached = state.comparison
        version = state.version
    if cached and cached[0] == version:
        return cached[1]
    result = compare_models(qrc)
    clean = result["models"][0]["rmse"]
    noisy = qrc.noisy_rmse(noise_p)
    result["noise"] = {"model": "global depolarizing + 1024-shot sampling", "p": noise_p, "rmse_clean": clean, "rmse_noisy": noisy, "degradation_pct": (noisy - clean) / clean * 100 if clean else None}
    best_classical_rmse = next(r["rmse"] for r in result["models"] if r["model"] == result["best_classical"])
    result["noise"]["advantage_retained"] = noisy < best_classical_rmse
    with state.lock:
        state.comparison = (version, result)
    return result


# ---- Classiq ---------------------------------------------------------------------
@router.post("/classiq/optimize", status_code=status.HTTP_202_ACCEPTED)
def classiq_optimize(body: ClassiqRequest) -> dict:
    def work(report):
        report(0.1, "Building reservoir")
        reservoir = QuantumReservoir(
            QRCConfig(n_qubits=body.n_qubits, circuit_depth=body.circuit_depth, entanglement=body.entanglement, input_encoding=body.input_encoding, seed=body.seed)
        )
        report(0.3, "Synthesizing circuit")
        return classiq_integration.optimize_reservoir(reservoir, body.optimize_for)

    return jobs.submit("classiq_optimize", work, {"n_qubits": body.n_qubits, "backend": "Classiq synthesis", "algorithm": "Circuit synthesis"})


# ---- backends / qBraid ------------------------------------------------------------
@router.get("/backends")
def backends(refresh: bool = False) -> dict:
    return qbraid.list_backends(refresh)


@router.post("/backends/run", status_code=status.HTTP_202_ACCEPTED)
def run_on_backend(body: BackendRunRequest) -> dict:
    qrc = _require_model()
    known = {b["id"]: b for b in qbraid.list_backends()["backends"]}
    if body.backend_id not in known:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Backend '{body.backend_id}' is not available.")
    if known[body.backend_id]["status"] == "offline":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Backend '{body.backend_id}' is offline.")
    circuit = qrc.reservoir.measured_circuit(qrc.X_test[-1])
    return jobs.submit(
        "backend_run",
        lambda report: qbraid.run(circuit, body.backend_id, body.shots, report, settings.job_poll_timeout_s),
        {"backend": body.backend_id, "n_qubits": qrc.reservoir.n, "shots": body.shots, "algorithm": "QRC Forecast"},
    )


# ---- QCBM + QAOA ------------------------------------------------------------------
@router.post("/qcbm/generate", status_code=status.HTTP_202_ACCEPTED)
def qcbm_generate(body: QCBMRequest) -> dict:
    series = _series(body.dataset_id)

    def work(report):
        returns = np.diff(series.values) / series.values[:-1]
        qcbm = QuantumCircuitBornMachine(QCBMConfig(n_qubits=body.n_qubits, circuit_depth=body.circuit_depth, n_epochs=body.n_epochs))
        qcbm.train(returns, report)
        synthetic = qcbm.sample(body.n_samples)
        if body.publish_dataset:
            prices = series.values[0] * np.cumprod(1 + synthetic)
            datasets.set_series("synthetic_qcbm", PriceSeries(business_days(len(prices)), prices, "qcbm"))
        return {
            "synthetic_returns": synthetic[:2000].tolist(),
            "loss_history": qcbm.loss_history,
            "final_mmd": qcbm.loss_history[-1],
            "real_stats": describe(series.values),
            "synthetic_mean": float(synthetic.mean()),
            "synthetic_std": float(synthetic.std()),
        }

    return jobs.submit("qcbm_generate", work, {"dataset_id": body.dataset_id, "n_qubits": body.n_qubits, "backend": "exact simulator", "algorithm": "QCBM"})


@router.post("/portfolio/optimize", status_code=status.HTTP_202_ACCEPTED)
def portfolio(body: PortfolioRequest) -> dict:
    def work(report):
        report(0.05, "Loading price history")
        prices = [fetch_stock_data(s, "1y", settings.data_mode).values for s in body.symbols]
        length = min(len(p) for p in prices)
        rets = np.array([np.diff(p[-length:]) / p[-length:-1] for p in prices])
        mu, sigma = rets.mean(axis=1) * 252, np.cov(rets) * 252
        result = optimize_portfolio(mu, sigma, body.budget, body.risk_aversion, body.layers, body.warm_start, report=report)
        return {**result, "selected_portfolio": [body.symbols[i] for i in result["selected_assets"]], "symbols": body.symbols, "expected_returns": mu.tolist(), "covariance": sigma.tolist()}

    return jobs.submit("portfolio_qaoa", work, {"n_qubits": len(body.symbols), "backend": "exact simulator", "algorithm": "Warm-start QAOA"})


# ---- jobs ---------------------------------------------------------------------------
@router.get("/jobs")
def list_jobs(limit: int = 50) -> dict:
    return {"jobs": jobs.list(min(max(limit, 1), 200))}


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return job
