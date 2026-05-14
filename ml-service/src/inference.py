# src/inference.py

from typing import List, Dict, Any

import pandas as pd

from src.model import get_focus_model


def run_window_inference(windows: List[pd.DataFrame]) -> List[Dict[str, Any]]:
    """
    60개 단위 window 리스트에 대해 예측을 수행한다.
    """

    model = get_focus_model()

    predictions = []

    for index, window in enumerate(windows):
        prediction = model.predict_window(window)

        predictions.append({
            "windowIndex": index + 1,
            **prediction,
        })

    return predictions


def summarize_predictions(predictions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    window별 예측 결과를 전체 요약한다.
    """

    if not predictions:
        return {
            "avgFocusScore": None,
            "minFocusScore": None,
            "maxFocusScore": None,
            "lowFocusWindows": [],
        }

    focus_scores = [
        item["focusScore"]
        for item in predictions
        if item.get("focusScore") is not None
    ]

    if not focus_scores:
        return {
            "avgFocusScore": None,
            "minFocusScore": None,
            "maxFocusScore": None,
            "lowFocusWindows": [],
        }

    avg_focus_score = sum(focus_scores) / len(focus_scores)
    min_focus_score = min(focus_scores)
    max_focus_score = max(focus_scores)

    low_focus_windows = [
        item["windowIndex"]
        for item in predictions
        if item.get("focusScore") is not None and item["focusScore"] < 0.6
    ]

    return {
        "avgFocusScore": float(avg_focus_score),
        "minFocusScore": float(min_focus_score),
        "maxFocusScore": float(max_focus_score),
        "lowFocusWindows": low_focus_windows,
    }


def run_inference(windows: List[pd.DataFrame]) -> Dict[str, Any]:
    """
    전체 추론 파이프라인.

    1. window별 예측
    2. 전체 요약 생성
    """

    predictions = run_window_inference(windows)
    summary = summarize_predictions(predictions)

    return {
        "summary": summary,
        "predictions": predictions,
    }