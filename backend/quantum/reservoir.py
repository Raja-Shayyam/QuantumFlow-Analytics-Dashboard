"""
Quantum Reservoir Computing (QRC) for financial time-series forecasting.

The quantum circuit is a fixed, randomly-initialised reservoir; only the classical ridge
readout is trained, so there is no gradient through the circuit and no barren plateau.
Expectation values are computed exactly from the statevector; finite shots and
depolarising noise can be modelled on top for robustness studies.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from qiskit import QuantumCircuit
from qiskit.circuit import ParameterVector
from qiskit.quantum_info import Statevector
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import StandardScaler

from data.preprocessor import SeriesScaler, make_windows

ENTANGLEMENTS = ("full", "linear", "ring", "custom")
ENCODINGS = ("angle", "amplitude", "basis")


@dataclass
class QRCConfig:
    n_qubits: int = 6
    circuit_depth: int = 4
    entanglement: str = "full"
    input_encoding: str = "angle"
    measurement_basis: list[str] = field(default_factory=lambda: ["X", "Y", "Z"])
    ridge_alpha: float = 1.0
    include_input: bool = True  # linear skip connection from the input window to the readout
    seed: int = 42

    def validate(self) -> None:
        if not 2 <= self.n_qubits <= 12:
            raise ValueError("n_qubits must be between 2 and 12")
        if not 1 <= self.circuit_depth <= 10:
            raise ValueError("circuit_depth must be between 1 and 10")
        if self.entanglement not in ENTANGLEMENTS:
            raise ValueError(f"entanglement must be one of {ENTANGLEMENTS}")
        if self.input_encoding not in ENCODINGS:
            raise ValueError(f"input_encoding must be one of {ENCODINGS}")
        if not self.measurement_basis or any(b not in ("X", "Y", "Z") for b in self.measurement_basis):
            raise ValueError("measurement_basis must be a non-empty subset of X, Y, Z")


class QuantumReservoir:
    def __init__(self, config: QRCConfig) -> None:
        config.validate()
        self.config = config
        self.n = config.n_qubits
        self.depth = config.circuit_depth
        rng = np.random.default_rng(config.seed)
        self.pairs = self._pairs(rng)
        self.rotation_angles = rng.uniform(0, 2 * np.pi, size=(self.depth, self.n, 3))
        self.entangle_angles = rng.uniform(0, 2 * np.pi, size=(self.depth, len(self.pairs)))
        self.inputs = ParameterVector("x", self.n)
        self.template = self._build_template()
        self._basis_changes = {b: self._basis_change(b) for b in config.measurement_basis}
        idx = np.arange(2**self.n)
        self._signs = 1 - 2 * ((idx[:, None] >> np.arange(self.n)[None, :]) & 1)  # Z eigenvalues, little-endian
        self.zz_pairs = [(i, j) for i in range(self.n) for j in range(i + 1, self.n)]

    # ---- circuit construction -------------------------------------------------
    def _pairs(self, rng: np.random.Generator) -> list[tuple[int, int]]:
        n, strategy = self.n, self.config.entanglement
        if strategy == "full":
            return [(i, j) for i in range(n) for j in range(i + 1, n)]
        if strategy == "linear":
            return [(i, i + 1) for i in range(n - 1)]
        if strategy == "ring":
            return [(i, (i + 1) % n) for i in range(n)] if n > 2 else [(0, 1)]
        # custom: linear backbone plus a seeded random subset of long-range couplings
        extra = [(i, j) for i in range(n) for j in range(i + 2, n)]
        chosen = [extra[k] for k in sorted(rng.choice(len(extra), size=len(extra) // 2, replace=False))] if extra else []
        return [(i, i + 1) for i in range(n - 1)] + chosen

    def _build_template(self) -> QuantumCircuit:
        qc = QuantumCircuit(self.n, name="qrc_reservoir")
        for layer in range(self.depth):
            # Data re-uploading: angle/basis inputs are encoded before every reservoir layer.
            if self.config.input_encoding in ("angle", "basis"):
                for q in range(self.n):
                    if self.config.input_encoding == "angle":
                        qc.ry(np.pi * self.inputs[q], q)
                    elif layer == 0:
                        qc.rx(np.pi * self.inputs[q], q)  # inputs are 0/1 bits -> X or identity
            for q in range(self.n):
                rx, ry, rz = self.rotation_angles[layer, q]
                qc.rx(rx, q)
                qc.ry(ry, q)
                qc.rz(rz, q)
            for k, (i, j) in enumerate(self.pairs):
                qc.cz(i, j)
                qc.rzz(self.entangle_angles[layer, k], i, j)
        return qc

    def _basis_change(self, basis: str) -> QuantumCircuit | None:
        if basis == "Z":
            return None
        qc = QuantumCircuit(self.n)
        for q in range(self.n):
            if basis == "Y":
                qc.sdg(q)
            qc.h(q)
        return qc

    # ---- encoding + features ----------------------------------------------------
    def _compress(self, window: np.ndarray, size: int) -> np.ndarray:
        if len(window) == size:
            return window
        return np.interp(np.linspace(0, len(window) - 1, size), np.arange(len(window)), window)

    def state(self, window: np.ndarray) -> Statevector:
        if self.config.input_encoding == "amplitude":
            vec = self._compress(window, 2**self.n)
            vec = vec - vec.min() + 1e-3  # strictly positive so the shape of the window is encoded
            return Statevector(vec / np.linalg.norm(vec)).evolve(self.template)
        x = self._compress(window, self.n)
        if self.config.input_encoding == "basis":
            x = (x > np.median(x)).astype(float)
        else:
            x = np.tanh(x)  # bounded rotation angles in (-pi, pi)
        bound = self.template.assign_parameters(dict(zip(self.inputs, x)))
        return Statevector(bound)

    def features(
        self,
        window: np.ndarray,
        noise_p: float = 0.0,
        shots: int | None = None,
        rng: np.random.Generator | None = None,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Returns (feature vector, per-qubit Z expectations)."""
        psi = self.state(window)
        feats: list[float] = []
        z_exp = None
        for basis in self.config.measurement_basis:
            change = self._basis_changes[basis]
            probs = (psi.evolve(change) if change is not None else psi).probabilities()
            single = probs @ self._signs
            if basis == "Z":
                z_exp = single
                pairs = np.array([probs @ (self._signs[:, i] * self._signs[:, j]) for i, j in self.zz_pairs])
                single = np.concatenate([single, pairs])
            feats.extend(single)
        values = np.asarray(feats)
        if noise_p > 0:
            # Global depolarising approximation: each two-qubit layer contracts expectations by (1 - p).
            values = values * (1 - noise_p) ** (self.depth * max(1, len(self.pairs) // self.n + 1))
        if shots:
            rng = rng or np.random.default_rng(0)
            p1 = np.clip((1 - values) / 2, 0, 1)
            values = 1 - 2 * rng.binomial(shots, p1) / shots
        if z_exp is None:
            z_exp = values[: self.n]
        if self.config.include_input:
            values = np.concatenate([values, self._compress(window, self.n)])
        return values, z_exp

    # ---- metadata ---------------------------------------------------------------
    def circuit_stats(self) -> dict:
        ops = {k: int(v) for k, v in self.template.count_ops().items()}
        return {
            "gate_count": int(self.template.size()),
            "depth": int(self.template.depth()),
            "two_qubit_gates": int(ops.get("cz", 0) + ops.get("rzz", 0)),
            "ops": ops,
        }

    def gate_layout(self) -> list[list[str]]:
        """Dominant rotation (largest |sin(angle/2)|) per qubit per layer, for the dashboard visualiser."""
        labels = ("Rx", "Ry", "Rz")
        return [
            [labels[int(np.argmax(np.abs(np.sin(self.rotation_angles[layer, q] / 2))))] for layer in range(self.depth)]
            for q in range(self.n)
        ]

    def qasm(self) -> str | None:
        try:
            from qiskit import qasm2

            return qasm2.dumps(self.template.assign_parameters({p: 0.0 for p in self.template.parameters}))
        except Exception:
            return None

    def measured_circuit(self, window: np.ndarray) -> QuantumCircuit:
        """Concrete circuit for hardware execution (angle/basis-bound, with measurements)."""
        if self.config.input_encoding == "amplitude":
            qc = QuantumCircuit(self.n)
            vec = self._compress(window, 2**self.n)
            vec = vec - vec.min() + 1e-3
            qc.initialize(vec / np.linalg.norm(vec), range(self.n))
            qc.compose(self.template, inplace=True)
        else:
            x = self._compress(window, self.n)
            x = (x > np.median(x)).astype(float) if self.config.input_encoding == "basis" else np.tanh(x)
            qc = self.template.assign_parameters(dict(zip(self.inputs, x)))
        qc.measure_all()
        return qc


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    return {
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "r2": float(r2_score(y_true, y_pred)),
    }


class FinancialQRC:
    """Windowing, leakage-free scaling, training, evaluation and dashboard payloads."""

    def __init__(self, config: QRCConfig, window_size: int = 10, horizon: int = 1) -> None:
        self.config = config
        self.window_size = window_size
        self.horizon = horizon
        self.reservoir = QuantumReservoir(config)
        self.feature_scaler = StandardScaler()
        self.readout = Ridge(alpha=config.ridge_alpha)

    def _featurize(self, X: np.ndarray, report: Callable[[float, str], None] | None, start: float, span: float, label: str, **kw) -> tuple[np.ndarray, np.ndarray]:
        feats, zs = [], []
        for i, window in enumerate(X):
            f, z = self.reservoir.features(window, **kw)
            feats.append(f)
            zs.append(z)
            if report and i % 25 == 0:
                report(start + span * i / len(X), f"{label} {i}/{len(X)}")
        return np.asarray(feats), np.asarray(zs)

    def train(
        self,
        dates: list[str],
        values: np.ndarray,
        train_split: float = 0.8,
        normalize: bool = True,
        scale: bool = False,
        max_windows: int = 500,
        report: Callable[[float, str], None] | None = None,
    ) -> dict:
        values = np.asarray(values, dtype=float)
        keep = max_windows + self.window_size + self.horizon - 1
        values, dates = values[-keep:], list(dates)[-keep:]
        split_value_idx = int(len(values) * train_split)
        if split_value_idx <= self.window_size + 10 or len(values) - split_value_idx < 10:
            raise ValueError("Not enough data for this window size and train/test split.")

        self.scaler = SeriesScaler(normalize=normalize, scale=scale).fit(values[:split_value_idx])  # no test leakage
        X, y = make_windows(self.scaler.transform(values), self.window_size, self.horizon)
        target_idx = np.arange(len(y)) + self.window_size + self.horizon - 1
        train_mask = target_idx < split_value_idx
        self.X_train, self.X_test = X[train_mask], X[~train_mask]
        self.y_train, self.y_test = y[train_mask], y[~train_mask]
        self.test_dates = [dates[i] for i in target_idx[~train_mask]]

        t0 = time.perf_counter()
        F_train, _ = self._featurize(self.X_train, report, 0.05, 0.6, "Reservoir features (train)")
        self.feature_scaler.fit(F_train)
        self.readout.fit(self.feature_scaler.transform(F_train), self.y_train)
        train_time = time.perf_counter() - t0

        t1 = time.perf_counter()
        F_test, Z_test = self._featurize(self.X_test, report, 0.65, 0.3, "Inference (test)")
        y_pred = self.readout.predict(self.feature_scaler.transform(F_test))
        inference_ms = (time.perf_counter() - t1) / max(1, len(self.X_test)) * 1000
        self.y_pred = y_pred
        self.F_test = F_test

        train_pred = self.readout.predict(self.feature_scaler.transform(F_train))
        actual = self.scaler.inverse(self.y_test)
        predicted = self.scaler.inverse(y_pred)
        residual_std = float(np.std(self.scaler.inverse(self.y_train) - self.scaler.inverse(train_pred)))
        prev = self.scaler.inverse(self.X_test[:, -1])
        direction = float(np.mean(np.sign(predicted - prev) == np.sign(actual - prev)))
        corr = np.nan_to_num(np.corrcoef(Z_test.T)) if len(Z_test) > 2 else np.eye(self.reservoir.n)

        self.metrics = {
            **{f"test_{k}": v for k, v in _metrics(self.y_test, y_pred).items()},
            **{f"price_{k}": v for k, v in _metrics(actual, predicted).items()},
            "train_r2": float(r2_score(self.y_train, train_pred)),
            "test_mse": float(mean_squared_error(self.y_test, y_pred)),
            "directional_accuracy": direction,
            "train_time_s": train_time,
            "inference_ms": inference_ms,
            "train_samples": int(len(self.y_train)),
            "test_samples": int(len(self.y_test)),
            "feature_dimension": int(F_train.shape[1]),
        }
        tail = slice(-60, None)
        return {
            "metrics": self.metrics,
            "config": {**self.config.__dict__, "window_size": self.window_size, "horizon": self.horizon, "train_split": train_split, "normalize": normalize, "scale": scale},
            "forecast": {
                "dates": self.test_dates[tail],
                "actual": actual[tail].tolist(),
                "predicted": predicted[tail].tolist(),
                "lower": (predicted[tail] - 1.96 * residual_std).tolist(),
                "upper": (predicted[tail] + 1.96 * residual_std).tolist(),
            },
            "circuit": {**self.reservoir.circuit_stats(), "layout": self.reservoir.gate_layout(), "pairs": self.reservoir.pairs, "qasm": self.reservoir.qasm()},
            "correlation_matrix": np.round(corr, 4).tolist(),
        }

    def noisy_rmse(self, noise_p: float = 0.01, shots: int = 1024) -> float:
        rng = np.random.default_rng(self.config.seed)
        F_noisy, _ = self._featurize(self.X_test, None, 0, 0, "", noise_p=noise_p, shots=shots, rng=rng)
        pred = self.readout.predict(self.feature_scaler.transform(F_noisy))
        return float(np.sqrt(mean_squared_error(self.y_test, pred)))
