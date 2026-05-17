"""ML 서비스에서 공통으로 사용하는 설정값."""

import os


def _get_int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        return int(raw_value)
    except ValueError:
        return default


def _get_float_env(name: str, default: float) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        return float(raw_value)
    except ValueError:
        return default


# Redis 설정. Node.js가 이 Redis에 직접 기록을 쓰고,
# FastAPI는 /analyze 요청 시 세션 목록만 읽는다.
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = _get_int_env("REDIS_PORT", 6379)
SESSION_TTL_SECONDS = _get_int_env("SESSION_TTL_SECONDS", 86_400)

# 윈도우 분할 설정
WINDOW_SIZE = _get_int_env("WINDOW_SIZE", 60)
GAZE_MISSING_EXCLUDE_SECONDS = _get_int_env("GAZE_MISSING_EXCLUDE_SECONDS", 30)

# 집중도 점수와 임계값 기본 설정
EPSILON = _get_float_env("EPSILON", 1e-6)
INITIAL_THRESHOLD = _get_float_env("INITIAL_THRESHOLD", 17.183)
THRESHOLD_RATIO = _get_float_env("THRESHOLD_RATIO", 0.33)
EMA_ALPHA = _get_float_env("EMA_ALPHA", 0.1)
MIN_GAP = _get_float_env("MIN_GAP", 1.0)

# 추세 분류 설정
FOCUS_TREND_DELTA = _get_float_env("FOCUS_TREND_DELTA", 0.5)
HEART_TREND_DELTA = _get_float_env("HEART_TREND_DELTA", 2.0)

# 기본 생체 신호 유효 범위
MIN_HEART_RATE = _get_float_env("MIN_HEART_RATE", 40.0)
MAX_HEART_RATE = _get_float_env("MAX_HEART_RATE", 200.0)

# LLM 피드백 설정. Amazon Bedrock Runtime의 기본 리전 엔드포인트를 호출한다.
# VPC 인터페이스 엔드포인트를 나중에 추가하지 않는 한,
# 프라이빗 서브넷에서는 기존 NAT 게이트웨이 경로를 사용한다.
AWS_REGION = (
    os.getenv("AWS_REGION")
    or os.getenv("AWS_DEFAULT_REGION")
    or "ap-northeast-2"
).strip()
BEDROCK_REGION = os.getenv("BEDROCK_REGION", AWS_REGION).strip()
BEDROCK_MODEL_ID = os.getenv(
    "BEDROCK_MODEL_ID",
    "anthropic.claude-sonnet-4-5-20250929-v1:0",
).strip()
BEDROCK_MAX_OUTPUT_TOKENS = _get_int_env("BEDROCK_MAX_OUTPUT_TOKENS", 700)
BEDROCK_TEMPERATURE = _get_float_env("BEDROCK_TEMPERATURE", 0.2)
BEDROCK_CONNECT_TIMEOUT_SECONDS = _get_float_env(
    "BEDROCK_CONNECT_TIMEOUT_SECONDS",
    3.0,
)
BEDROCK_READ_TIMEOUT_SECONDS = _get_float_env(
    "BEDROCK_READ_TIMEOUT_SECONDS",
    20.0,
)
BEDROCK_MAX_ATTEMPTS = _get_int_env("BEDROCK_MAX_ATTEMPTS", 2)


def session_records_key(user_id: str, session_id: str) -> str:
    """Node.js가 초 단위 기록을 RPUSH해야 하는 Redis 리스트 키."""
    return f"study:session:{user_id}:{session_id}:records"
