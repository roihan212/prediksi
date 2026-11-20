"""
Admin & Experiments Endpoints (Protected by JWT)
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import ModelExperiment
from app.schemas.experiment import ExperimentOut, ExperimentTrigger, BacktestRequest, BacktestOut

router = APIRouter()


# ─── Experiments ──────────────────────────────────────────────
@router.get("/", response_model=List[ExperimentOut], summary="List semua eksperimen")
async def list_experiments(
    algorithm: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List semua eksperimen ML yang pernah dijalankan."""
    query = select(ModelExperiment).order_by(ModelExperiment.created_at.desc())
    if algorithm:
        query = query.where(ModelExperiment.algorithm == algorithm.upper())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{experiment_id}", response_model=ExperimentOut, summary="Detail satu eksperimen")
async def get_experiment(experiment_id: int, db: AsyncSession = Depends(get_db)):
    """Detail lengkap eksperimen: metrics, confusion matrix, feature importance."""
    exp = await db.get(ModelExperiment, experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment tidak ditemukan")
    return exp


@router.post("/{experiment_id}/activate", summary="Aktifkan model sebagai model produksi")
async def activate_experiment(experiment_id: int, db: AsyncSession = Depends(get_db)):
    """Set is_active=True untuk model ini (nonaktifkan model lain)."""
    # Nonaktifkan semua dulu
    all_exps_result = await db.execute(select(ModelExperiment))
    all_exps = all_exps_result.scalars().all()
    for e in all_exps:
        e.is_active = False

    # Aktifkan yang diminta
    exp = await db.get(ModelExperiment, experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment tidak ditemukan")
    exp.is_active = True
    await db.commit()

    return {"message": f"Model '{exp.experiment_name}' sekarang aktif sebagai model produksi"}


@router.post("/trigger", summary="Trigger training eksperimen baru")
async def trigger_experiment(
    payload: ExperimentTrigger,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger training model baru di background.
    Training berjalan asynchronous — cek status via GET /experiments.
    """
    from app.core.celery_app import run_training_task
    task = run_training_task.delay(
        algorithm=payload.algorithm,
        experiment_name=payload.experiment_name,
        ticker=payload.ticker,
        use_grid_search=payload.use_grid_search,
        custom_params=payload.custom_params,
    )
    return {
        "message": "Training dimulai di background",
        "task_id": task.id,
        "algorithm": payload.algorithm,
        "experiment_name": payload.experiment_name,
    }
