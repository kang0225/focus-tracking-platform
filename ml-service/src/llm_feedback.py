"""분석된 세션 윈도우를 바탕으로 LLM 학습 습관 피드백을 생성한다."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from src.params import (
    BEDROCK_CONNECT_TIMEOUT_SECONDS,
    BEDROCK_MAX_ATTEMPTS,
    BEDROCK_MAX_OUTPUT_TOKENS,
    BEDROCK_MODEL_ID,
    BEDROCK_READ_TIMEOUT_SECONDS,
    BEDROCK_REGION,
    BEDROCK_TEMPERATURE,
)


COMPACT_MINUTE_FIELDS = (
    "minute_index",
    "heartRate_mean",
    "heartRate_slope",
    "rPPG_mean",
    "rPPG_std",
    "gaze_missing_seconds",
    "gaze_missing_rate",
    "focus_score",
    "threshold",
    "focus_state",
    "focus_trend",
    "heart_trend",
)


def _number(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback

    return number if number == number else fallback


def _compact_minutes(minutes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            key: minute.get(key)
            for key in COMPACT_MINUTE_FIELDS
            if key in minute
        }
        for minute in minutes
    ]


def _longest_low_focus_streak(minutes: list[dict[str, Any]]) -> tuple[int, int]:
    longest_start = 0
    longest_length = 0
    current_start = 0
    current_length = 0

    for minute in minutes:
        index = int(_number(minute.get("minute_index"), 0))
        if minute.get("focus_state") == "low_focus":
            if current_length == 0:
                current_start = index
            current_length += 1
            if current_length > longest_length:
                longest_start = current_start
                longest_length = current_length
        else:
            current_length = 0

    return longest_start, longest_length


def build_local_feedback(
    duration_minutes: int,
    summary: dict[str, Any],
    minutes: list[dict[str, Any]],
) -> str:
    """LLM 설정이 없거나 호출에 실패했을 때 사용할 결정적 피드백을 반환한다."""
    if duration_minutes <= 0:
        return "분석 가능한 학습 시간이 충분하지 않습니다. 다음 세션에서는 최소 몇 분 이상 안정적으로 측정한 뒤 다시 확인해 주세요."

    high_focus_minutes = int(_number(summary.get("high_focus_minutes"), 0))
    low_focus_minutes = int(_number(summary.get("low_focus_minutes"), 0))
    focus_ratio = round((high_focus_minutes / duration_minutes) * 100)
    avg_gaze_missing_rate = _number(summary.get("avg_gaze_missing_rate"), 0.0)
    down_minutes = int(_number(summary.get("focus_down_minutes"), 0))
    low_start, low_length = _longest_low_focus_streak(minutes)

    feedback = [
        f"총 {duration_minutes}분 중 집중 상태가 높았던 시간은 {high_focus_minutes}분({focus_ratio}%)입니다.",
        f"집중 저하로 분류된 시간은 {low_focus_minutes}분이고, 평균 시선 누락률은 {avg_gaze_missing_rate * 100:.1f}%입니다.",
    ]

    if low_length >= 5:
        low_end = low_start + low_length - 1
        feedback.append(
            f"{low_start}-{low_end}분 구간에 집중 저하가 연속으로 나타났습니다. 비슷한 패턴이 반복되면 해당 시점 직전에 3-5분 휴식을 넣는 편이 좋습니다."
        )
    elif down_minutes >= max(3, duration_minutes // 5):
        feedback.append(
            "세션 중 집중 점수가 내려간 구간이 여러 번 보입니다. 긴 시간 한 번에 밀기보다 25-30분 단위로 끊어 복습 목표를 작게 잡아보세요."
        )
    else:
        feedback.append(
            "집중 흐름은 비교적 안정적입니다. 지금의 학습 환경과 시작 루틴을 유지하면서 세션 길이만 조금씩 늘려보세요."
        )

    if avg_gaze_missing_rate >= 0.25:
        feedback.append(
            "시선 누락률이 높은 편이라 화면 이탈, 카메라 각도, 조명 영향을 함께 점검하는 것이 좋습니다."
        )

    feedback.append(
        "이 피드백은 생체 신호의 의학적 해석이 아니라 학습 습관 개선을 위한 참고용입니다."
    )
    return " ".join(feedback)


def _build_prompt_payload(
    user_id: str,
    session_id: str,
    duration_minutes: int,
    summary: dict[str, Any],
    minutes: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "session_id": session_id,
        "duration_minutes": duration_minutes,
        "summary": summary,
        "minutes": _compact_minutes(minutes),
    }


def _extract_response_text(payload: dict[str, Any]) -> str | None:
    parts: list[str] = []
    content = payload.get("content")
    if not isinstance(content, list):
        return None

    for item in content:
        if not isinstance(item, dict):
            continue
        text = item.get("text")
        if isinstance(text, str) and text.strip():
            parts.append(text.strip())

    return "\n".join(parts).strip() or None


def _sanitize_feedback_text(text: str) -> str:
    lines = text.strip().splitlines()
    while lines and not lines[0].strip():
        lines.pop(0)

    while len(lines) > 1 and lines[0].lstrip().startswith("#"):
        lines.pop(0)

    return "\n".join(line.strip() for line in lines).strip()


def _build_bedrock_prompt(prompt_payload: dict[str, Any]) -> str:
    return (
        "다음 JSON은 한 학습 세션의 1분 단위 분석 결과입니다. "
        "집중이 떨어진 시간대, 시선 이탈, 심박 변화, 다음 세션에서의 "
        "구체적 개선 행동을 포함해 피드백을 작성하세요.\n\n"
        f"{json.dumps(prompt_payload, ensure_ascii=False)}"
    )


def _invoke_bedrock_feedback(prompt_payload: dict[str, Any]) -> str | None:
    import boto3
    from botocore.config import Config

    client = boto3.client(
        "bedrock-runtime",
        region_name=BEDROCK_REGION,
        config=Config(
            connect_timeout=BEDROCK_CONNECT_TIMEOUT_SECONDS,
            read_timeout=BEDROCK_READ_TIMEOUT_SECONDS,
            retries={
                "max_attempts": BEDROCK_MAX_ATTEMPTS,
                "mode": "standard",
            },
        ),
    )
    request_body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": BEDROCK_MAX_OUTPUT_TOKENS,
        "temperature": BEDROCK_TEMPERATURE,
        "system": (
            "You are a Korean study coach. Use the minute-by-minute focus, "
            "heart-rate, rPPG, and gaze-missing analysis to give practical "
            "study habit feedback. Do not make medical claims. Return only "
            "plain Korean feedback, 5 to 7 concise sentences. Do not include "
            "a title, Markdown, headings, bullet points, numbering, labels, "
            "or code blocks. Start directly with the first feedback sentence."
        ),
        "messages": [
            {
                "role": "user",
                "content": _build_bedrock_prompt(prompt_payload),
            }
        ],
    }

    response = client.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
    )
    payload = json.loads(response["body"].read())
    return _extract_response_text(payload)


async def generate_study_feedback(
    user_id: str,
    session_id: str,
    duration_minutes: int,
    summary: dict[str, Any],
    minutes: list[dict[str, Any]],
) -> tuple[str, str | None, str]:
    """
    한국어 학습 피드백을 생성한다.

    (로컬 요약, LLM 피드백, 출처)를 반환하며, 출처는 "bedrock" 또는
    "local_fallback"이다.
    """
    local_feedback = build_local_feedback(duration_minutes, summary, minutes)
    if not BEDROCK_MODEL_ID:
        return local_feedback, None, "local_fallback"

    prompt_payload = _build_prompt_payload(
        user_id,
        session_id,
        duration_minutes,
        summary,
        minutes,
    )

    try:
        text = await asyncio.to_thread(_invoke_bedrock_feedback, prompt_payload)
        if text:
            return local_feedback, _sanitize_feedback_text(text), "bedrock"
    except Exception as exc:
        print(f"Bedrock feedback generation failed: {exc}")

    return local_feedback, None, "local_fallback"
