"""Schemas untuk Prediction responses"""
from datetime import date
from typing import Optional
from pydantic import BaseModel


class PredictionOut(BaseModel):
    algorithm: str
    experiment_name: str
    prediction_date: date
    predicted_class: int
    signal: str              # "NAIK" | "STAGNAN/TURUN"
    probability: Optional[float] = None
    actual_class: Optional[int] = None

    class Config:
        from_attributes = True


class PredictionCompare(BaseModel):
    """Perbandingan prediksi 3 model sekaligus"""
    ticker: str
    prediction_date: date
    logistic_regression: Optional[PredictionOut] = None
    decision_tree: Optional[PredictionOut] = None
    random_forest: Optional[PredictionOut] = None
