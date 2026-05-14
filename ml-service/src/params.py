# src/params.py

import os


# =========================
# Redis 설정
# =========================

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))


# =========================
# 데이터 / 전처리 설정
# =========================

WINDOW_SIZE = int(os.getenv("WINDOW_SIZE", "60"))

REQUIRED_COLUMNS = [
    "timestamp",
    "heartRate",
    "gazeX",
    "gazeY",
]

MODEL_INPUT_COLUMNS = [
    "heartRate",
    "gazeX",
    "gazeY",
]


# =========================
# Redis Key 규칙
# =========================

def latest_key(user_id: str, study_session_id: str) -> str:
    return f"study:{user_id}:{study_session_id}:latest"


def tracking_stream_key(user_id: str, study_session_id: str) -> str:
    return f"study:{user_id}:{study_session_id}:tracking"


# =========================
# 모델 설정
# =========================

MODEL_PATH = os.getenv("MODEL_PATH", "models/focus_model.pkl")