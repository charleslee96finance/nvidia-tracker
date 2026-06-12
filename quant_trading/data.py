"""數據層：優先抓取真實行情，失敗則自動 fallback 到模擬數據。

抓取順序：
  1. yfinance (Yahoo Finance)        — 需網路權限
  2. pandas-datareader / stooq        — 備援
  3. 內建 GBM 模擬器 (calibrated MU)  — 離線 fallback，保證系統可跑

回傳統一格式的 DataFrame：index=日期, 欄位=[Open, High, Low, Close, Volume]
"""
from __future__ import annotations
import numpy as np
import pandas as pd


def _from_yfinance(ticker: str, start: str, end: str | None) -> pd.DataFrame | None:
    try:
        import yfinance as yf
        df = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True)
        if df is None or len(df) == 0:
            return None
        if isinstance(df.columns, pd.MultiIndex):            # 攤平 (Close, MU) -> Close
            df.columns = df.columns.get_level_values(0)
        df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
        return df if len(df) else None
    except Exception as e:                                   # noqa: BLE001
        print(f"[data] yfinance 失敗：{str(e)[:90]}")
        return None


def _from_stooq(ticker: str, start: str, end: str | None) -> pd.DataFrame | None:
    try:
        import pandas_datareader.data as web
        df = web.DataReader(f"{ticker}.US", "stooq", start, end).sort_index()
        df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
        return df if len(df) else None
    except Exception as e:                                   # noqa: BLE001
        print(f"[data] stooq 失敗：{str(e)[:90]}")
        return None


def _simulate(start: str, end: str | None, seed: int = 11) -> pd.DataFrame:
    """以『真實價位錨點 + 噪音』模擬 MU 日線，貼近實際歷史區間。

    錨點(校準至 MU 真實價位走勢)：
      2021 ~$75 → 2022 熊市 ~$50 → 2023 復甦 ~$70 → 2024 ~$120
      → 2025 整理 ~$100 → 2026 AI 記憶體爆發 → 高 $1,089 → 現價 $891.88
    """
    rng = np.random.default_rng(seed)
    end = end or pd.Timestamp.today().strftime("%Y-%m-%d")
    dates = pd.bdate_range(start=start, end=end)
    n = len(dates)

    # (時間比例, 價格) 錨點
    ax = [0.00, 0.18, 0.33, 0.52, 0.70, 0.85, 0.93, 0.97, 1.00]
    ay = [75,   50,   70,   120,  100,  130,  1089, 1000, 891.88]
    t = np.linspace(0, 1, n)
    trend = np.interp(t, ax, ay)

    # 圍繞趨勢的隨機波動（波動聚集 + 隨價格等比例）
    vol = (0.018 + 0.012 * np.abs(np.sin(t * np.pi * 4)))
    noise = np.zeros(n)
    for i in range(1, n):
        noise[i] = 0.92 * noise[i - 1] + rng.normal(0, 1)      # AR(1) 平滑噪音
    noise = noise / np.abs(noise).max()
    close = trend * (1 + noise * vol * 6)
    close = np.maximum(close, 5)
    close[-1] = 891.88                                         # 對齊現價

    openp = np.concatenate([[close[0]], close[:-1]]) * (1 + rng.normal(0, 0.004, n))
    high = np.maximum(openp, close) * (1 + np.abs(rng.normal(0, 0.012, n)))
    low = np.minimum(openp, close) * (1 - np.abs(rng.normal(0, 0.012, n)))
    vol_sh = np.abs(rng.normal(1, 0.35, n)) * 3.5e7

    return pd.DataFrame(
        {"Open": openp, "High": high, "Low": low, "Close": close, "Volume": vol_sh},
        index=dates,
    )


def load_prices(ticker: str = "MU", start: str = "2021-01-01",
                end: str | None = None, allow_simulated: bool = True) -> tuple[pd.DataFrame, str]:
    """載入行情。回傳 (DataFrame, 來源標籤)。"""
    for fn, label in [(_from_yfinance, "yfinance (真實)"),
                      (_from_stooq, "stooq (真實)")]:
        df = fn(ticker, start, end)
        if df is not None:
            print(f"[data] 來源：{label}，{len(df)} 筆 {df.index[0].date()} ~ {df.index[-1].date()}")
            return df, label
    if not allow_simulated:
        raise RuntimeError("無法取得真實數據，且未允許模擬 fallback")
    df = _simulate(start, end)
    print(f"[data] ⚠ 真實數據不可用，改用『模擬數據』fallback，{len(df)} 筆")
    return df, "模擬 (fallback)"


if __name__ == "__main__":
    df, src = load_prices()
    print(src)
    print(df.tail())
