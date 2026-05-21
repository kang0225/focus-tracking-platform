"""Redis analysis job consumer for completed result statistics."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import redis.asyncio as redis
from redis.exceptions import ResponseError

from src.inference import analyze_session
from src.params import (
    ANALYSIS_JOBS_CONSUMER,
    ANALYSIS_JOBS_GROUP,
    ANALYSIS_JOBS_STREAM,
    JOB_STATUS_TTL_SECONDS,
)


def _job_status_key(job_id: str) -> str:
    return f"tracking:job:{job_id}:status"


async def _ensure_consumer_group(redis_client: redis.Redis) -> None:
    try:
        await redis_client.xgroup_create(
            ANALYSIS_JOBS_STREAM,
            ANALYSIS_JOBS_GROUP,
            id="0",
            mkstream=True,
        )
    except ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def _parse_job_payload(fields: dict[str, Any]) -> dict[str, Any]:
    raw_data = fields.get("data")
    if not isinstance(raw_data, str):
        raise RuntimeError("Analysis job stream entry has no JSON data field.")

    payload = json.loads(raw_data)
    if not isinstance(payload, dict):
        raise RuntimeError("Analysis job payload is not a JSON object.")

    return payload


def _summary_text(analysis: dict[str, Any], focus_ratio: int | None) -> str:
    duration_minutes = analysis.get("duration_minutes", 0)
    summary = analysis.get("summary", {})
    high_focus_minutes = summary.get("high_focus_minutes", 0)
    low_focus_minutes = summary.get("low_focus_minutes", 0)

    if focus_ratio is None:
        return (
            f"총 {duration_minutes}분 분석 완료. "
            f"고집중 {high_focus_minutes}분, 저집중 {low_focus_minutes}분."
        )

    return (
        f"총 {duration_minutes}분 분석 완료. "
        f"집중 비율 {focus_ratio}%, 고집중 {high_focus_minutes}분."
    )


def _frontend_result(analysis: dict[str, Any]) -> dict[str, Any]:
    metrics = analysis.get("result_metrics")
    if not isinstance(metrics, dict):
        metrics = {}

    duration_seconds = metrics.get("duration_seconds")
    if not isinstance(duration_seconds, int):
        duration_seconds = int(analysis.get("duration_minutes", 0)) * 60

    avg_bpm = metrics.get("avg_bpm")
    focus_ratio = metrics.get("focus_ratio")

    return {
        "durationSeconds": duration_seconds,
        "avgBpm": avg_bpm if isinstance(avg_bpm, int) else None,
        "focusRatio": focus_ratio if isinstance(focus_ratio, int) else None,
        "summary": _summary_text(
            analysis,
            focus_ratio if isinstance(focus_ratio, int) else None,
        ),
        "feedback": analysis.get("feedback"),
        "feedbackSource": analysis.get("feedback_source"),
    }


async def _write_job_status(
    redis_client: redis.Redis,
    payload: dict[str, Any],
    status: str,
    *,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    job_id = payload.get("jobId")
    if not isinstance(job_id, str) or not job_id:
        raise RuntimeError("Analysis job payload is missing jobId.")

    next_status = {
        "jobId": job_id,
        "meetingId": payload.get("meetingId"),
        "userId": payload.get("userId"),
        "page": payload.get("page"),
        "reason": payload.get("reason"),
        "status": status,
        "requestedAt": payload.get("requestedAt"),
    }

    if result is not None:
        next_status["result"] = result
    if error is not None:
        next_status["error"] = error

    await redis_client.set(
        _job_status_key(job_id),
        json.dumps(next_status, ensure_ascii=False),
        ex=JOB_STATUS_TTL_SECONDS,
    )


async def _process_job(redis_client: redis.Redis, payload: dict[str, Any]) -> None:
    user_id = payload.get("userId")
    meeting_id = payload.get("meetingId")
    if not isinstance(user_id, str) or not user_id.strip():
        raise RuntimeError("Analysis job payload is missing userId.")
    if not isinstance(meeting_id, str) or not meeting_id.strip():
        raise RuntimeError("Analysis job payload is missing meetingId.")

    await _write_job_status(redis_client, payload, "processing")

    analysis = await analyze_session(
        user_id=user_id,
        session_id=meeting_id,
        delete_after=False,
        include_feedback=True,
        redis_client=redis_client,
    )
    await _write_job_status(
        redis_client,
        payload,
        "completed",
        result=_frontend_result(analysis),
    )


async def run_analysis_job_worker(redis_client: redis.Redis) -> None:
    """Continuously consumes Redis analysis jobs and writes completed statuses."""
    while True:
        try:
            await _ensure_consumer_group(redis_client)
            break
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"Analysis job consumer group setup failed: {exc}")
            await asyncio.sleep(5)

    while True:
        try:
            response = await redis_client.xreadgroup(
                ANALYSIS_JOBS_GROUP,
                ANALYSIS_JOBS_CONSUMER,
                streams={ANALYSIS_JOBS_STREAM: ">"},
                count=1,
                block=5000,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"Analysis job read failed: {exc}")
            await asyncio.sleep(5)
            continue

        if not response:
            await asyncio.sleep(0)
            continue

        for _, messages in response:
            for message_id, fields in messages:
                payload: dict[str, Any] | None = None
                try:
                    payload = _parse_job_payload(fields)
                    await _process_job(redis_client, payload)
                except Exception as exc:
                    print(f"Analysis job failed: {exc}")
                    if payload is not None:
                        try:
                            await _write_job_status(
                                redis_client,
                                payload,
                                "failed",
                                error=str(exc),
                            )
                        except Exception as status_exc:
                            print(f"Analysis job failure status write failed: {status_exc}")
                finally:
                    try:
                        await redis_client.xack(
                            ANALYSIS_JOBS_STREAM,
                            ANALYSIS_JOBS_GROUP,
                            message_id,
                        )
                    except Exception as ack_exc:
                        print(f"Analysis job ack failed: {ack_exc}")
