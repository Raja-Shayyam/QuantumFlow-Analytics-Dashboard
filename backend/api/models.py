"""Validated request schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class QRCTrainRequest(BaseModel):
    dataset_id: str = "sp500"
    n_qubits: int = Field(6, ge=2, le=12)
    circuit_depth: int = Field(4, ge=1, le=10)
    entanglement: Literal["full", "linear", "ring", "custom"] = "full"
    input_encoding: Literal["angle", "amplitude", "basis"] = "angle"
    measurement_basis: list[Literal["X", "Y", "Z"]] = Field(default_factory=lambda: ["Z"], min_length=1)
    window_size: int = Field(10, ge=4, le=60)
    train_split: float = Field(0.8, ge=0.5, le=0.95)
    normalize: bool = True
    scale: bool = False
    ridge_alpha: float = Field(1.0, gt=0, le=1000)
    include_input: bool = Field(True, description="Feed the raw input window to the readout alongside quantum features.")
    seed: int = 42
    execution_backend: str | None = Field(None, description="Optional backend for a post-training verification run.")

    @model_validator(mode="after")
    def _unique_bases(self) -> "QRCTrainRequest":
        self.measurement_basis = sorted(set(self.measurement_basis))  # type: ignore[assignment]
        return self


class ClassiqRequest(BaseModel):
    n_qubits: int = Field(6, ge=2, le=12)
    circuit_depth: int = Field(4, ge=1, le=10)
    entanglement: Literal["full", "linear", "ring", "custom"] = "full"
    input_encoding: Literal["angle", "amplitude", "basis"] = "angle"
    optimize_for: Literal["depth", "width", "cx"] = "depth"
    seed: int = 42


class BackendRunRequest(BaseModel):
    backend_id: str = "local_statevector"
    shots: int = Field(1024, ge=1, le=100_000)


class DatasetUpload(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    # csv: str = Field(..., min_length=10, max_length=5_000_000)
    csv: str = Field(..., min_length=10)

class QCBMRequest(BaseModel):
    dataset_id: str = "sp500"
    n_qubits: int = Field(6, ge=2, le=10)
    circuit_depth: int = Field(3, ge=1, le=8)
    n_epochs: int = Field(60, ge=5, le=300)
    n_samples: int = Field(1000, ge=10, le=50_000)
    publish_dataset: bool = True


class PortfolioRequest(BaseModel):
    symbols: list[str] = Field(default_factory=lambda: ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"], min_length=2, max_length=12)
    budget: int = Field(3, ge=1)
    risk_aversion: float = Field(0.5, ge=0, le=10)
    layers: int = Field(2, ge=1, le=6)
    warm_start: bool = True

    @model_validator(mode="after")
    def _budget(self) -> "PortfolioRequest":
        if self.budget >= len(self.symbols):
            raise ValueError("budget must be smaller than the number of symbols")
        return self
