"""Schemas untuk Experiment (Admin Panel)"""
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class ExperimentOut(BaseModel):
    id: int
    experiment_name: str
    algorithm: str
    ticker: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    train_start_date: Optional[date] = None
    train_end_date: Optional[date] = None
    accuracy: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1_score: Optional[float] = None
    auc_roc: Optional[float] = None
    confusion_matrix: Optional[List[List[int]]] = None
    feature_importance: Optional[Dict[str, float]] = None
    win_rate: Optional[float] = None
    max_drawdown: Optional[float] = None
    profitability_factor: Optional[float] = None
    model_file_path: Optional[str] = None
    is_active: bool = False
    created_at: Optional[datetime] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class ExperimentTrigger(BaseModel):
    """Request body untuk trigger training baru"""
    algorithm: str              # LOGISTIC_REGRESSION | DECISION_TREE | RANDOM_FOREST
    experiment_name: str
    ticker: Optional[str] = None  # None = semua saham
    use_grid_search: bool = True
    custom_params: Optional[Dict[str, Any]] = None


class BacktestRequest(BaseModel):
    experiment_id: int
    stock_id: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    initial_capital: float = 10_000_000
    transaction_cost_pct: float = 0.001


class BacktestOut(BaseModel):
    experiment_id: int
    stock_id: int
    n_trades: int
    n_wins: int
    win_rate: float
    max_drawdown_pct: float
    profitability_factor: Optional[float] = None
    initial_capital: float
    final_capital: float
    total_return_pct: float
    equity_curve: List[float]
    trades: List[Dict[str, Any]]
