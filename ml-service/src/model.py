"""집중도 점수, 임계값 보조 함수, 상태 분류 함수."""

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
    """유효한 숫자 값만 1차원 numpy 배열로 반환한다."""
    if values is None:
        return np.array([], dtype=float)

    try:
        array = np.asarray(values, dtype=float).reshape(-1)
    except (TypeError, ValueError):
        return np.array([], dtype=float)

    return array[np.isfinite(array)]


def calculate_rri(heart_rate: Optional[float]) -> Optional[float]:
    """심박수로부터 밀리초 단위 RR 간격을 추정한다."""
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
    """연속된 rPPG 차이값으로 rMSSD를 근사한다."""
    values = finite_values(rppg_values)
    if len(values) < 2:
        return EPSILON

    differences = np.diff(values)
    rmssd = float(np.sqrt(np.mean(differences * differences)))
    return max(rmssd, EPSILON)


def calculate_hf(rppg_values: Iterable[float] | np.ndarray | None) -> float:
    """rPPG 분산을 사용해 HF 파워를 근사한다."""
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
    집중도 점수를 계산한다.

    공식:
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
    EMA로 갱신된 평균값을 반환한다.

    현재 구조에서는 Node.js가 임계값 갱신을 담당한다. 나중에 공개 API 변경 없이
    분석 엔진이 서비스 내부 보정 방식을 채택할 수 있도록 이 보조 함수를 유지한다.
    """
    return float(alpha * current_focus_score + (1.0 - alpha) * old_mean)


def calculate_threshold(
    low_focus_mean: float,
    high_focus_mean: float,
    ratio: float = THRESHOLD_RATIO,
    min_gap: float = MIN_GAP,
) -> float:
    """
    낮은 집중/높은 집중 평균값으로 동적 임계값을 계산한다.

    향후 ML 서비스가 임계값 보정을 직접 담당할 때 사용할 보조 함수다.
    현재 추론 경로에서는 Node.js가 보낸 임계값을 사용한다.
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
