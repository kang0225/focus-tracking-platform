"""Session analysis orchestration for the focus tracking ML service."""

from __future__ import annotations

import json
from typing import Any

import redis.asyncio as redis

from src.model import (
    calculate_focus_score,
    classify_focus_state,
    classify_focus_trend,
    classify_heart_trend,
)
from src.params import REDIS_HOST, REDIS_PORT, session_records_key
from src.preprocessing import (
    calculate_window_features,
    preprocess_tracking_data,
    split_into_windows,
)


class SessionDataNotFoundError(ValueError):
    """Raised when Redis has no records for the requested session."""


def create_redis_client() -> redis.Redis:
    return redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)


async def fetch_session_records(
    user_id: str,
    session_id: str,
    redis_client: redis.Redis,
) -> list[dict[str, Any]]:
    """
    Fetch records that the Node.js backend wrote directly to Redis.

    Expected Redis shape:
        key: study:session:{userId}:{sessionId}:records
        type: list
        write command: RPUSH key json_string
    """
    key = session_records_key(user_id, session_id)

    try:
        key_type = await redis_client.type(key)
        if key_type == "none":
            raise SessionDataNotFoundError(f"No records found for key {key}.")
        if key_type != "list":
            raise RuntimeError(
                f"Expected Redis key {key} to be a list written with RPUSH, "
                f"but found type {key_type!r}."
            )

        records_json = await redis_client.lrange(key, 0, -1)
    except redis.RedisError as exc:
        raise RuntimeError(f"Redis read failed for key {key}: {exc}") from exc

    if not records_json:
        raise SessionDataNotFoundError(f"No records found for key {key}.")

    records: list[dict[str, Any]] = []
    for index, item in enumerate(records_json):
        try:
            parsed = json.loads(item)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Invalid JSON record at index {index}.") from exc

        if not isinstance(parsed, dict):
            raise RuntimeError(f"Record at index {index} is not a JSON object.")

        records.append(parsed)

    return records


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
    redis_client: redis.Redis | None = None,
) -> dict[str, Any]:
    """
    Analyze one session.

    Threshold values are expected to be sent by Node.js with each record and
    stored in Redis. This service consumes the per-window average threshold and
    does not update low/high threshold means internally.
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

        return {
            "userId": user_id,
            "sessionId": session_id,
            "duration_minutes": len(minutes),
            "summary": _build_summary(minutes),
            "minutes": minutes,
        }
    finally:
        if owns_client:
            await client.aclose()
