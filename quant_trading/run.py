"""量化交易回測主程式：四策略 vs Buy&Hold 比較 + 績效報告 + 圖表。

執行： python3 quant_trading/run.py
可選參數： --ticker MU --start 2021-01-01 --commission 0.0005
"""
from __future__ import annotations
import argparse
import os
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.font_manager import FontProperties

from data import load_prices
from strategies import STRATEGIES
from backtest import run_backtest

ZH_PATH = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
zh = FontProperties(fname=ZH_PATH) if os.path.exists(ZH_PATH) else FontProperties()

BG, GRID, TXT, SUB = "#131722", "#1f2630", "#d1d4dc", "#787b86"
COLORS = ["#26a69a", "#2962ff", "#ff6d00", "#b388ff"]


def fmt_pct(x): return f"{x*100:,.1f}%" if pd.notna(x) else "—"
def fmt_num(x): return f"{x:,.2f}" if pd.notna(x) else "—"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ticker", default="MU")
    ap.add_argument("--start", default="2021-01-01")
    ap.add_argument("--end", default=None)
    ap.add_argument("--commission", type=float, default=0.0005)
    ap.add_argument("--out", default="/home/user/nvidia-tracker/quant_backtest.png")
    args = ap.parse_args()

    df, src = load_prices(args.ticker, args.start, args.end)

    results = {}
    for name, fn in STRATEGIES.items():
        pos = fn(df)
        results[name] = run_backtest(df, pos, commission=args.commission)

    # Buy & Hold 基準（用任一結果的 bh_equity）
    bh = next(iter(results.values()))["bh_equity"]
    bh_ret = df["Close"].pct_change().fillna(0)
    bh_metrics = _bh_metrics(bh, bh_ret)

    _print_report(args.ticker, src, results, bh_metrics)
    _plot(args.ticker, src, df, results, bh, args.out)
    print(f"\n[done] 圖表輸出：{args.out}")


def _bh_metrics(equity, ret):
    years = len(ret) / 252
    cagr = (equity.iloc[-1] / equity.iloc[0]) ** (1 / years) - 1
    ann_vol = ret.std() * np.sqrt(252)
    sharpe = (ret.mean() * 252) / (ann_vol + 1e-12)
    dd = (equity / equity.cummax() - 1).min()
    return {"total_return": equity.iloc[-1] / equity.iloc[0] - 1, "cagr": cagr,
            "sharpe": sharpe, "max_drawdown": dd}


def _print_report(ticker, src, results, bh):
    print("\n" + "=" * 78)
    print(f" 量化交易回測報告  |  標的：{ticker}  |  數據來源：{src}")
    print("=" * 78)
    hdr = f"{'策略':<22}{'總報酬':>10}{'年化':>9}{'夏普':>8}{'最大回撤':>10}{'勝率':>8}{'盈虧比':>8}{'交易數':>7}"
    print(hdr)
    print("-" * 78)
    for name, r in results.items():
        m = r["metrics"]
        print(f"{name:<22}{fmt_pct(m['total_return']):>10}{fmt_pct(m['cagr']):>9}"
              f"{fmt_num(m['sharpe']):>8}{fmt_pct(m['max_drawdown']):>10}"
              f"{fmt_pct(m['win_rate']):>8}{fmt_num(m['profit_factor']):>8}{m['n_trades']:>7}")
    print("-" * 78)
    print(f"{'Buy & Hold (基準)':<22}{fmt_pct(bh['total_return']):>10}{fmt_pct(bh['cagr']):>9}"
          f"{fmt_num(bh['sharpe']):>8}{fmt_pct(bh['max_drawdown']):>10}{'—':>8}{'—':>8}{'—':>7}")
    print("=" * 78)


def _plot(ticker, src, df, results, bh, out):
    fig = plt.figure(figsize=(14, 9), dpi=150)
    fig.patch.set_facecolor(BG)
    gs = fig.add_gridspec(2, 1, height_ratios=[2.2, 1], hspace=0.18)
    axE = fig.add_subplot(gs[0]); axD = fig.add_subplot(gs[1])
    for a in (axE, axD):
        a.set_facecolor(BG); a.grid(color=GRID, lw=0.6)
        a.tick_params(colors=SUB, labelsize=9)
        for s in a.spines.values(): s.set_color(GRID)

    # 權益曲線
    axE.plot(bh.index, bh, color="#666", lw=1.4, ls="--", label="Buy & Hold 基準")
    for (name, r), col in zip(results.items(), COLORS):
        axE.plot(r["equity"].index, r["equity"], color=col, lw=1.6, label=name)
    axE.set_yscale("log")
    axE.set_title(f"{ticker} 量化策略回測 — 權益曲線 (對數軸)  |  數據：{src}",
                  fontproperties=zh, color=TXT, fontsize=14, loc="left", pad=8)
    axE.set_ylabel("帳戶權益 (USD)", fontproperties=zh, color=SUB)
    axE.legend(loc="upper left", prop=zh, fontsize=9, framealpha=0.2,
               facecolor="#1c2230", edgecolor=GRID, labelcolor=TXT, ncol=2)

    # 回撤曲線
    for (name, r), col in zip(results.items(), COLORS):
        eq = r["equity"]; dd = (eq / eq.cummax() - 1) * 100
        axD.plot(dd.index, dd, color=col, lw=1.2)
        axD.fill_between(dd.index, dd, 0, color=col, alpha=0.08)
    axD.set_title("回撤 Drawdown (%)", fontproperties=zh, color=TXT, fontsize=12, loc="left")
    axD.set_ylabel("回撤 %", fontproperties=zh, color=SUB)
    axD.axhline(0, color=SUB, lw=0.6)

    for a in (axE, axD):
        a.xaxis.set_major_formatter(mdates.DateFormatter("%Y/%m"))
        a.xaxis.set_major_locator(mdates.MonthLocator(interval=4))
    fig.text(0.5, 0.02, "回測含 5bps 單邊手續費、隔日開盤執行(無未來函數)；模擬數據時僅供展示策略邏輯，不代表真實績效",
             fontproperties=zh, color=SUB, fontsize=8.5, ha="center")
    plt.savefig(out, facecolor=BG, bbox_inches="tight")


if __name__ == "__main__":
    main()
