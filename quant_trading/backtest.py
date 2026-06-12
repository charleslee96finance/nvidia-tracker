"""回測引擎：向量化、含交易成本、無未來函數。

執行假設：
  - 訊號於收盤產生，隔日生效 → 部位 shift(1)
  - 每次部位變動收取單邊手續費 (commission，預設 5bps)
  - 報酬以收盤對收盤計算，乘上前一日部位
  - 全額投入(滿倉或空手)，不使用槓桿
"""
from __future__ import annotations
import numpy as np
import pandas as pd

TRADING_DAYS = 252


def run_backtest(df: pd.DataFrame, position: pd.Series,
                 commission: float = 0.0005, init_capital: float = 100_000) -> dict:
    px = df["Close"]
    ret = px.pct_change().fillna(0.0)

    pos = position.reindex(px.index).fillna(0.0).clip(0, 1)
    pos_exec = pos.shift(1).fillna(0.0)                 # 隔日生效，避免未來函數

    turnover = pos_exec.diff().abs().fillna(0.0)        # 部位變動量
    cost = turnover * commission                        # 交易成本(比例)

    strat_ret = pos_exec * ret - cost
    equity = init_capital * (1 + strat_ret).cumprod()
    bh_equity = init_capital * (1 + ret).cumprod()      # Buy & Hold 基準

    metrics = _metrics(strat_ret, equity, pos_exec, turnover)
    return {
        "equity": equity,
        "bh_equity": bh_equity,
        "strat_ret": strat_ret,
        "position": pos_exec,
        "metrics": metrics,
    }


def _metrics(ret: pd.Series, equity: pd.Series, pos: pd.Series,
             turnover: pd.Series) -> dict:
    n = len(ret)
    years = n / TRADING_DAYS
    total = equity.iloc[-1] / equity.iloc[0] - 1
    cagr = (equity.iloc[-1] / equity.iloc[0]) ** (1 / years) - 1 if years > 0 else np.nan

    ann_vol = ret.std() * np.sqrt(TRADING_DAYS)
    sharpe = (ret.mean() * TRADING_DAYS) / (ann_vol + 1e-12)
    downside = ret[ret < 0].std() * np.sqrt(TRADING_DAYS)
    sortino = (ret.mean() * TRADING_DAYS) / (downside + 1e-12)

    roll_max = equity.cummax()
    dd = equity / roll_max - 1
    max_dd = dd.min()
    calmar = cagr / abs(max_dd) if max_dd < 0 else np.nan

    # 以「進出場」為一筆交易計算勝率/盈虧比
    trades = _trade_stats(ret, pos)

    exposure = (pos > 0).mean()                         # 持倉時間占比
    n_trades = int((turnover > 0).sum())

    return {
        "total_return": total,
        "cagr": cagr,
        "ann_vol": ann_vol,
        "sharpe": sharpe,
        "sortino": sortino,
        "max_drawdown": max_dd,
        "calmar": calmar,
        "win_rate": trades["win_rate"],
        "profit_factor": trades["profit_factor"],
        "n_trades": n_trades,
        "exposure": exposure,
        "final_equity": equity.iloc[-1],
    }


def _trade_stats(ret: pd.Series, pos: pd.Series) -> dict:
    """把連續持倉切成獨立交易，統計勝率與盈虧比。"""
    in_mkt = pos > 0
    trade_rets, cur = [], 0.0
    prev = False
    for r, m in zip(ret.values, in_mkt.values):
        if m:
            cur = (1 + cur) * (1 + r) - 1 if prev else r
        elif prev:
            trade_rets.append(cur); cur = 0.0
        prev = m
    if prev:
        trade_rets.append(cur)
    trade_rets = np.array(trade_rets)
    if len(trade_rets) == 0:
        return {"win_rate": np.nan, "profit_factor": np.nan}
    wins = trade_rets[trade_rets > 0].sum()
    losses = -trade_rets[trade_rets < 0].sum()
    return {
        "win_rate": (trade_rets > 0).mean(),
        "profit_factor": wins / losses if losses > 0 else np.inf,
    }
