"""Financial data loading with a deterministic offline fallback."""

from __future__ import annotations

import csv
# import csv as _csv
# import io
import threading
import zlib
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np


@dataclass
class PriceSeries:
    dates: list[str]
    values: np.ndarray
    source: str


# symbol -> (start price, annual drift, annual volatility)
_PROFILES = {"SPY": (420.0, 0.09, 0.17), "QQQ": (350.0, 0.13, 0.24), "BTC-USD": (28000.0, 0.35, 0.62)}
_PERIOD_DAYS = {"6mo": 126, "1y": 252, "2y": 504, "5y": 1260, "10y": 2520}


def business_days(n: int, end: date | None = None) -> list[str]:
    end = end or date.today()
    days: list[str] = []
    current = end
    while len(days) < n:
        if current.weekday() < 5:
            days.append(current.isoformat())
        current -= timedelta(days=1)
    return days[::-1]


def generate_synthetic_prices(symbol: str = "SPY", period: str = "2y") -> PriceSeries:
    """Regime-switching geometric Brownian motion, seeded per symbol for reproducible demos."""
    n = _PERIOD_DAYS.get(period, 504)
    s0, mu, sigma = _PROFILES.get(symbol.upper(), (100.0, 0.08, 0.2))
    rng = np.random.default_rng(zlib.crc32(symbol.upper().encode()))
    dt = 1 / 252
    regime_vol = np.where(np.sin(np.arange(n) / 37.0) > 0.6, 1.8, 1.0)
    shocks = rng.normal((mu - 0.5 * sigma**2) * dt, sigma * np.sqrt(dt), n) * regime_vol
    values = s0 * np.exp(np.cumsum(shocks))
    return PriceSeries(business_days(n), values, "synthetic")


def fetch_stock_data(symbol: str, period: str = "2y", mode: str = "auto") -> PriceSeries:
    if mode != "synthetic":
        try:
            import yfinance as yf  # optional dependency

            frame = yf.Ticker(symbol).history(period=period, interval="1d")
            closes = frame["Close"].dropna()
            if len(closes) >= 60:
                return PriceSeries([d.date().isoformat() for d in closes.index], closes.to_numpy(float), "yfinance")
        except Exception:
            pass
    return generate_synthetic_prices(symbol, period)


def rolling_volatility(series: PriceSeries, window: int = 21) -> PriceSeries:
    returns = np.diff(np.log(series.values))
    vol = np.array([returns[max(0, i - window) : i].std() * np.sqrt(365) * 100 for i in range(window, len(returns) + 1)])
    return PriceSeries(series.dates[window:], vol, series.source)


# def parse_csv(text: str) -> PriceSeries:
#     """Parse a CSV with a date column and a numeric value column (close/value/price, or the last column)."""
#     reader = csv.DictReader(io.StringIO(text.strip()))
#     if not reader.fieldnames or len(reader.fieldnames) < 2:
#         raise ValueError("CSV must have a header row with a date column and a value column.")
#     fields = {name.lower().strip(): name for name in reader.fieldnames}
#     date_key = next((fields[k] for k in ("date", "timestamp", "time", "datetime") if k in fields), reader.fieldnames[0])
#     value_key = next((fields[k] for k in ("close", "adj close", "value", "price") if k in fields), reader.fieldnames[-1])
#     dates, values = [], []
#     for row in reader:
#         try:
#             values.append(float(row[value_key]))
#             dates.append(str(row[date_key]).strip())
#         except (TypeError, ValueError):
#             continue
#     if len(values) < 60:
#         raise ValueError("CSV needs at least 60 numeric rows for windowed forecasting.")
#     return PriceSeries(dates, np.asarray(values, dtype=float), "upload")
# def parse_csv(text: str) -> PriceSeries:
#     try:
#         reader = csv.DictReader(io.StringIO(text.strip()))
#         if not reader.fieldnames or len(reader.fieldnames) < 2:
#             raise ValueError("CSV must have a header row with a date column and a value column.")
#         fields = {name.lower().strip(): name for name in reader.fieldnames if name is not None}
#         date_key = next((fields[k] for k in ("date", "timestamp", "time", "datetime") if k in fields), reader.fieldnames[0])
#         value_key = next((fields[k] for k in ("close", "adj close", "value", "price") if k in fields), reader.fieldnames[-1])
#         dates, values = [], []
#         for row in reader:
#             try:
#                 values.append(float(row[value_key]))
#                 dates.append(str(row[date_key]).strip())
#             except (TypeError, ValueError, KeyError):
#                 continue
#         if len(values) < 60:
#             raise ValueError("CSV needs at least 60 numeric rows for windowed forecasting.")
#         return PriceSeries(dates, np.asarray(values, dtype=float), "upload")
#     except ValueError:
#         raise  # let the route handler convert to 422
#     except Exception as exc:
#         raise ValueError(f"Malformed CSV: {exc}") from exc
def parse_csv(text: str) -> PriceSeries:
    try:
        # splitlines() handles \r\n, bare \r, and embedded newlines in quoted
        # Excel cells — avoids the "new-line character seen in unquoted field" crash.
        reader = csv.DictReader(text.strip().splitlines())
        if not reader.fieldnames or len(reader.fieldnames) < 2:
            raise ValueError("CSV must have at least 2 columns.")
        fields = {name.lower().strip(): name for name in reader.fieldnames if name is not None}
        # Require a recognizable numeric column — no silent last-column fallback.
        value_keywords = ("close", "adj close", "value", "price", "amount")
        value_key = next((fields[k] for k in value_keywords if k in fields), None)
        if value_key is None:
            raise ValueError(
                "Could not find a numeric data column. "
                "Rename a column to 'close', 'price', 'value', or 'amount'."
            )
        date_key = next(
            (fields[k] for k in ("date", "timestamp", "time", "datetime") if k in fields),
            reader.fieldnames[0],
        )
        dates, values = [], []
        for row in reader:
            try:
                values.append(float(row[value_key]))
                dates.append(str(row[date_key]).strip())
            except (TypeError, ValueError, KeyError):
                continue
        if len(values) < 60:
            raise ValueError(
                f"CSV needs at least 60 numeric rows for windowed forecasting "
                f"(found {len(values)})."
            )
        return PriceSeries(dates, np.asarray(values, dtype=float), "upload")
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Malformed CSV: {exc}") from exc


class DatasetRegistry:
    """Built-in and uploaded datasets. Series are loaded lazily and cached."""

    def __init__(self, mode: str) -> None:
        self.mode = mode
        self._lock = threading.Lock()
        self._cache: dict[str, PriceSeries] = {}
        self._meta: dict[str, dict] = {
            "sp500": {"id": "sp500", "name": "S&P 500 Daily", "type": "Time Series", "symbol": "SPY", "period": "10y"},
            "nasdaq_tech": {"id": "nasdaq_tech", "name": "NASDAQ Tech Stocks", "type": "Time Series", "symbol": "QQQ", "period": "5y"},
            "crypto_vol": {"id": "crypto_vol", "name": "Crypto Volatility Index", "type": "Time Series", "symbol": "BTC-USD", "period": "5y", "transform": "volatility"},
            "synthetic_qcbm": {"id": "synthetic_qcbm", "name": "Synthetic QCBM Output", "type": "Generated", "symbol": "SYNTH", "period": "2y"},
        }

    def ids(self) -> list[str]:
        return list(self._meta)

    def meta(self, dataset_id: str) -> dict:
        if dataset_id not in self._meta:
            raise KeyError(dataset_id)
        return self._meta[dataset_id]

    def series(self, dataset_id: str) -> PriceSeries:
        meta = self.meta(dataset_id)
        with self._lock:
            if dataset_id in self._cache:
                return self._cache[dataset_id]
        if dataset_id == "synthetic_qcbm":
            series = generate_synthetic_prices("SYNTH", meta["period"])
            series.source = "synthetic"
        else:
            series = fetch_stock_data(meta["symbol"], meta["period"], self.mode)
            if meta.get("transform") == "volatility":
                series = rolling_volatility(series)
        with self._lock:
            self._cache[dataset_id] = series
        return series

    def set_series(self, dataset_id: str, series: PriceSeries, meta: dict | None = None) -> None:
        with self._lock:
            if meta is not None:
                self._meta[dataset_id] = meta
            self._cache[dataset_id] = series

    def add_upload(self, name: str, text: str) -> dict:
        series = parse_csv(text)
        dataset_id = f"upload_{zlib.crc32(name.encode()) & 0xFFFFFF:06x}"
        meta = {"id": dataset_id, "name": name, "type": "Uploaded", "symbol": name.upper()[:8], "period": "custom"}
        self.set_series(dataset_id, series, meta)
        return meta
