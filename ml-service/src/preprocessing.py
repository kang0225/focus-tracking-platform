from typing import List, Dict, Any
import pandas as pd
from src.params import REQUIRED_COLUMNS, PROCESSED_COLUMNS


def preprocess_tracking_data(raw_data: List[Dict[str, Any]]) -> pd.DataFrame:
    """
    Redis에서 가져온 tracking JSON 리스트를 전처리한다.

    처리 내용:
    1. DataFrame 변환
    2. timestamp datetime 변환
    3. heartRate, gazeX, gazeY 숫자형 변환
    4. gazeX/gazeY 결측 여부를 gazeMissing으로 저장
    5. timestamp, heartRate 결측 행 제거
    6. timestamp 기준 정렬
    7. 최종적으로 heartRate, gazeMissing만 반환

    주의:
    - gazeX/gazeY가 NaN인 것은 시선이 화면 밖으로 나갔거나 추적 실패한 신호일 수 있음.
    - 따라서 해당 행을 삭제하지 않고 gazeMissing=1로 보존함.
    - gazeX/gazeY 좌표값 자체는 모델 입력에 쓰지 않으므로 최종 반환에서 제거함.
    """

    if not raw_data:
        raise ValueError("전처리할 데이터가 비어 있습니다.")

    df = pd.DataFrame(raw_data)

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df["heartRate"] = pd.to_numeric(df["heartRate"], errors="coerce")
    df["gazeX"] = pd.to_numeric(df["gazeX"], errors="coerce")
    df["gazeY"] = pd.to_numeric(df["gazeY"], errors="coerce")

    # gazeX 또는 gazeY 중 하나라도 없으면 시선 이탈/추적 실패로 간주
    df["gazeMissing"] = (
        df["gazeX"].isna() | df["gazeY"].isna()
    ).astype(int)

    df = df.dropna(subset=["timestamp", "heartRate"])

    if df.empty:
        raise ValueError("timestamp/heartRate 결측 제거 후 남은 데이터가 없습니다.")

    df = df.sort_values("timestamp").reset_index(drop=True)
    df = df[PROCESSED_COLUMNS]

    return df


def split_into_windows(df: pd.DataFrame, window_size: int) -> List[pd.DataFrame]:
    """
    전처리된 데이터를 window_size 단위로 나눈다.

    예:
    3600개 데이터, window_size=60
    → 60개 window 생성
    """

    if df.empty:
        raise ValueError("window로 나눌 데이터가 비어 있습니다.")

    windows = []

    for start in range(0, len(df), window_size):
        window = df.iloc[start:start + window_size]

        # 60개가 꽉 찬 window만 사용
        if len(window) == window_size:
            windows.append(window)

    if not windows:
        raise ValueError(
            f"생성된 window가 없습니다. 데이터 개수가 {window_size}개 미만일 수 있습니다."
        )

    return windows