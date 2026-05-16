REDIS_HOST = "redis"
REDIS_PORT = 6379
WINDOW_SIZE = 60

REQUIRED_COLUMNS = [
    "timestamp",
    "heartRate",
    "gazeX",
    "gazeY",
]

PROCESSED_COLUMNS = [
    "heartRate",
    "gazeMissing",
]

HEART_RATE_INPUT_COLUMNS = [
    "heartRate",
]

MODEL_PATH = "models/heart_rate_model.pkl"

#################
### Label 설정 ###
#################
HEART_RATE_LABEL_DOWN = "심박수 저하됨"
HEART_RATE_LABEL_STABLE = "심박수 일관됨"
HEART_RATE_LABEL_UP = "심박수 높아짐"

GAZE_LABEL_LONG_OUT = "시선이 모니터를 벗어난 시간이 길음"
GAZE_LABEL_SHORT_OUT = "시선이 모니터를 벗어난 시간이 짧음"


################
### 기준값 설정 ###
################
# 1분 window에서 gazeMissing 비율이 0.1 이상이면
# 시선이 모니터를 벗어난 시간이 길다고 판단
GAZE_MISSING_LONG_THRESHOLD = 0.1

#####################
### Redis Key 규칙 ###
#####################

def latest_key(user_id: str, study_session_id: str) -> str:
    return f"study:{user_id}:{study_session_id}:latest"


def tracking_stream_key(user_id: str, study_session_id: str) -> str:
    return f"study:{user_id}:{study_session_id}:tracking"