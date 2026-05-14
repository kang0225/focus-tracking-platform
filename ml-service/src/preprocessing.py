# src/preprocessing.py

from typing import List, Dict, Any

import pandas as pd

from src.params import REQUIRED_COLUMNS, MODEL_INPUT_COLUMNS


def preprocess_tracking_data(raw_data: List[Dict[str, Any]]) -> pd.DataFrame:
    """
    Redis에서 가져온 tracking JSON 리스트를 전처리한다.

    처리 내용:
    1. DataFrame 변환
    2. 필수 컬럼 확인
    3. timestamp datetime 변환
    4. heartRate, gazeX, gazeY 숫자형 변환
    5. 결측값 포함 행 제거
    6. timestamp 기준 정렬
    7. 모델 입력 컬럼 3개만 반환
    """

    if not raw_data:
        raise ValueError("전처리할 데이터가 비어 있습니다.")

    df = pd.DataFrame(raw_data)

    missing_columns = [
        col for col in REQUIRED_COLUMNS
        if col not in df.columns
    ]

    if missing_columns:
        raise ValueError(f"필수 컬럼이 없습니다: {missing_columns}")

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    df["heartRate"] = pd.to_numeric(df["heartRate"], errors="coerce")
    df["gazeX"] = pd.to_numeric(df["gazeX"], errors="coerce")
    df["gazeY"] = pd.to_numeric(df["gazeY"], errors="coerce")

    df = df.dropna(subset=REQUIRED_COLUMNS)

    if df.empty:
        raise ValueError("결측값 제거 후 남은 데이터가 없습니다.")

    df = df.sort_values("timestamp").reset_index(drop=True)

    df = df[MODEL_INPUT_COLUMNS]

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