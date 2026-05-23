"""집중도 추적 ML 서비스의 세션 분석 흐름을 조율한다."""

from __future__ import annotations

import json
import math
from typing import Any

import redis.asyncio as redis

from src.llm_feedback import generate_study_feedback
from src.model import (
    calculate_focus_score,
    classify_focus_state,
    classify_focus_trend,
    classify_heart_trend,
)
from src.params import REDIS_HOST, REDIS_PORT, session_records_key, tracking_stream_key
from src.preprocessing import (
    calculate_window_features,
    preprocess_tracking_data,
    split_into_windows,
)


class SessionDataNotFoundError(ValueError):
    """요청한 세션의 기록이 Redis에 없을 때 발생하는 예외."""


def create_redis_client() -> redis.Redis:
    return redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)


def _parse_record_json(item: str, index: int) -> dict[str, Any]:
    try:
        parsed = json.loads(item)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON record at index {index}.") from exc

    if not isinstance(parsed, dict):
        raise RuntimeError(f"Record at index {index} is not a JSON object.")

    return parsed


def _parse_records_json(records_json: list[str]) -> list[dict[str, Any]]:
    return [
        _parse_record_json(item, index)
        for index, item in enumerate(records_json)
    ]


async def _fetch_list_records(
    key: str,
    redis_client: redis.Redis,
) -> list[dict[str, Any]] | None:
    key_type = await redis_client.type(key)
    if key_type == "none":
        return None
    if key_type != "list":
        raise RuntimeError(
            f"Expected Redis key {key} to be a list written with RPUSH, "
            f"but found type {key_type!r}."
        )

    records_json = await redis_client.lrange(key, 0, -1)
    if not records_json:
        return None

    return _parse_records_json(records_json)


async def _fetch_stream_records(
    key: str,
    redis_client: redis.Redis,
) -> list[dict[str, Any]] | None:
    key_type = await redis_client.type(key)
    if key_type == "none":
        return None
    if key_type != "stream":
        raise RuntimeError(
            f"Expected Redis key {key} to be a stream written with XADD, "
            f"but found type {key_type!r}."
        )

    entries = await redis_client.xrange(key, min="-", max="+")
    if not entries:
        return None

    records: list[dict[str, Any]] = []
    for index, (_, fields) in enumerate(entries):
        data = fields.get("data") if isinstance(fields, dict) else None
        if not isinstance(data, str):
            raise RuntimeError(f"Stream record at index {index} has no JSON data field.")
        records.append(_parse_record_json(data, index))

    return records


async def fetch_session_records(
    user_id: str,
    session_id: str,
    redis_client: redis.Redis,
) -> list[dict[str, Any]]:
    """
    Node.js 백엔드가 Redis에 직접 기록한 데이터를 가져온다.

    지원 Redis 형태:
        key: study:session:{userId}:{sessionId}:records
        type: list
        write command: RPUSH key json_string

        key: tracking:{sessionId}:{userId}:stream
        type: stream
        write command: XADD key * data json_string
    """
    list_key = session_records_key(user_id, session_id)
    stream_key = tracking_stream_key(user_id, session_id)

    try:
        records = await _fetch_list_records(list_key, redis_client)
        if records is None:
            records = await _fetch_stream_records(stream_key, redis_client)
    except redis.RedisError as exc:
        raise RuntimeError(
            f"Redis read failed for keys {list_key} or {stream_key}: {exc}"
        ) from exc

    if not records:
        raise SessionDataNotFoundError(
            f"No records found for keys {list_key} or {stream_key}."
        )

    return records


def _boolean_focus_ratio(window: Any) -> float | None:
    if "focusIsFocused" not in window.columns:
        return None

    values: list[bool] = []
    for value in window["focusIsFocused"].dropna().tolist():
        if isinstance(value, bool):
            values.append(value)
        elif isinstance(value, (int, float)) and value in (0, 1):
            values.append(bool(value))

    if not values:
        return None

    return sum(1 for value in values if value) / len(values)


def _raw_focus_score(window: Any) -> tuple[float | None, float | None]:
    if "focusScore" not in window.columns:
        return None, None

    scores = window["focusScore"].dropna()
    if scores.empty:
        return None, None

    score = float(scores.astype(float).mean())
    threshold = None
    if "threshold" in window.columns:
        thresholds = window["threshold"].dropna()
        if not thresholds.empty:
            threshold = float(thresholds.astype(float).mean())

    return score, threshold


def _build_result_metrics(
    dataframe: Any,
    minutes: list[dict[str, Any]],
    summary: dict[str, Any],
) -> dict[str, int | None]:
    timestamps = dataframe["timestamp"].dropna()
    if timestamps.empty:
        duration_seconds = 0
    else:
        elapsed = (timestamps.iloc[-1] - timestamps.iloc[0]).total_seconds()
        duration_seconds = max(1, int(round(elapsed)) + 1)

    heart_values = dataframe["heartRate"].dropna()
    avg_bpm = (
        int(round(float(heart_values.mean())))
        if not heart_values.empty
        else None
    )

    focus_ratio = None
    raw_focus_ratio = _boolean_focus_ratio(dataframe)
    if raw_focus_ratio is not None:
        focus_ratio = int(round(raw_focus_ratio * 100))
    elif minutes:
        known_minutes = [
            minute
            for minute in minutes
            if minute.get("focus_state") in {"high_focus", "low_focus"}
        ]
        if known_minutes:
            focus_ratio = int(
                round((summary["high_focus_minutes"] / len(known_minutes)) * 100)
            )

    return {
        "duration_seconds": duration_seconds,
        "avg_bpm": avg_bpm,
        "focus_ratio": focus_ratio,
    }


async def delete_session_records(
    user_id: str,
    session_id: str,
    redis_client: redis.Redis,
) -> int:
    key = session_records_key(user_id, session_id)

    try:
        return int(await redis_client.delete(key))
    except redis.RedisError as exc:
        raise RuntimeError(f"Redis delete failed for key {key}: {exc}") from exc


def _round_float(value: Any, digits: int = 4) -> Any:
    if isinstance(value, float):
        return round(value, digits)
    return value


def _finite_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    return number if math.isfinite(number) else None


def _percent_coordinate(value: float, extent: float) -> float:
    return round(min(100.0, max(0.0, (value / extent) * 100.0)), 2)


def _build_gaze_heatmap(dataframe: Any, columns: int = 16, rows: int = 10) -> dict[str, Any]:
    heatmap_data = dataframe.copy()
    raw_gaze_mask = (
        heatmap_data["rawGazeX"].notna()
        & heatmap_data["rawGazeY"].notna()
        & (heatmap_data["rawGazeX"] > 0)
        & (heatmap_data["rawGazeY"] > 0)
    )
    heatmap_data["heatmapGazeX"] = heatmap_data["rawGazeX"].where(
        raw_gaze_mask,
        heatmap_data["gazeX"],
    )
    heatmap_data["heatmapGazeY"] = heatmap_data["rawGazeY"].where(
        raw_gaze_mask,
        heatmap_data["gazeY"],
    )

    valid_gaze = heatmap_data[
        (heatmap_data["gazeMissing"] == 0)
        & heatmap_data["heatmapGazeX"].notna()
        & heatmap_data["heatmapGazeY"].notna()
        & (heatmap_data["heatmapGazeX"] > 0)
        & (heatmap_data["heatmapGazeY"] > 0)
    ][["heatmapGazeX", "heatmapGazeY", "gazeViewportWidth", "gazeViewportHeight"]]

    if valid_gaze.empty:
        return {
            "columns": columns,
            "rows": rows,
            "total_points": 0,
            "x_min": None,
            "x_max": None,
            "y_min": None,
            "y_max": None,
            "cells": [],
        }

    viewport_widths = valid_gaze["gazeViewportWidth"].dropna()
    viewport_widths = viewport_widths[viewport_widths > 0]
    viewport_heights = valid_gaze["gazeViewportHeight"].dropna()
    viewport_heights = viewport_heights[viewport_heights > 0]
    x_extent = (
        float(viewport_widths.max())
        if not viewport_widths.empty
        else max(float(valid_gaze["heatmapGazeX"].max()), 1.0)
    )
    y_extent = (
        float(viewport_heights.max())
        if not viewport_heights.empty
        else max(float(valid_gaze["heatmapGazeY"].max()), 1.0)
    )

    buckets: dict[tuple[int, int], dict[str, float]] = {}
    for row in valid_gaze.itertuples(index=False):
        x = _finite_float(row.heatmapGazeX)
        y = _finite_float(row.heatmapGazeY)
        if x is None or y is None:
            continue

        column_index = min(columns - 1, max(0, int((x / x_extent) * columns)))
        row_index = min(rows - 1, max(0, int((y / y_extent) * rows)))
        key = (column_index, row_index)
        bucket = buckets.setdefault(key, {"count": 0.0, "x_total": 0.0, "y_total": 0.0})
        bucket["count"] += 1
        bucket["x_total"] += x
        bucket["y_total"] += y

    max_count = max((int(bucket["count"]) for bucket in buckets.values()), default=0)
    cells = [
        {
            "column": column_index,
            "row": row_index,
            "x": _percent_coordinate(bucket["x_total"] / bucket["count"], x_extent),
            "y": _percent_coordinate(bucket["y_total"] / bucket["count"], y_extent),
            "count": int(bucket["count"]),
            "intensity": round(bucket["count"] / max_count, 4) if max_count > 0 else 0.0,
        }
        for (column_index, row_index), bucket in sorted(buckets.items())
    ]

    return {
        "columns": columns,
        "rows": rows,
        "total_points": int(valid_gaze.shape[0]),
        "x_min": 0.0,
        "x_max": round(x_extent, 4),
        "y_min": 0.0,
        "y_max": round(y_extent, 4),
        "cells": cells,
    }


def _build_focus_timeline(minutes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    timeline: list[dict[str, Any]] = []

    for minute in minutes:
        minute_index = int(minute["minute_index"])
        timeline.append(
            {
                "minute_index": minute_index,
                "elapsed_seconds": (minute_index - 1) * 60,
                "focus_score": _round_float(minute.get("focus_score")),
                "threshold": _round_float(minute.get("threshold")),
                "focus_state": minute.get("focus_state", "unknown"),
                "focus_trend": minute.get("focus_trend", "stable"),
            }
        )

    return timeline


def _build_summary(minutes: list[dict[str, Any]]) -> dict[str, Any]:
    total_minutes = len(minutes)
    avg_gaze_missing_rate = (
        sum(minute["gaze_missing_rate"] for minute in minutes) / total_minutes
        if total_minutes > 0
        else 0.0
    )

    return {
        "focus_up_minutes": sum(
            1 for minute in minutes if minute["focus_trend"] == "up"
        ),
        "focus_stable_minutes": sum(
            1 for minute in minutes if minute["focus_trend"] == "stable"
        ),
        "focus_down_minutes": sum(
            1 for minute in minutes if minute["focus_trend"] == "down"
        ),
        "high_focus_minutes": sum(
            1 for minute in minutes if minute["focus_state"] == "high_focus"
        ),
        "low_focus_minutes": sum(
            1 for minute in minutes if minute["focus_state"] == "low_focus"
        ),
        "avg_gaze_missing_rate": round(avg_gaze_missing_rate, 4),
    }


async def analyze_session(
    user_id: str,
    session_id: str,
    delete_after: bool = False,
    include_feedback: bool = True,
    redis_client: redis.Redis | None = None,
) -> dict[str, Any]:
    """
    하나의 세션을 분석한다.

    임계값은 Node.js가 각 기록과 함께 보내 Redis에 저장한다고 가정한다.
    이 서비스는 윈도우별 평균 임계값을 사용하며, 내부에서 낮은 집중/높은 집중
    평균 임계값을 갱신하지 않는다.
    """
    owns_client = redis_client is None
    client = redis_client or create_redis_client()

    try:
        raw_records = await fetch_session_records(user_id, session_id, client)
        dataframe = preprocess_tracking_data(raw_records)
        windows = split_into_windows(dataframe)

        if not windows:
            raise ValueError("No analysis windows could be created.")

        minutes: list[dict[str, Any]] = []
        previous_focus_score: float | None = None
        previous_heart_rate_mean: float | None = None

        for minute_index, window in enumerate(windows, start=1):
            features = calculate_window_features(window, minute_index)

            focus_score = calculate_focus_score(
                features["heartRate_mean"],
                window["rPPG"].to_numpy(dtype=float),
            )
            threshold = features["threshold"]

            boolean_focus_ratio = _boolean_focus_ratio(window)
            raw_focus_score, raw_focus_threshold = _raw_focus_score(window)
            if focus_score is None and boolean_focus_ratio is not None:
                focus_score = boolean_focus_ratio * 100.0
                threshold = 50.0
            elif focus_score is None and raw_focus_score is not None:
                focus_score = raw_focus_score
                threshold = (
                    raw_focus_threshold
                    if raw_focus_threshold is not None
                    else threshold
                )

            focus_state = classify_focus_state(focus_score, threshold)
            focus_trend = classify_focus_trend(
                focus_score,
                previous_focus_score,
            )
            heart_trend = classify_heart_trend(
                features["heartRate_mean"],
                previous_heart_rate_mean,
            )

            minute = {
                **features,
                "focus_score": focus_score,
                "focus_state": focus_state,
                "focus_trend": focus_trend,
                "heart_trend": heart_trend,
            }
            minutes.append(
                {key: _round_float(value) for key, value in minute.items()}
            )

            previous_focus_score = focus_score
            previous_heart_rate_mean = features["heartRate_mean"]

        if delete_after:
            await delete_session_records(user_id, session_id, client)

        summary = _build_summary(minutes)
        result_metrics = _build_result_metrics(dataframe, minutes, summary)
        gaze_heatmap = _build_gaze_heatmap(dataframe)
        focus_timeline = _build_focus_timeline(minutes)
        feedback: str | None = None
        feedback2: str | None = None
        feedback_source: str | None = None
        if include_feedback:
            feedback, feedback2, feedback_source = await generate_study_feedback(
                user_id=user_id,
                session_id=session_id,
                duration_minutes=len(minutes),
                summary=summary,
                minutes=minutes,
            )

        return {
            "userId": user_id,
            "sessionId": session_id,
            "duration_minutes": len(minutes),
            "summary": summary,
            "minutes": minutes,
            "result_metrics": result_metrics,
            "gaze_heatmap": gaze_heatmap,
            "focus_timeline": focus_timeline,
            "feedback": feedback,
            "feedback2": feedback2,
            "feedback_source": feedback_source,
        }
    finally:
        if owns_client:
            await client.aclose()
