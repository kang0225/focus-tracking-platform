# src/model.py

from typing import Optional

import joblib
import numpy as np
import pandas as pd

from src.params import MODEL_PATH


class FocusModel:
    """
    집중도 예측 모델 wrapper.

    현재는 실제 모델이 없을 수 있으므로 dummy 예측을 지원한다.
    나중에 focus_model.pkl이 준비되면 USE_DUMMY_MODEL=false로 바꾸면 된다.
    """

    def __init__(self):
        self.model = None
        self.use_dummy = USE_DUMMY_MODEL

        if not self.use_dummy:
            self.model = self._load_model(MODEL_PATH)

    def _load_model(self, model_path: str):
        try:
            return joblib.load(model_path)
        except FileNotFoundError:
            raise FileNotFoundError(f"모델 파일을 찾을 수 없습니다: {model_path}")
        except Exception as e:
            raise RuntimeError(f"모델 로드 중 오류 발생: {str(e)}")

    def _make_features(self, window: pd.DataFrame) -> np.ndarray:
        """
        60개 row를 하나의 feature vector로 변환한다.

        입력 컬럼:
        - heartRate
        - gazeX
        - gazeY

        출력 예:
        [
          heartRate_mean,
          heartRate_std,
          gazeX_mean,
          gazeX_std,
          gazeY_mean,
          gazeY_std,
          gaze_movement
        ]
        """

        heart_rate_mean = window["heartRate"].mean()
        heart_rate_std = window["heartRate"].std()

        gaze_x_mean = window["gazeX"].mean()
        gaze_x_std = window["gazeX"].std()

        gaze_y_mean = window["gazeY"].mean()
        gaze_y_std = window["gazeY"].std()

        gaze_x_range = window["gazeX"].max() - window["gazeX"].min()
        gaze_y_range = window["gazeY"].max() - window["gazeY"].min()
        gaze_movement = gaze_x_range + gaze_y_range

        features = np.array([[
            heart_rate_mean,
            heart_rate_std,
            gaze_x_mean,
            gaze_x_std,
            gaze_y_mean,
            gaze_y_std,
            gaze_movement,
        ]])

        return features

    def predict_window(self, window: pd.DataFrame) -> dict:
        """
        하나의 window에 대해 집중도 예측을 수행한다.
        """

        features = self._make_features(window)

        avg_heart_rate = float(window["heartRate"].mean())

        gaze_x_range = window["gazeX"].max() - window["gazeX"].min()
        gaze_y_range = window["gazeY"].max() - window["gazeY"].min()
        gaze_movement = float(gaze_x_range + gaze_y_range)

        if self.use_dummy:
            # 임시 예측값
            focus_score = 0.75
        else:
            prediction = self.model.predict(features)
            focus_score = float(prediction[0])

        return {
            "avgHeartRate": avg_heart_rate,
            "gazeMovement": gaze_movement,
            "focusScore": float(focus_score),
        }


focus_model: Optional[FocusModel] = None


def get_focus_model() -> FocusModel:
    """
    모델은 요청마다 로드하면 느리므로,
    서버 프로세스에서 한 번만 생성해서 재사용한다.
    """

    global focus_model

    if focus_model is None:
        focus_model = FocusModel()

    return focus_model