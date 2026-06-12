"""風控層：倉位管理與資金保護。

三道防線：
  1. 波動率目標倉位 (vol targeting)  — 行情越瘋倉位越小
  2. 回撤熔斷 (drawdown kill-switch) — 帳戶回撤超限 → 強制空手
  3. 追蹤停損 (trailing stop)        — 個股從持有期高點回落超限 → 出場
"""
from __future__ import annotations
import numpy as np
import pandas as pd

TRADING_DAYS = 252


def vol_target_scale(close: pd.Series, target_ann_vol: float = 0.35,
                     lookback: int = 20) -> float:
    """依近期實現波動率縮放倉位：scale = min(1, 目標波動 / 實現波動)。

    MU 年化波動常態在 50%+，目標 35% 意味高波動期自動降倉。
    """
    ret = close.pct_change().dropna()
    if len(ret) < lookback:
        return 1.0
    realized = ret.iloc[-lookback:].std() * np.sqrt(TRADING_DAYS)
    if realized <= 0:
        return 1.0
    return float(min(1.0, target_ann_vol / realized))


def drawdown_guard(equity_history: list[float], max_dd: float = 0.25) -> bool:
    """帳戶層熔斷：權益自高點回撤超過 max_dd 回傳 False(禁止持倉)。"""
    if len(equity_history) < 2:
        return True
    eq = np.asarray(equity_history, dtype=float)
    dd = eq[-1] / eq.max() - 1
    return dd > -max_dd


def trailing_stop_hit(close: pd.Series, entry_idx: int | None,
                      stop_pct: float = 0.15) -> bool:
    """個股追蹤停損：自進場後最高收盤回落 stop_pct → 觸發。"""
    if entry_idx is None or entry_idx >= len(close):
        return False
    seg = close.iloc[entry_idx:]
    return seg.iloc[-1] / seg.max() - 1 < -stop_pct


def size_position(equity: float, price: float, weight: float,
                  max_position_pct: float = 1.0) -> int:
    """把目標權重轉成整數股數（不開槓桿、不做空）。"""
    weight = float(np.clip(weight, 0.0, max_position_pct))
    return int(equity * weight // price)
