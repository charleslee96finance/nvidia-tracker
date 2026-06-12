"""策略層：每個策略接收價格 DataFrame，回傳『目標部位』序列。

部位定義：1 = 持有多單(100%)，0 = 空手。為避免未來函數(lookahead)，
所有訊號使用『當日收盤計算 → 隔日開盤執行』，由回測引擎統一 shift(1)。

四種策略：
  1. trend_ema      趨勢 / 均線交叉  (EMA 快線 > 慢線 做多)
  2. momentum_rsi   動量 + RSI       (動量為正且 RSI 未超買時做多)
  3. breakout       突破策略         (唐奇安通道，突破 N 日高點做多)
  4. mean_reversion 均值回歸         (布林帶下緣買、回均線賣)
"""
from __future__ import annotations
import numpy as np
import pandas as pd


# ---------- 技術指標 ----------
def ema(s: pd.Series, span: int) -> pd.Series:
    return s.ewm(span=span, adjust=False).mean()


def rsi(s: pd.Series, n: int = 14) -> pd.Series:
    d = s.diff()
    gain = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    loss = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(50)


# ---------- 策略 ----------
def trend_ema(df: pd.DataFrame, fast: int = 20, slow: int = 50) -> pd.Series:
    c = df["Close"]
    pos = (ema(c, fast) > ema(c, slow)).astype(float)
    return pos.rename("trend_ema")


def momentum_rsi(df: pd.DataFrame, mom: int = 90, rsi_n: int = 14,
                 rsi_hi: int = 75, rsi_lo: int = 40) -> pd.Series:
    c = df["Close"]
    momentum_up = c > c.shift(mom)                     # 90日動量為正
    r = rsi(c, rsi_n)
    # 動量向上、RSI 介於 lo~hi（不過熱不過冷）才持有
    pos = (momentum_up & (r > rsi_lo) & (r < rsi_hi)).astype(float)
    return pos.rename("momentum_rsi")


def breakout(df: pd.DataFrame, entry: int = 55, exit_: int = 20) -> pd.Series:
    """唐奇安通道突破（海龜法則簡化版）。"""
    c = df["Close"]
    upper = c.shift(1).rolling(entry).max()            # 前 entry 日最高（不含當日）
    lower = c.shift(1).rolling(exit_).min()
    pos = pd.Series(np.nan, index=c.index)
    pos[c > upper] = 1.0                               # 突破前高 → 進場
    pos[c < lower] = 0.0                               # 跌破出場通道 → 出場
    pos = pos.ffill().fillna(0.0)
    return pos.rename("breakout")


def mean_reversion(df: pd.DataFrame, n: int = 20, k: float = 2.0) -> pd.Series:
    """布林帶均值回歸：觸下緣買進，回到中軌賣出。"""
    c = df["Close"]
    ma = c.rolling(n).mean()
    sd = c.rolling(n).std()
    lower = ma - k * sd
    pos = pd.Series(np.nan, index=c.index)
    pos[c < lower] = 1.0                               # 跌破下緣 → 買
    pos[c >= ma] = 0.0                                 # 回到中軌 → 賣
    pos = pos.ffill().fillna(0.0)
    return pos.rename("mean_reversion")


STRATEGIES = {
    "趨勢均線交叉 (EMA20/50)": trend_ema,
    "動量+RSI": momentum_rsi,
    "突破 (唐奇安55/20)": breakout,
    "均值回歸 (布林20,2σ)": mean_reversion,
}
