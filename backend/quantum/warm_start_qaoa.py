"""
Warm-start QAOA for cardinality-constrained portfolio selection.

    minimise  -μᵀx + q·xᵀΣx + P·(Σx - B)²,  x ∈ {0,1}ⁿ

The cost is diagonal, so the phase separator is applied exactly. With warm start, the
initial state and mixer follow Egger et al. (2021): a continuous relaxation c* sets
θᵢ = 2·arcsin(√cᵢ*), the initial state is ⊗ RY(θᵢ)|0⟩ and the mixer is RY(θ)RZ(-2β)RY(-θ).
"""

from __future__ import annotations

from typing import Callable

import numpy as np
from scipy.optimize import minimize


def _apply_1q(state: np.ndarray, gate: np.ndarray, qubit: int, n: int) -> np.ndarray:
    psi = state.reshape([2] * n)
    axis = n - 1 - qubit  # little-endian: qubit 0 is the least significant bit
    psi = np.moveaxis(np.tensordot(gate, psi, axes=([1], [axis])), 0, axis)
    return psi.reshape(-1)


def _ry(theta: float) -> np.ndarray:
    c, s = np.cos(theta / 2), np.sin(theta / 2)
    return np.array([[c, -s], [s, c]], dtype=complex)


def _rz(theta: float) -> np.ndarray:
    return np.diag([np.exp(-1j * theta / 2), np.exp(1j * theta / 2)])


def _rx(theta: float) -> np.ndarray:
    c, s = np.cos(theta / 2), np.sin(theta / 2)
    return np.array([[c, -1j * s], [-1j * s, c]])


def optimize_portfolio(
    mu: np.ndarray,
    sigma: np.ndarray,
    budget: int,
    risk_aversion: float = 0.5,
    layers: int = 2,
    warm_start: bool = True,
    seed: int = 11,
    report: Callable[[float, str], None] | None = None,
) -> dict:
    n = len(mu)
    if not 2 <= n <= 12 or not 1 <= budget < n:
        raise ValueError("Use 2-12 assets and 1 <= budget < number of assets.")
    scale = max(np.abs(mu).max(), 1e-12)
    mu_s, sigma_s = mu / scale, sigma / scale
    penalty = 2.0 * (np.abs(mu_s).sum() + risk_aversion * np.abs(sigma_s).sum()) + 1.0

    idx = np.arange(2**n)
    bits = ((idx[:, None] >> np.arange(n)[None, :]) & 1).astype(float)
    energies = -bits @ mu_s + risk_aversion * np.einsum("ki,ij,kj->k", bits, sigma_s, bits) + penalty * (bits.sum(1) - budget) ** 2

    if warm_start:
        relaxed = minimize(
            lambda c: -c @ mu_s + risk_aversion * c @ sigma_s @ c,
            np.full(n, budget / n),
            bounds=[(0, 1)] * n,
            constraints=[{"type": "eq", "fun": lambda c: c.sum() - budget}],
            method="SLSQP",
        ).x
        c_star = np.clip(relaxed, 0.05, 0.95)  # regularised so the mixer can still move amplitude
        thetas = 2 * np.arcsin(np.sqrt(c_star))
    else:
        c_star, thetas = np.full(n, 0.5), np.full(n, np.pi / 2)

    def initial_state() -> np.ndarray:
        psi = np.zeros(2**n, dtype=complex)
        psi[0] = 1
        for q in range(n):
            psi = _apply_1q(psi, _ry(thetas[q]), q, n)
        return psi

    def evolve(params: np.ndarray) -> np.ndarray:
        betas, gammas = params[:layers], params[layers:]
        psi = initial_state()
        for p in range(layers):
            psi = psi * np.exp(-1j * gammas[p] * energies)
            for q in range(n):
                mixer = _ry(thetas[q]) @ _rz(-2 * betas[p]) @ _ry(-thetas[q]) if warm_start else _rx(2 * betas[p])
                psi = _apply_1q(psi, mixer, q, n)
        return psi

    def expectation(params: np.ndarray) -> float:
        return float(np.abs(evolve(params)) ** 2 @ energies)

    rng = np.random.default_rng(seed)
    best = None
    restarts = 4
    for r in range(restarts):
        x0 = np.concatenate([rng.uniform(0, np.pi / 2, layers), rng.uniform(0, np.pi / 4, layers)])
        res = minimize(expectation, x0, method="COBYLA", options={"maxiter": 200, "rhobeg": 0.3})
        if best is None or res.fun < best.fun:
            best = res
        if report:
            report((r + 1) / restarts, f"COBYLA restart {r + 1}/{restarts} · ⟨H⟩={res.fun:.4f}")

    probs = np.abs(evolve(best.x)) ** 2
    feasible = bits.sum(1) == budget
    optimum = int(np.argmin(np.where(feasible, energies, np.inf)))
    chosen = int(np.argmax(np.where(feasible, probs, -1)))
    top = np.argsort(probs)[::-1][:8]
    to_bits = lambda k: format(k, f"0{n}b")  # noqa: E731 - qubit 0 is the rightmost character
    return {
        "selected_assets": [i for i in range(n) if bits[chosen, i]],
        "bitstring": to_bits(chosen),
        "optimal_bitstring": to_bits(optimum),
        "found_optimum": chosen == optimum,
        "probability_of_optimum": float(probs[optimum]),
        "feasible_probability": float(probs[feasible].sum()),
        "expected_energy": float(best.fun),
        "approximation_ratio": float(energies[optimum] / best.fun) if best.fun < 0 and energies[optimum] < 0 else None,
        "top_states": {to_bits(int(k)): float(probs[k]) for k in top},
        "betas": best.x[:layers].tolist(),
        "gammas": best.x[layers:].tolist(),
        "warm_start_used": warm_start,
        "relaxed_solution": c_star.tolist(),
    }
