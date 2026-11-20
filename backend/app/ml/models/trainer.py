"""
ML Training Module
Training pipeline untuk 3 algoritma: Logistic Regression, Decision Tree, Random Forest.
Menggunakan TimeSeriesSplit untuk mencegah data leakage.
"""
import json
import logging
import os
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, confusion_matrix
)

from app.core.config import settings
from app.ml.features.engineering import FEATURE_COLS

logger = logging.getLogger(__name__)

# ─── Algoritma yang Didukung ──────────────────────────────────
ALGORITHM_LOGISTIC   = "LOGISTIC_REGRESSION"
ALGORITHM_DECISION   = "DECISION_TREE"
ALGORITHM_FOREST     = "RANDOM_FOREST"


# ─── Default Hyperparameter Grid ─────────────────────────────
DEFAULT_PARAM_GRIDS = {
    ALGORITHM_LOGISTIC: {
        "clf__C": [0.01, 0.1, 1.0, 10.0],
        "clf__penalty": ["l1", "l2"],
        "clf__solver": ["liblinear", "saga"],
        "clf__max_iter": [500],
    },
    ALGORITHM_DECISION: {
        "clf__max_depth": [3, 5, 8, 12, None],
        "clf__criterion": ["gini", "entropy"],
        "clf__min_samples_split": [2, 5, 10],
        "clf__min_samples_leaf": [1, 2, 5],
    },
    ALGORITHM_FOREST: {
        "clf__n_estimators": [100, 200, 300],
        "clf__max_depth": [5, 10, 20, None],
        "clf__max_features": ["sqrt", "log2"],
        "clf__min_samples_leaf": [1, 2, 5],
    },
}


def _build_pipeline(algorithm: str) -> Pipeline:
    """
    Buat sklearn Pipeline sesuai algoritma.
    LR menggunakan StandardScaler. DT & RF scale-invariant (tidak perlu scaler).
    """
    if algorithm == ALGORITHM_LOGISTIC:
        return Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(random_state=42, class_weight="balanced")),
        ])
    elif algorithm == ALGORITHM_DECISION:
        return Pipeline([
            ("clf", DecisionTreeClassifier(random_state=42, class_weight="balanced")),
        ])
    elif algorithm == ALGORITHM_FOREST:
        return Pipeline([
            ("clf", RandomForestClassifier(
                random_state=42, class_weight="balanced", n_jobs=-1
            )),
        ])
    else:
        raise ValueError(f"Unknown algorithm: {algorithm}")


def _compute_metrics(y_true, y_pred, y_proba=None) -> dict:
    """Hitung semua metrik evaluasi."""
    cm = confusion_matrix(y_true, y_pred).tolist()
    metrics = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1_score": float(f1_score(y_true, y_pred, zero_division=0)),
        "confusion_matrix": cm,
        "auc_roc": None,
    }
    if y_proba is not None:
        try:
            metrics["auc_roc"] = float(roc_auc_score(y_true, y_proba))
        except Exception:
            pass
    return metrics


def train_model(
    df: pd.DataFrame,
    algorithm: str,
    experiment_name: str,
    param_grid: Optional[Dict] = None,
    n_splits: int = 5,
    use_grid_search: bool = True,
    threshold: float = 0.0,
) -> Dict[str, Any]:
    """
    Training pipeline lengkap untuk satu algoritma.

    Args:
        df: DataFrame dari load_features_from_db() — sudah ada kolom FEATURE_COLS + target
        algorithm: LOGISTIC_REGRESSION | DECISION_TREE | RANDOM_FOREST
        experiment_name: nama eksperimen untuk logging & penyimpanan
        param_grid: Hyperparameter grid (default dari DEFAULT_PARAM_GRIDS)
        n_splits: jumlah fold untuk TimeSeriesSplit
        use_grid_search: jika False, gunakan default hyperparameter
        threshold: threshold label (untuk logging)

    Returns:
        dict dengan keys: metrics, best_params, model_path, feature_importance
    """
    logger.info(f"=== Training {algorithm}: '{experiment_name}' ===")

    # ─── Prepare Data ─────────────────────────────────────
    df_clean = df[FEATURE_COLS + ["target"]].dropna()
    if len(df_clean) < 100:
        raise ValueError(f"Not enough data after dropna: {len(df_clean)} rows")

    X = df_clean[FEATURE_COLS].values
    y = df_clean["target"].values

    logger.info(f"Dataset size: {len(X)} rows | Class dist: {np.bincount(y)}")

    # ─── Time Series Split ────────────────────────────────
    # PENTING: Gunakan TimeSeriesSplit, bukan random shuffle split
    tscv = TimeSeriesSplit(n_splits=n_splits)

    # Train pada semua data kecuali fold terakhir (untuk evaluasi final)
    splits = list(tscv.split(X))
    train_idx, test_idx = splits[-1]  # Fold terakhir sebagai test set final

    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    logger.info(f"Train: {len(X_train)}, Test: {len(X_test)}")

    # ─── Build Pipeline ───────────────────────────────────
    pipeline = _build_pipeline(algorithm)

    # ─── Hyperparameter Tuning ────────────────────────────
    if use_grid_search:
        grid = param_grid or DEFAULT_PARAM_GRIDS.get(algorithm, {})
        search = GridSearchCV(
            pipeline,
            grid,
            cv=TimeSeriesSplit(n_splits=3),
            scoring="f1",
            n_jobs=-1,
            verbose=1,
        )
        search.fit(X_train, y_train)
        best_model = search.best_estimator_
        best_params = search.best_params_
        logger.info(f"Best params: {best_params}")
    else:
        pipeline.fit(X_train, y_train)
        best_model = pipeline
        best_params = {}

    # ─── Evaluate ─────────────────────────────────────────
    y_pred = best_model.predict(X_test)
    y_proba = None
    try:
        y_proba = best_model.predict_proba(X_test)[:, 1]
    except Exception:
        pass

    metrics = _compute_metrics(y_test, y_pred, y_proba)
    logger.info(f"Metrics: {metrics}")

    # ─── Feature Importance ───────────────────────────────
    feature_importance = {}
    try:
        clf = best_model.named_steps["clf"]
        if hasattr(clf, "feature_importances_"):
            fi = clf.feature_importances_
            feature_importance = dict(zip(FEATURE_COLS, fi.tolist()))
        elif hasattr(clf, "coef_"):
            fi = np.abs(clf.coef_[0])
            feature_importance = dict(zip(FEATURE_COLS, fi.tolist()))
    except Exception as e:
        logger.warning(f"Could not extract feature importance: {e}")

    # ─── Save Model ───────────────────────────────────────
    models_dir = Path(settings.MODELS_DIR)
    models_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    fname = f"{algorithm.lower()}_{timestamp}.joblib"
    model_path = str(models_dir / fname)
    joblib.dump(best_model, model_path)
    logger.info(f"Model saved to: {model_path}")

    return {
        "algorithm": algorithm,
        "experiment_name": experiment_name,
        "best_params": best_params,
        "metrics": metrics,
        "feature_importance": feature_importance,
        "model_path": model_path,
        "train_size": len(X_train),
        "test_size": len(X_test),
    }


def save_experiment_to_db(
    session,
    result: Dict[str, Any],
    train_start: Optional[date] = None,
    train_end: Optional[date] = None,
    test_start: Optional[date] = None,
    test_end: Optional[date] = None,
    ticker: Optional[str] = None,
    notes: str = "",
) -> int:
    """
    Simpan hasil eksperimen ke tabel model_experiments.
    Returns experiment ID.
    """
    from app.db.models import ModelExperiment

    metrics = result["metrics"]
    exp = ModelExperiment(
        experiment_name=result["experiment_name"],
        algorithm=result["algorithm"],
        ticker=ticker,
        parameters=result["best_params"],
        train_start_date=train_start,
        train_end_date=train_end,
        test_start_date=test_start,
        test_end_date=test_end,
        accuracy=metrics.get("accuracy"),
        precision=metrics.get("precision"),
        recall=metrics.get("recall"),
        f1_score=metrics.get("f1_score"),
        auc_roc=metrics.get("auc_roc"),
        confusion_matrix=metrics.get("confusion_matrix"),
        feature_importance=result.get("feature_importance"),
        model_file_path=result["model_path"],
        notes=notes,
    )
    session.add(exp)
    session.commit()
    session.refresh(exp)
    logger.info(f"Saved experiment to DB: id={exp.id}")
    return exp.id
