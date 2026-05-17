"""Preprocessing utilities for per-second tracking records."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from src.params import (
    GAZE_MISSING_EXCLUDE_SECONDS,
    INITIAL_THRESHOLD,
    MAX_HEART_RATE,
    MIN_HEART_RATE,
    WINDOW_SIZE,
)


REQUIRED_COLUMNS = ("timestamp", "gazeX", "gazeY")
NUMERIC_COLUMNS = ("gazeX", "gazeY", "heartRate", "rPPG", "threshold")


def _finite_or_none(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    return number if math.isfinite(number) else None


def _numeric_values(series: pd.Series, *, positive_heart_rate: bool = False) -> np.ndarray:
    values = pd.to_numeric(series, errors="coerce").to_numpy(dtype=float)
    values = values[np.isfinite(values)]

    if positive_heart_rate:
        values = values[(values >= MIN_HEART_RATE) & (values <= MAX_HEART_RATE)]

    return values


def _nested_number(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        return value.get(key)
    return None


def _normalize_record_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Accept the canonical Redis record shape and a few backend-friendly aliases."""
    normalized = df.copy()

    if "gaze" in normalized.columns:
        if "gazeX" not in normalized.columns:
            normalized["gazeX"] = normalized["gaze"].map(lambda value: _nested_number(value, "x"))
        if "gazeY" not in normalized.columns:
            normalized["gazeY"] = normalized["gaze"].map(lambda value: _nested_number(value, "y"))

    if "rPPG" not in normalized.columns:
        for alias in ("rppg", "rppgValue", "rPPGValue"):
            if alias in normalized.columns:
                normalized["rPPG"] = normalized[alias]
                break

    if "threshold" not in normalized.columns:
        for alias in ("thresholdRawScore", "focusThreshold", "focusThresholdRawScore"):
            if alias in normalized.columns:
                normalized["threshold"] = normalized[alias]
                break

    return normalized


def preprocess_tracking_data(raw_records: list[dict[str, Any]]) -> pd.DataFrame:
    """Convert raw Redis records to a sorted DataFrame with gazeMissing."""
    if not raw_records:
        raise ValueError("No records to preprocess.")

    df = _normalize_record_columns(pd.DataFrame(raw_records))
    missing_columns = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required record fields: {', '.join(missing_columns)}")

    for column in NUMERIC_COLUMNS:
        if column not in df.columns:
            df[column] = None
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    df = df.dropna(subset=["timestamp"]).copy()

    if df.empty:
        raise ValueError("No records remain after timestamp validation.")

    df["gazeMissing"] = ((df["gazeX"] == 0) & (df["gazeY"] == 0)).astype(int)
    df = df.sort_values("timestamp").reset_index(drop=True)

    return df


def split_into_windows(
    df: pd.DataFrame,
    window_size: int = WINDOW_SIZE,
) -> list[pd.DataFrame]:
    """Split sorted records into fixed elapsed-time windows."""
    if df.empty:
        return []
    if window_size <= 0:
        raise ValueError("window_size must be positive.")

    working = df.sort_values("timestamp").reset_index(drop=True).copy()
    first_timestamp = working["timestamp"].iloc[0]
    elapsed_seconds = (
        working["timestamp"] - first_timestamp
    ).dt.total_seconds().clip(lower=0)

    working["_window_index"] = np.floor(elapsed_seconds / window_size).astype(int)

    windows: list[pd.DataFrame] = []
    for _, window in working.groupby("_window_index", sort=True):
        clean_window = window.drop(columns=["_window_index"]).reset_index(drop=True)
        if not clean_window.empty:
            windows.append(clean_window)

    return windows


def calculate_slope(values: np.ndarray) -> float:
    """Return a simple linear slope for finite values."""
    finite = values[np.isfinite(values)]
    if len(finite) < 2:
        return 0.0

    try:
        x = np.arange(len(finite), dtype=float)
        slope = np.polyfit(x, finite, 1)[0]
    except (ValueError, np.linalg.LinAlgError):
        return 0.0

    return float(slope) if math.isfinite(float(slope)) else 0.0


def _series_stats(values: np.ndarray) -> dict[str, float | None]:
    if len(values) == 0:
        return {
            "mean": None,
            "std": None,
            "min": None,
            "max": None,
            "slope": 0.0,
        }

    return {
        "mean": float(np.mean(values)),
        "std": float(np.std(values)) if len(values) > 1 else 0.0,
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "slope": calculate_slope(values),
    }


def calculate_window_features(
    window: pd.DataFrame,
    minute_index: int,
) -> dict[str, Any]:
    """Calculate all per-minute features used by inference."""
    if window.empty:
        raise ValueError("Cannot calculate features for an empty window.")

    heart_values = _numeric_values(window["heartRate"], positive_heart_rate=True)
    rppg_values = _numeric_values(window["rPPG"])
    threshold_values = _numeric_values(window["threshold"])

    heart_stats = _series_stats(heart_values)
    rppg_stats = _series_stats(rppg_values)

    gaze_missing_seconds = int(window["gazeMissing"].sum())
    gaze_missing_rate = float(gaze_missing_seconds / len(window))
    threshold = (
        float(np.mean(threshold_values))
        if len(threshold_values) > 0
        else INITIAL_THRESHOLD
    )

    return {
        "minute_index": minute_index,
        "start_time": window["timestamp"].iloc[0].isoformat(),
        "end_time": window["timestamp"].iloc[-1].isoformat(),
        "heartRate_mean": _finite_or_none(heart_stats["mean"]),
        "heartRate_std": _finite_or_none(heart_stats["std"]),
        "heartRate_min": _finite_or_none(heart_stats["min"]),
        "heartRate_max": _finite_or_none(heart_stats["max"]),
        "heartRate_slope": _finite_or_none(heart_stats["slope"]),
        "rPPG_mean": _finite_or_none(rppg_stats["mean"]),
        "rPPG_std": _finite_or_none(rppg_stats["std"]),
        "rPPG_min": _finite_or_none(rppg_stats["min"]),
        "rPPG_max": _finite_or_none(rppg_stats["max"]),
        "rPPG_slope": _finite_or_none(rppg_stats["slope"]),
        "gaze_missing_seconds": gaze_missing_seconds,
        "gaze_missing_rate": gaze_missing_rate,
        "threshold": threshold,
        "used_for_threshold_update": (
            gaze_missing_seconds < GAZE_MISSING_EXCLUDE_SECONDS
        ),
    }
