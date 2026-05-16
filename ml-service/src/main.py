import json
from typing import Optional

import redis.asyncio as redis
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from src.params import (
    REDIS_HOST,
    REDIS_PORT,
    WINDOW_SIZE,
    latest_key,
)
from src.preprocessing import (
    preprocess_tracking_data,
    split_into_windows,
)
from src.inference import run_inference


app = FastAPI()

r = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    decode_responses=True,
)


class AnalyzeRequest(BaseModel):
    userId: str
    studySessionId: str
    streamKey: str


class TrackingRow(BaseModel):
    userId: str
    studySessionId: str
    timestamp: str
    heartRate: Optional[float] = None
    gazeX: Optional[float] = None
    gazeY: Optional[float] = None


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "focus-analysis-api",
    }


def parse_redis_entries(entries, user_id: str, study_session_id: str):
    """
    Redis Stream entries를 JSON 리스트로 변환한다.

    userId, studySessionId가 요청값과 일치하는 데이터만 사용한다.
    """

    raw_data = []

    for _, fields in entries:
        if "data" not in fields:
            continue

        try:
            row = json.loads(fields["data"])
        except json.JSONDecodeError:
            continue

        if row.get("userId") != user_id:
            continue

        if row.get("studySessionId") != study_session_id:
            continue

        raw_data.append(row)

    return raw_data


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    try:
        # 1. Redis Stream에서 원본 데이터 읽기
        entries = await r.xrange(req.streamKey, min="-", max="+")

        if not entries:
            raise HTTPException(
                status_code=404,
                detail="해당 streamKey에 저장된 tracking 데이터가 없습니다.",
            )

        # 2. Redis Stream entry 파싱
        raw_data = parse_redis_entries(
            entries=entries,
            user_id=req.userId,
            study_session_id=req.studySessionId,
        )

        if not raw_data:
            raise HTTPException(
                status_code=404,
                detail="요청한 userId/studySessionId와 일치하는 데이터가 없습니다.",
            )

        # 3. 전처리
        df = preprocess_tracking_data(raw_data)

        # 4. 60개씩 window 생성
        windows = split_into_windows(
            df=df,
            window_size=WINDOW_SIZE,
        )

        # 5. 추론
        inference_result = run_inference(windows)

        result = {
            "ok": True,
            "userId": req.userId,
            "studySessionId": req.studySessionId,
            "rawDataCount": len(raw_data),
            "processedDataCount": len(df),
            "windowSize": WINDOW_SIZE,
            "windowCount": len(windows),
            **inference_result,
        }

        # 6. 분석 성공 후 Redis 데이터 삭제
        deleted_count = await r.delete(
            req.streamKey,
            latest_key(req.userId, req.studySessionId),
        )

        result["deletedRedisKeys"] = deleted_count

        return result

    except HTTPException:
        raise

    except ValueError as e:
        # 전처리 오류
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )

    except Exception as e:
        # 분석 실패 시 Redis 원본 데이터 삭제하지 않음
        raise HTTPException(
            status_code=500,
            detail=f"분석 중 오류가 발생했습니다: {str(e)}",
        )