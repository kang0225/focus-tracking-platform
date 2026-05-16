"""Focus score, threshold helper, and state classification functions."""

from __future__ import annotations

import math
from typing import Iterable, Optional

import numpy as np

from src.params import (
    EMA_ALPHA,
    EPSILON,
    FOCUS_TREND_DELTA,
    HEART_TREND_DELTA,
    INITIAL_THRESHOLD,
    MIN_GAP,
    THRESHOLD_RATIO,
)


def finite_values(values: Iterable[float] | np.ndarray | None) -> np.ndarray:
    """Return finite numeric values as a one-dimensional numpy array."""
    if values is None:
        return np.array([], dtype=float)

    try:
        array = np.asarray(values, dtype=float).reshape(-1)
    except (TypeError, ValueError):
        return np.array([], dtype=float)

    return array[np.isfinite(array)]


def calculate_rri(heart_rate: Optional[float]) -> Optional[float]:
    """Estimate RR interval in milliseconds from heart rate."""
    if heart_rate is None:
        return None

    try:
        value = float(heart_rate)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(value) or value <= 0:
        return None

    return 60_000.0 / value


def calculate_rmssd(rppg_values: Iterable[float] | np.ndarray | None) -> float:
    """Approximate rMSSD from consecutive rPPG differences."""
    values = finite_values(rppg_values)
    if len(values) < 2:
        return EPSILON

    differences = np.diff(values)
    rmssd = float(np.sqrt(np.mean(differences * differences)))
    return max(rmssd, EPSILON)


def calculate_hf(rppg_values: Iterable[float] | np.ndarray | None) -> float:
    """Approximate HF power using rPPG variance."""
    values = finite_values(rppg_values)
    if len(values) < 2:
        return EPSILON

    hf_power = float(np.var(values))
    return max(hf_power, EPSILON)


def calculate_focus_score(
    heart_rate: Optional[float],
    rppg_values: Iterable[float] | np.ndarray | None,
) -> Optional[float]:
    """
    Calculate focus score.

    Formula:
        Focus Score = RRI / 100 + ln(rMSSD) + ln(HF)
    """
    rri = calculate_rri(heart_rate)
    values = finite_values(rppg_values)

    if rri is None or len(values) < 2:
        return None

    try:
        rmssd = calculate_rmssd(values)
        hf_power = calculate_hf(values)
        score = (rri / 100.0) + math.log(max(rmssd, EPSILON)) + math.log(
            max(hf_power, EPSILON)
        )
    except (OverflowError, ValueError):
        return None

    if not math.isfinite(score):
        return None

    return float(score)


def update_ema(
    old_mean: float,
    current_focus_score: float,
    alpha: float = EMA_ALPHA,
) -> float:
    """
    Return an EMA-updated mean.

    Node.js owns threshold updates in the current architecture. This helper is
    kept here so the analysis engine can adopt service-side calibration later
    without changing the public API.
    """
    return float(alpha * current_focus_score + (1.0 - alpha) * old_mean)


def calculate_threshold(
    low_focus_mean: float,
    high_focus_mean: float,
    ratio: float = THRESHOLD_RATIO,
    min_gap: float = MIN_GAP,
) -> float:
    """
    Calculate dynamic threshold from low/high focus means.

    This is a helper for future ML-service-owned threshold calibration. The
    current inference path consumes the threshold sent by Node.js instead.
    """
    gap = high_focus_mean - low_focus_mean
    if gap < min_gap:
        return INITIAL_THRESHOLD

    return float(low_focus_mean + ratio * gap)


def classify_focus_state(
    focus_score: Optional[float],
    threshold: Optional[float],
) -> str:
    if focus_score is None or threshold is None:
        return "unknown"

    return "high_focus" if focus_score >= threshold else "low_focus"


def classify_focus_trend(
    current_focus_score: Optional[float],
    previous_focus_score: Optional[float],
    delta: float = FOCUS_TREND_DELTA,
) -> str:
    if current_focus_score is None or previous_focus_score is None:
        return "stable"

    diff = current_focus_score - previous_focus_score
    if diff > delta:
        return "up"
    if diff < -delta:
        return "down"
    return "stable"


def classify_heart_trend(
    current_hr_mean: Optional[float],
    previous_hr_mean: Optional[float],
    delta: float = HEART_TREND_DELTA,
) -> str:
    if current_hr_mean is None or previous_hr_mean is None:
        return "stable"

    diff = current_hr_mean - previous_hr_mean
    if diff > delta:
        return "up"
    if diff < -delta:
        return "down"
    return "stable"
