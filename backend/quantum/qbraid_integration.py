"""
Multi-backend execution through qBraid, with an always-available local statevector sampler.
"""

from __future__ import annotations

import importlib.util
import time
from typing import Callable

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

LOCAL_ID = "local_statevector"
LOCAL_BACKEND = {
    "id": LOCAL_ID,
    "name": "Local Statevector Simulator",
    "provider": "QuantumFlow",
    "status": "online",
    "qubits": 24,
    "queue_depth": 0,
    "source": "local",
}


def available() -> bool:
    return importlib.util.find_spec("qbraid") is not None


def _status(device) -> str:
    try:
        raw = device.status()
        value = str(getattr(raw, "name", raw)).lower()
    except Exception:
        return "unknown"
    if "online" in value:
        return "online"
    if "offline" in value or "retired" in value:
        return "offline"
    return "busy"


class QBraidRunner:
    def __init__(self, api_key: str | None) -> None:
        self.api_key = api_key
        self._provider = None
        self._cache: tuple[float, dict] | None = None

    def provider(self):
        if self._provider is None:
            from qbraid.runtime import QbraidProvider

            self._provider = QbraidProvider(api_key=self.api_key) if self.api_key else QbraidProvider()
        return self._provider

    def list_backends(self, refresh: bool = False) -> dict:
        if self._cache and not refresh and time.time() - self._cache[0] < 60:
            return self._cache[1]
        backends, error = [dict(LOCAL_BACKEND)], None
        if not available():
            error = "qBraid SDK not installed; only the local simulator is available."
        elif not self.api_key:
            error = "QBRAID_API_KEY is not set; only the local simulator is available."
        else:
            try:
                for device in self.provider().get_devices():
                    profile = getattr(device, "profile", None)
                    queue = None
                    try:
                        queue = device.queue_depth()
                    except Exception:
                        pass
                    backends.append(
                        {
                            "id": device.id,
                            "name": getattr(profile, "device_name", None) or device.id,
                            "provider": getattr(profile, "provider_name", None) or device.id.split("_")[0].upper(),
                            "status": _status(device),
                            "qubits": getattr(device, "num_qubits", None),
                            "queue_depth": queue,
                            "source": "qbraid",
                        }
                    )
            except Exception as exc:
                error = f"qBraid device listing failed: {exc}"
        payload = {"backends": backends, "error": error, "qbraid_connected": error is None}
        self._cache = (time.time(), payload)
        return payload

    def run(self, circuit: QuantumCircuit, backend_id: str, shots: int, report: Callable[[float, str], None], timeout_s: int) -> dict:
        started = time.time()
        if backend_id == LOCAL_ID:
            report(0.4, "Sampling local statevector")
            counts = Statevector(circuit.remove_final_measurements(inplace=False)).sample_counts(shots)
            return {"backend": backend_id, "source": "local", "shots": shots, "counts": {k: int(v) for k, v in counts.items()}, "cost": 0.0, "elapsed_s": round(time.time() - started, 3)}
        if not available() or not self.api_key:
            raise RuntimeError("qBraid is not configured. Install qbraid and set QBRAID_API_KEY, or use the local simulator.")
        device = self.provider().get_device(backend_id)
        job = device.run(circuit, shots=shots)
        report(0.2, f"Submitted to {backend_id}")
        while True:
            status = str(getattr(job.status(), "name", job.status())).upper()
            if status in ("COMPLETED", "DONE"):
                break
            if status in ("FAILED", "CANCELLED", "ERROR"):
                raise RuntimeError(f"qBraid job ended with status {status}")
            if time.time() - started > timeout_s:
                raise TimeoutError(f"qBraid job exceeded {timeout_s}s")
            report(0.5, f"{backend_id}: {status.lower()}")
            time.sleep(3)
        result = job.result()
        data = getattr(result, "data", result)
        counts = data.get_counts() if hasattr(data, "get_counts") else result.measurement_counts()
        return {"backend": backend_id, "source": "qbraid", "shots": shots, "counts": {str(k): int(v) for k, v in counts.items()}, "cost": None, "elapsed_s": round(time.time() - started, 2)}
