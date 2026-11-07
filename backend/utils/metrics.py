"""Classical baselines evaluated on exactly the same windows and split as the QRC model."""

from __future__ import annotations

import time

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.neural_network import MLPRegressor


def _row(name: str, y_true: np.ndarray, y_pred: np.ndarray, train_s: float, infer_ms: float, quantum: bool = False) -> dict:
    return {
        "model": name,
        "quantum": quantum,
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "r2": float(r2_score(y_true, y_pred)),
        "train_time_s": float(train_s),
        "inference_ms": float(infer_ms),
    }


def compare_models(qrc) -> dict:
    """`qrc` is a trained FinancialQRC instance."""
    X_tr, y_tr, X_te, y_te = qrc.X_train, qrc.y_train, qrc.X_test, qrc.y_test
    rows = [_row("Quantum Reservoir (Ours)", y_te, qrc.y_pred, qrc.metrics["train_time_s"], qrc.metrics["inference_ms"], True)]
    predictions = {"qrc": qrc.y_pred}
    baselines = {
        "Classical MLP": MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=800, early_stopping=True, random_state=7),
        "Linear AR (Ridge)": Ridge(alpha=1.0),
        "Random Forest": RandomForestRegressor(n_estimators=200, random_state=7, n_jobs=-1),
    }
    for name, model in baselines.items():
        t0 = time.perf_counter()
        model.fit(X_tr, y_tr)
        train_s = time.perf_counter() - t0
        t1 = time.perf_counter()
        pred = model.predict(X_te)
        infer_ms = (time.perf_counter() - t1) / max(1, len(X_te)) * 1000
        rows.append(_row(name, y_te, pred, train_s, infer_ms))
        predictions[name] = pred
    rows.append(_row("Persistence (naive)", y_te, X_te[:, -1], 0.0, 0.0))

    best_classical = min((r for r in rows[1:]), key=lambda r: r["rmse"])
    qrc_row = rows[0]
    # Quantum advantage zones: rolling windows where QRC absolute error beats the best classical model.
    best_pred = predictions.get(best_classical["model"], X_te[:, -1])
    q_err = np.abs(qrc.y_pred - y_te)
    c_err = np.abs(best_pred - y_te)
    kernel = np.ones(5) / 5
    advantage = (np.convolve(q_err, kernel, "same") < np.convolve(c_err, kernel, "same")).tolist()
    tail = slice(-60, None)
    return {
        "models": rows,
        "best_classical": best_classical["model"],
        "error_reduction_pct": float((best_classical["rmse"] - qrc_row["rmse"]) / best_classical["rmse"] * 100),
        "inference_speedup": float(best_classical["inference_ms"] / qrc_row["inference_ms"]) if qrc_row["inference_ms"] else None,
        "series": {
            "dates": qrc.test_dates[tail],
            "actual": qrc.scaler.inverse(y_te)[tail].tolist(),
            "qrc": qrc.scaler.inverse(qrc.y_pred)[tail].tolist(),
            "classical": qrc.scaler.inverse(best_pred)[tail].tolist(),
            "advantage": advantage[tail],
        },
    }
