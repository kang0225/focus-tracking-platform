"""Redis 기반 세션 분석을 제공하는 FastAPI 진입점."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Optional

import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.inference import SessionDataNotFoundError, analyze_session
from src.params import REDIS_HOST, REDIS_PORT, session_records_key


redis_client: Optional[redis.Redis] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client

    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        decode_responses=True,
    )

    try:
        await redis_client.ping()
        print("Redis connected successfully.")
    except Exception as exc:
        print(f"Redis connection check failed: {exc}")

    yield

    if redis_client is not None:
        await redis_client.aclose()


def get_redis_client() -> redis.Redis:
    if redis_client is None:
        raise RuntimeError("Redis client is not initialized.")
    return redis_client


app = FastAPI(
    title="Focus Tracking ML Service",
    description=(
        "Node.js 백엔드가 Redis에 직접 기록한 초 단위 학습 데이터를 읽고 "
        "분 단위 집중도 분석 결과를 반환한다."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    userId: str = Field(..., description="사용자 ID")
    sessionId: str = Field(..., description="학습 세션 ID")
    include_feedback: bool = Field(
        True,
        description="분 단위 분석 결과로 최종 학습 습관 피드백 문자열을 생성할지 여부",
    )
    delete_after: bool = Field(
        False,
        description="분석 성공 후 Redis 세션 기록을 삭제할지 여부",
    )


class HealthResponse(BaseModel):
    status: str


class MinuteAnalysis(BaseModel):
    minute_index: int
    start_time: str
    end_time: str
    heartRate_mean: Optional[float]
    heartRate_std: Optional[float]
    heartRate_min: Optional[float]
    heartRate_max: Optional[float]
    heartRate_slope: Optional[float]
    rPPG_mean: Optional[float]
    rPPG_std: Optional[float]
    rPPG_min: Optional[float]
    rPPG_max: Optional[float]
    rPPG_slope: Optional[float]
    gaze_missing_seconds: int
    gaze_missing_rate: float
    focus_score: Optional[float]
    threshold: Optional[float]
    focus_state: str
    focus_trend: str
    heart_trend: str
    used_for_threshold_update: bool


class AnalysisSummary(BaseModel):
    focus_up_minutes: int
    focus_stable_minutes: int
    focus_down_minutes: int
    high_focus_minutes: int
    low_focus_minutes: int
    avg_gaze_missing_rate: float


class ResultMetrics(BaseModel):
    duration_seconds: int
    avg_bpm: Optional[int] = None
    focus_ratio: Optional[int] = None


class GazeHeatmapCell(BaseModel):
    column: int
    row: int
    x: float
    y: float
    count: int
    intensity: float


class GazeHeatmap(BaseModel):
    columns: int
    rows: int
    total_points: int
    x_min: Optional[float] = None
    x_max: Optional[float] = None
    y_min: Optional[float] = None
    y_max: Optional[float] = None
    cells: list[GazeHeatmapCell]


class FocusTimelinePoint(BaseModel):
    minute_index: int
    elapsed_seconds: int
    focus_score: Optional[float] = None
    threshold: Optional[float] = None
    focus_state: str
    focus_trend: str


class AnalyzeResponse(BaseModel):
    userId: str
    sessionId: str
    duration_minutes: int
    summary: AnalysisSummary
    minutes: list[MinuteAnalysis]
    result_metrics: ResultMetrics
    gaze_heatmap: GazeHeatmap
    focus_timeline: list[FocusTimelinePoint]
    feedback: Optional[str] = None
    feedback_source: Optional[str] = None


class DeleteSessionResponse(BaseModel):
    status: str
    key: str
    count: int


@app.get("/health", response_model=HealthResponse)
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> dict[str, object]:
    if not req.userId.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="userId must not be empty.",
        )

    if not req.sessionId.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sessionId must not be empty.",
        )

    try:
        return await analyze_session(
            user_id=req.userId,
            session_id=req.sessionId,
            delete_after=req.delete_after,
            include_feedback=req.include_feedback,
            redis_client=get_redis_client(),
        )
    except SessionDataNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@app.delete("/sessions/{user_id}/{session_id}/records", response_model=DeleteSessionResponse)
async def delete_session_data(
    user_id: str,
    session_id: str,
) -> dict[str, int | str]:
    if not user_id.strip() or not session_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_id and session_id must not be empty.",
        )

    client = get_redis_client()
    key = session_records_key(user_id, session_id)

    try:
        deleted_count = int(await client.delete(key))
    except redis.RedisError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Redis delete failed: {exc}",
        ) from exc

    return {"status": "deleted", "key": key, "count": deleted_count}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
