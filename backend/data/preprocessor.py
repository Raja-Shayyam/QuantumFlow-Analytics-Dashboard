"""Windowing and leakage-free scaling."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import stats


@dataclass
class SeriesScaler:
    """Fitted on training data only. `normalize` = z-score, `scale` = min-max to [-1, 1]."""

    normalize: bool = True
    scale: bool = False
    mean: float = 0.0
    std: float = 1.0
    lo: float = -1.0
    hi: float = 1.0
    abs_max: float = 1.0

    def fit(self, values: np.ndarray) -> "SeriesScaler":
        self.mean, self.std = float(values.mean()), float(values.std() or 1.0)
        z = (values - self.mean) / self.std if self.normalize else values
        self.lo, self.hi = float(z.min()), float(z.max())
        self.abs_max = float(np.abs(z).max() or 1.0)
        return self

    def transform(self, values: np.ndarray) -> np.ndarray:
        z = (values - self.mean) / self.std if self.normalize else values
        if self.scale:
            return 2 * (z - self.lo) / ((self.hi - self.lo) or 1.0) - 1
        # Without explicit scaling, bound by the training max so angle encodings stay well-defined.
        return z if self.normalize else z / self.abs_max

    def inverse(self, values: np.ndarray) -> np.ndarray:
        if self.scale:
            z = (values + 1) / 2 * ((self.hi - self.lo) or 1.0) + self.lo
        else:
            z = values if self.normalize else values * self.abs_max
        return z * self.std + self.mean if self.normalize else z


def make_windows(values: np.ndarray, window: int, horizon: int = 1) -> tuple[np.ndarray, np.ndarray]:
    count = len(values) - window - horizon + 1
    if count <= 0:
        raise ValueError("Series is shorter than the configured window.")
    X = np.stack([values[i : i + window] for i in range(count)])
    y = np.array([values[i + window + horizon - 1] for i in range(count)])
    return X, y


def describe(values: np.ndarray) -> dict:
    returns = np.diff(values) / np.where(values[:-1] == 0, 1, values[:-1])
    return {
        "mean": float(np.mean(returns)),
        "std": float(np.std(returns)),
        "skewness": float(stats.skew(returns)),
        "kurtosis": float(stats.kurtosis(returns, fisher=False)),
    }


def downsample(values: np.ndarray, points: int = 60) -> list[float]:
    if len(values) <= points:
        return [float(v) for v in values]
    idx = np.linspace(0, len(values) - 1, points).round().astype(int)
    return [float(v) for v in values[idx]]
