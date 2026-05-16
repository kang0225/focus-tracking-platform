from typing import Optional, Dict, Any

import joblib
import numpy as np
import pandas as pd

from src.params import (
    MODEL_PATH,
    HEART_RATE_LABEL_DOWN,
    HEART_RATE_LABEL_STABLE,
    HEART_RATE_LABEL_UP,
)

class HeartRateModel:
    """
    심박수 상태를 예측하는 모델 wrapper.

    입력:
    - 1분 window의 heartRate 데이터

    출력 라벨:
    - 심박수 저하됨
    - 심박수 일관됨
    - 심박수 높아짐
    """

    def __init__(self):
        self.model = None

    def _load_model(self, model_path: str):
        try:
            return joblib.load(model_path)
        except FileNotFoundError:
            raise FileNotFoundError(f"모델 파일을 찾을 수 없습니다: {model_path}")
        except Exception as e:
            raise RuntimeError(f"모델 로드 중 오류 발생: {str(e)}")

    def extract_heart_rate_features(
        self,
        window: pd.DataFrame,
        session_hr_mean: float,
        session_hr_std: float,
    ) -> Dict[str, float]:
        """
        1분 window에서 심박수 관련 feature를 추출한다.

        개인마다 심박수 baseline이 다르기 때문에,
        session_hr_mean, session_hr_std를 이용해서
        현재 window가 세션 평균 대비 얼마나 다른지 계산한다.
        """

        hr = window["heartRate"]

        hr_mean = float(hr.mean())

        hr_std_raw = hr.std()
        hr_std = float(hr_std_raw) if not np.isnan(hr_std_raw) else 0.0

        hr_min = float(hr.min())
        hr_max = float(hr.max())
        hr_range = float(hr_max - hr_min)

        hr_start = float(hr.iloc[0])
        hr_end = float(hr.iloc[-1])
        hr_diff = float(hr_end - hr_start)

        # 단순 기울기
        hr_slope = float(hr_diff / len(hr))

        if session_hr_std == 0 or np.isnan(session_hr_std):
            hr_zscore = 0.0
        else:
            hr_zscore = float((hr_mean - session_hr_mean) / session_hr_std)

        return {
            "hrMean": hr_mean,
            "hrStd": hr_std,
            "hrMin": hr_min,
            "hrMax": hr_max,
            "hrRange": hr_range,
            "hrStart": hr_start,
            "hrEnd": hr_end,
            "hrDiff": hr_diff,
            "hrSlope": hr_slope,
            "hrZScore": hr_zscore,
            "hrDeltaFromSessionMean": float(hr_mean - session_hr_mean),
        }

    def _features_to_array(self, features: Dict[str, float]) -> np.ndarray:
        """
        실제 ML 모델에 넣기 위한 feature 배열 생성.

        중요:
        학습할 때도 이 feature 순서와 동일해야 한다.
        """

        return np.array([[
            features["hrMean"],
            features["hrStd"],
            features["hrMin"],
            features["hrMax"],
            features["hrRange"],
            features["hrDiff"],
            features["hrSlope"],
            features["hrZScore"],
            features["hrDeltaFromSessionMean"],
        ]])

    def _dummy_predict(self, features: Dict[str, float]) -> str:
        """
        실제 모델 파일이 없을 때 사용하는 임시 규칙 기반 예측.

        나중에 heart_rate_model.pkl이 준비되면
        USE_DUMMY_MODEL=false로 바꾸고 실제 모델 예측을 사용하면 된다.
        """

        hr_z = features["hrZScore"]
        hr_diff = features["hrDiff"]

        if hr_z <= HR_Z_DOWN_THRESHOLD and hr_diff < 0:
            return HEART_RATE_LABEL_DOWN

        if hr_z >= HR_Z_UP_THRESHOLD and hr_diff > 0:
            return HEART_RATE_LABEL_UP

        return HEART_RATE_LABEL_STABLE

    def predict_window(
        self,
        window: pd.DataFrame,
        session_hr_mean: float,
        session_hr_std: float,
    ) -> Dict[str, Any]:
        """
        하나의 1분 window에 대해 심박수 상태를 예측한다.
        """

        features = self.extract_heart_rate_features(
            window=window,
            session_hr_mean=session_hr_mean,
            session_hr_std=session_hr_std,
        )

        if self.use_dummy:
            label = self._dummy_predict(features)
        else:
            x = self._features_to_array(features)
            prediction = self.model.predict(x)
            label = str(prediction[0])

        return {
            "heartRateLabel": label,
            "heartRateFeatures": features,
        }


heart_rate_model: Optional[HeartRateModel] = None


def get_heart_rate_model() -> HeartRateModel:
    """
    모델은 요청마다 로드하지 않고,
    서버 프로세스에서 한 번만 생성해서 재사용한다.
    """

    global heart_rate_model

    if heart_rate_model is None:
        heart_rate_model = HeartRateModel()

    return heart_rate_model