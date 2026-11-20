"""
Backtesting Engine
Simulasi trading historis berdasarkan sinyal prediksi model.
Menghitung Win Rate, Maximum Drawdown, dan Profitability Factor.
"""
import logging
from datetime import date
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sqlalchemy import select

logger = logging.getLogger(__name__)


def run_backtest(
    session,
    experiment_id: int,
    stock_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    initial_capital: float = 10_000_000,  # Rp 10 juta
    transaction_cost_pct: float = 0.001,  # 0.1% biaya transaksi
) -> Dict:
    """
    Simulasi trading sederhana berbasis sinyal prediksi:
    - Beli (long) ketika model prediksi = 1 (NAIK)
    - Tidak beli (stay cash) ketika prediksi = 0

    Args:
        session: SQLAlchemy session
        experiment_id: ID model eksperimen
        stock_id: ID saham yang di-backtest
        start_date: Tanggal mulai backtest
        end_date: Tanggal selesai backtest
        initial_capital: Modal awal dalam Rupiah
        transaction_cost_pct: Persentase biaya transaksi (beli + jual)

    Returns:
        dict: equity_curve, win_rate, max_drawdown, profitability_factor, trades
    """
    from app.db.models import DailyPrice, Prediction, Stock

    # ─── Ambil prediksi yang sudah ada actual_class ────────
    query = (
        select(
            Prediction.prediction_date,
            Prediction.predicted_class,
            Prediction.probability,
            Prediction.actual_class,
            Prediction.actual_close,
        )
        .where(
            Prediction.experiment_id == experiment_id,
            Prediction.stock_id == stock_id,
            Prediction.actual_class.isnot(None),
        )
    )
    if start_date:
        query = query.where(Prediction.prediction_date >= start_date)
    if end_date:
        query = query.where(Prediction.prediction_date <= end_date)

    query = query.order_by(Prediction.prediction_date)
    rows = session.execute(query).fetchall()

    if not rows:
        return {"error": "No completed predictions (with actual_class) found"}

    df = pd.DataFrame(rows, columns=[
        "date", "predicted", "probability", "actual", "close"
    ])

    # ─── Simulasi Trading ──────────────────────────────────
    capital = initial_capital
    equity_curve = [capital]
    trades: List[Dict] = []

    gross_wins = []
    gross_losses = []

    for i in range(len(df) - 1):
        if df.loc[i, "predicted"] != 1:
            equity_curve.append(capital)
            continue

        buy_price = float(df.loc[i, "close"])       # Harga beli (close hari ini)
        sell_price = float(df.loc[i + 1, "close"])  # Harga jual (close besok)

        if buy_price == 0:
            equity_curve.append(capital)
            continue

        # Hitung return setelah biaya transaksi
        gross_return = (sell_price - buy_price) / buy_price
        net_return = gross_return - (2 * transaction_cost_pct)  # beli + jual

        pnl = capital * net_return
        capital += pnl
        equity_curve.append(capital)

        trade = {
            "date": str(df.loc[i, "date"]),
            "buy_price": buy_price,
            "sell_price": sell_price,
            "gross_return_pct": round(gross_return * 100, 4),
            "net_return_pct": round(net_return * 100, 4),
            "pnl": round(pnl, 2),
            "win": pnl > 0,
        }
        trades.append(trade)

        if pnl > 0:
            gross_wins.append(abs(pnl))
        else:
            gross_losses.append(abs(pnl))

    # ─── Hitung Metrik ────────────────────────────────────
    n_trades = len(trades)
    n_wins = sum(1 for t in trades if t["win"])
    win_rate = n_wins / n_trades if n_trades > 0 else 0

    max_drawdown = _compute_max_drawdown(equity_curve)

    total_wins = sum(gross_wins) if gross_wins else 0
    total_losses = sum(gross_losses) if gross_losses else 1
    profitability_factor = total_wins / total_losses if total_losses > 0 else None

    total_return_pct = ((capital - initial_capital) / initial_capital) * 100

    result = {
        "experiment_id": experiment_id,
        "stock_id": stock_id,
        "n_trades": n_trades,
        "n_wins": n_wins,
        "win_rate": round(win_rate, 4),
        "max_drawdown_pct": round(max_drawdown * 100, 4),
        "profitability_factor": round(profitability_factor, 4) if profitability_factor else None,
        "initial_capital": initial_capital,
        "final_capital": round(capital, 2),
        "total_return_pct": round(total_return_pct, 4),
        "equity_curve": equity_curve,
        "trades": trades,
    }

    logger.info(
        f"Backtest done | Trades={n_trades} | WinRate={win_rate:.2%} | "
        f"Drawdown={max_drawdown:.2%} | PF={profitability_factor:.2f if profitability_factor else 'N/A'} | "
        f"Return={total_return_pct:.2f}%"
    )
    return result


def _compute_max_drawdown(equity_curve: List[float]) -> float:
    """Hitung Maximum Drawdown dari equity curve."""
    if len(equity_curve) < 2:
        return 0.0

    arr = np.array(equity_curve)
    peak = arr[0]
    max_dd = 0.0

    for val in arr:
        if val > peak:
            peak = val
        dd = (peak - val) / peak if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd

    return max_dd
