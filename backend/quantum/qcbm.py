"""
Quantum Circuit Born Machine (QCBM) for synthetic financial return distributions.

Exact statevector probabilities, a multi-bandwidth Gaussian-kernel MMD loss, and
gradients via the parameter-shift rule applied to the Born probabilities:
    dp/dθ = (p(θ + π/2) - p(θ - π/2)) / 2,   dL/dθ = 2 (p - t)ᵀ K dp/dθ
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector


@dataclass
class QCBMConfig:
    n_qubits: int = 6
    circuit_depth: int = 3
    learning_rate: float = 0.08
    n_epochs: int = 60
    bandwidths: tuple[float, ...] = (0.05, 0.1, 0.25)
    seed: int = 7


class QuantumCircuitBornMachine:
    def __init__(self, config: QCBMConfig) -> None:
        if not 2 <= config.n_qubits <= 10:
            raise ValueError("n_qubits must be between 2 and 10")
        self.config = config
        self.n = config.n_qubits
        self.rng = np.random.default_rng(config.seed)
        self.params = self.rng.uniform(0, 2 * np.pi, config.circuit_depth * self.n * 2)
        grid = np.linspace(0, 1, 2**self.n)
        diff = (grid[:, None] - grid[None, :]) ** 2
        self.kernel = np.mean([np.exp(-diff / (2 * s**2)) for s in config.bandwidths], axis=0)
        self.loss_history: list[float] = []
        self.lo, self.hi = 0.0, 1.0

    def circuit(self, params: np.ndarray) -> QuantumCircuit:
        qc = QuantumCircuit(self.n)
        k = 0
        for _ in range(self.config.circuit_depth):
            for q in range(self.n):
                qc.ry(params[k], q)
                qc.rz(params[k + 1], q)
                k += 2
            for q in range(self.n - 1):
                qc.cz(q, q + 1)
        return qc

    def probabilities(self, params: np.ndarray | None = None) -> np.ndarray:
        return Statevector(self.circuit(self.params if params is None else params)).probabilities()

    def mmd(self, p: np.ndarray, t: np.ndarray) -> float:
        d = p - t
        return float(d @ self.kernel @ d)

    def gradient(self, target: np.ndarray) -> np.ndarray:
        p = self.probabilities()
        weight = 2 * (p - target) @ self.kernel
        grad = np.zeros_like(self.params)
        for i in range(len(self.params)):
            plus, minus = self.params.copy(), self.params.copy()
            plus[i] += np.pi / 2
            minus[i] -= np.pi / 2
            grad[i] = weight @ ((self.probabilities(plus) - self.probabilities(minus)) / 2)
        return grad

    def train(self, data: np.ndarray, report: Callable[[float, str], None] | None = None) -> "QuantumCircuitBornMachine":
        self.lo, self.hi = float(np.percentile(data, 0.5)), float(np.percentile(data, 99.5))
        hist, _ = np.histogram(np.clip(data, self.lo, self.hi), bins=2**self.n, range=(self.lo, self.hi))
        target = hist / hist.sum()
        m, v = np.zeros_like(self.params), np.zeros_like(self.params)  # Adam
        for epoch in range(1, self.config.n_epochs + 1):
            g = self.gradient(target)
            m = 0.9 * m + 0.1 * g
            v = 0.999 * v + 0.001 * g**2
            self.params -= self.config.learning_rate * (m / (1 - 0.9**epoch)) / (np.sqrt(v / (1 - 0.999**epoch)) + 1e-8)
            loss = self.mmd(self.probabilities(), target)
            self.loss_history.append(loss)
            if report:
                report(epoch / self.config.n_epochs, f"Epoch {epoch}/{self.config.n_epochs} · MMD {loss:.5f}")
        self.target = target
        return self

    def sample(self, n_samples: int) -> np.ndarray:
        bins = self.rng.choice(2**self.n, size=n_samples, p=self.probabilities())
        width = (self.hi - self.lo) / 2**self.n
        return self.lo + (bins + self.rng.uniform(0, 1, n_samples)) * width
