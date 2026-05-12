from fastapi import FastAPI
import numpy as np
import pandas as pd
from src.preprocessing import preprocess_data
from src.inference import predict_focus_state
from src.model import load_model
from src.params import MODEL_PATH

app = FastAPI(title="Focus Tracking ML Service")

@app.get("/health")
def health_check():
    return {"status": "ok"}