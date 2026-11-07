"""
Circuit synthesis/optimisation for the QRC reservoir.

Uses Classiq synthesis when the SDK is installed and authenticated; otherwise falls back
to Qiskit's level-3 transpiler and says so explicitly in the response.
"""

from __future__ import annotations

import importlib.util
from typing import Any

from qiskit import QuantumCircuit, transpile

BASIS = ["rz", "sx", "x", "cx"]


def available() -> bool:
    return importlib.util.find_spec("classiq") is not None


def _stats(qc: QuantumCircuit) -> dict:
    ops = qc.count_ops()
    return {"gate_count": int(qc.size()), "depth": int(qc.depth()), "two_qubit_gates": int(ops.get("cx", 0) + ops.get("cz", 0))}


def _classiq_synthesize(reservoir, optimize_for: str) -> dict:
    from classiq import CX, CZ, RX, RY, RZ, Constraints, Output, QArray, QBit, allocate, create_model, qfunc, synthesize

    n, depth = reservoir.n, reservoir.depth
    rot, ent, pairs = reservoir.rotation_angles, reservoir.entangle_angles, reservoir.pairs

    @qfunc
    def main(q: Output[QArray[QBit]]) -> None:  # type: ignore[valid-type]
        allocate(n, q)
        for layer in range(depth):
            for i in range(n):
                RX(float(rot[layer, i, 0]), q[i])
                RY(float(rot[layer, i, 1]), q[i])
                RZ(float(rot[layer, i, 2]), q[i])
            for k, (i, j) in enumerate(pairs):
                # Same as the Qiskit reservoir: CZ, then RZZ(θ) expressed as CX · RZ(θ) · CX.
                CZ(q[i], q[j])
                CX(q[i], q[j])
                RZ(float(ent[layer, k]), q[j])
                CX(q[i], q[j])

    model = create_model(main, constraints=Constraints(optimization_parameter=optimize_for))
    qprog = synthesize(model)
    circuit: Any = getattr(qprog, "transpiled_circuit", None)
    if circuit is None:  # older SDKs return a serialized program
        from classiq import QuantumProgram

        parsed = QuantumProgram.parse_raw(qprog) if isinstance(qprog, str) else QuantumProgram.from_qprog(qprog)
        circuit = parsed.transpiled_circuit
    ops = dict(getattr(circuit, "count_ops", {}) or {})
    return {
        "gate_count": int(sum(ops.values())) if ops else None,
        "depth": int(getattr(circuit, "depth", 0)) or None,
        "two_qubit_gates": int(ops.get("cx", 0) + ops.get("cz", 0)) if ops else None,
    }


def optimize_reservoir(reservoir, optimize_for: str = "depth") -> dict:
    reference = reservoir.template.assign_parameters({p: 0.3 for p in reservoir.template.parameters})
    before = _stats(transpile(reference, basis_gates=BASIS, optimization_level=0))
    engine, fallback_reason, after = "Classiq", None, None
    if available():
        try:
            after = _classiq_synthesize(reservoir, optimize_for)
        except Exception as exc:  # e.g. not authenticated / network
            fallback_reason = f"Classiq synthesis failed: {exc}"
    else:
        fallback_reason = "Classiq SDK not installed (pip install classiq, then classiq.authenticate())."
    if after is None or after.get("gate_count") is None:
        engine = "Qiskit transpiler (level 3)"
        after = _stats(transpile(reference, basis_gates=BASIS, optimization_level=3, seed_transpiler=7))

    def pct(a: int | None, b: int | None) -> float | None:
        return round((a - b) / a * 100, 1) if a and b is not None else None

    return {
        "engine": engine,
        "fallback_reason": fallback_reason,
        "optimize_for": optimize_for,
        "before": before,
        "after": after,
        "reduction_pct": {"gate_count": pct(before["gate_count"], after["gate_count"]), "depth": pct(before["depth"], after["depth"])},
    }
