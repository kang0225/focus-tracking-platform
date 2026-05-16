"""Shared configuration values for the ML service."""

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


# Redis. Node.js writes records directly to this Redis instance; FastAPI only
# reads the session list during /analyze.
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = _get_int_env("REDIS_PORT", 6379)
SESSION_TTL_SECONDS = _get_int_env("SESSION_TTL_SECONDS", 86_400)

# Windowing
WINDOW_SIZE = _get_int_env("WINDOW_SIZE", 60)
GAZE_MISSING_EXCLUDE_SECONDS = _get_int_env("GAZE_MISSING_EXCLUDE_SECONDS", 30)

# Focus score and threshold defaults
EPSILON = _get_float_env("EPSILON", 1e-6)
INITIAL_THRESHOLD = _get_float_env("INITIAL_THRESHOLD", 17.183)
THRESHOLD_RATIO = _get_float_env("THRESHOLD_RATIO", 0.33)
EMA_ALPHA = _get_float_env("EMA_ALPHA", 0.1)
MIN_GAP = _get_float_env("MIN_GAP", 1.0)

# Trend classification
FOCUS_TREND_DELTA = _get_float_env("FOCUS_TREND_DELTA", 0.5)
HEART_TREND_DELTA = _get_float_env("HEART_TREND_DELTA", 2.0)

# Basic physiological guardrails
MIN_HEART_RATE = _get_float_env("MIN_HEART_RATE", 40.0)
MAX_HEART_RATE = _get_float_env("MAX_HEART_RATE", 200.0)


def session_records_key(user_id: str, session_id: str) -> str:
    """Redis list key Node.js should RPUSH per-second records into."""
    return f"study:session:{user_id}:{session_id}:records"
