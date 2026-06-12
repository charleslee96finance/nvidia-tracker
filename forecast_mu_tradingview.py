# -*- coding: utf-8 -*-
"""MU 美光科技 — TradingView 風格走勢預測 v2
   日K + EMA20/50 + 成交量 + RSI + 預測投影錐 + OHLC資訊列"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.patches import Rectangle
from matplotlib.font_manager import FontProperties
from datetime import datetime, timedelta

zh = FontProperties(fname="/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc")

BG, GRID = "#131722", "#1f2630"
UP, DOWN = "#26a69a", "#ef5350"
TXT, SUB = "#d1d4dc", "#787b86"

# ===== 歷史日K: 近 90 個交易日, 收斂到實際數據 (高1089 -> 現價891.88) =====
np.random.seed(11)
n_hist = 90
today = datetime(2026, 6, 11)
hist_dates = [today - timedelta(days=(n_hist - i)) for i in range(n_hist)]
ax_x = [0, 25, 45, 60, 75, 89]
ax_y = [760, 920, 1089, 980, 1040, 891.88]
mid = np.interp(np.arange(n_hist), ax_x, ax_y)
close = np.zeros(n_hist); close[0] = mid[0]
for i in range(1, n_hist):
    close[i] = close[i-1] + (mid[i] - close[i-1]) * 0.4 + np.random.normal(0, mid[i] * 0.011)
close[-1] = 891.88
op = np.concatenate([[close[0]], close[:-1]]) + np.random.normal(0, 3.5, n_hist)
op[-1] = 905.13                                   # 今開 (對齊截圖)
hi = np.maximum(op, close) + np.abs(np.random.normal(0, mid * 0.009))
lo = np.minimum(op, close) - np.abs(np.random.normal(0, mid * 0.009))
hi[-1], lo[-1] = 957.48, 883.25                    # 今日最高/最低 (對齊截圖)
vol = np.abs(np.random.normal(1, 0.4, n_hist)) * 3.5e7
vol[-5:] *= 1.7

# ===== 預測投影 (未來 63 交易日 ≈ 3個月) =====
n_fut = 63
fut_dates = [today + timedelta(days=i + 1) for i in range(n_fut)]
ff = np.arange(1, n_fut + 1)
p0 = 891.88
main = np.interp(ff, [0, 9, 20, 40, 63], [p0, 975, 1005, 1030, 1058])
up_b = main + np.interp(ff, [0, 63], [12, 170])
dn_b = main - np.interp(ff, [0, 63], [12, 195])

def ema(a, span):
    k = 2 / (span + 1); o = np.zeros_like(a); o[0] = a[0]
    for i in range(1, len(a)): o[i] = a[i] * k + o[i-1] * (1 - k)
    return o
ema20, ema50 = ema(close, 20), ema(close, 50)

def rsi(a, n=14):
    d = np.diff(a); g = np.where(d > 0, d, 0); l = np.where(d < 0, -d, 0)
    ag = np.zeros_like(a); al = np.zeros_like(a)
    ag[n] = g[:n].mean(); al[n] = l[:n].mean()
    for i in range(n + 1, len(a)):
        ag[i] = (ag[i-1] * (n-1) + g[i-1]) / n
        al[i] = (al[i-1] * (n-1) + l[i-1]) / n
    r = 100 - 100 / (1 + ag / np.where(al == 0, 1e-9, al)); r[:n] = np.nan
    return r
rsi14 = rsi(close)

# ===== 版面 =====
fig = plt.figure(figsize=(15, 9.5), dpi=150)
fig.patch.set_facecolor(BG)
gs = fig.add_gridspec(3, 1, height_ratios=[3.4, 0.75, 0.85], hspace=0.05)
axP = fig.add_subplot(gs[0])
axV = fig.add_subplot(gs[1], sharex=axP)
axR = fig.add_subplot(gs[2], sharex=axP)
for a in (axP, axV, axR):
    a.set_facecolor(BG); a.grid(color=GRID, lw=0.6)
    a.tick_params(colors=SUB, labelsize=9)
    for s in a.spines.values(): s.set_color(GRID)
    a.yaxis.tick_right(); a.yaxis.set_label_position("right")

xh, xf = mdates.date2num(hist_dates), mdates.date2num(fut_dates)
cw = 0.65

for xi, o, c, h, l in zip(xh, op, close, hi, lo):
    col = UP if c >= o else DOWN
    axP.vlines(xi, l, h, color=col, lw=1.0)
    axP.add_patch(Rectangle((xi - cw/2, min(o, c)), cw, abs(c - o) or 0.5, facecolor=col, edgecolor=col))

axP.plot(xh, ema20, color="#2962ff", lw=1.4, label="EMA 20")
axP.plot(xh, ema50, color="#ff6d00", lw=1.4, label="EMA 50")

# 預測錐
axP.fill_between(xf, dn_b, up_b, color="#2962ff", alpha=0.13, zorder=1)
axP.plot(xf, main, color="#b388ff", lw=2.2, ls=(0, (6, 2)), label="預測主路徑 (基準 → $1,058)")
axP.plot(xf, up_b, color=UP, lw=1.2, ls=":", label="樂觀上緣 (財報大超預期)")
axP.plot(xf, dn_b, color=DOWN, lw=1.2, ls=":", label="保守下緣 (財報不如預期)")

# 多空分歧箭頭
axP.annotate("", xy=(xf[22], up_b[22]), xytext=(xh[-1], close[-1]),
             arrowprops=dict(arrowstyle="-|>", color=UP, lw=2.0, alpha=0.9))
axP.annotate("", xy=(xf[22], dn_b[22]), xytext=(xh[-1], close[-1]),
             arrowprops=dict(arrowstyle="-|>", color=DOWN, lw=2.0, alpha=0.9))

# 價籤
def tag(axx, y, col, x_):
    axP.add_patch(Rectangle((x_ + 0.8, y - 11), 12.5, 22, facecolor=col, edgecolor="none", zorder=5))
    axP.text(x_ + 7, y, f"{y:,.0f}", color="#fff", fontsize=9, ha="center", va="center",
             zorder=6, fontweight="bold")
for y, col in [(up_b[-1], UP), (main[-1], "#7c4dff"), (dn_b[-1], DOWN)]:
    tag(axP, y, col, xf[-1])
axP.axhline(p0, color=TXT, lw=0.7, ls="--", alpha=0.45)
tag(axP, p0, "#363a45", xh[-1])

# 支撐 / 壓力區
axP.axhspan(1080, 1100, color=DOWN, alpha=0.10)
axP.text(xh[2], 1088, "壓力區 1,080–1,100（歷史高 1,089）", color=DOWN, fontsize=9.5, fontproperties=zh)
axP.axhspan(790, 815, color=UP, alpha=0.10)
axP.text(xh[2], 798, "支撐區 790–815", color=UP, fontsize=9.5, fontproperties=zh)

# 財報事件
earn = mdates.date2num(datetime(2026, 6, 24))
axP.axvline(earn, color="#ff80ab", lw=1.1, ls="--", alpha=0.85)
axP.text(earn + 0.8, 745, "6/24 財報（方向確認點）", color="#ff80ab", fontsize=9.5, fontproperties=zh)

# OHLC 資訊列 (TradingView 頂欄)
info = ("MU · 1D · NASDAQ    開905.13  高957.48  低883.25  收891.88  −44.01 (−4.70%)    盤後 929.17 (+4.18%)")
axP.text(0.005, 1.025, info, transform=axP.transAxes, fontproperties=zh, fontsize=10.5,
         color=TXT, va="bottom")
axP.text(0.5, 0.5, "MU · NASDAQ", transform=axP.transAxes, fontsize=34,
         color="#fff", alpha=0.05, ha="center", va="center", fontweight="bold")
axP.legend(loc="upper left", prop=zh, fontsize=9.5, framealpha=0.25,
           facecolor="#1c2230", edgecolor=GRID, labelcolor=TXT)
axP.set_ylim(700, 1265)

# 成交量
vcol = [UP if c >= o else DOWN for o, c in zip(op, close)]
axV.bar(xh, vol, width=cw, color=vcol, alpha=0.9)
axV.bar(xf, np.interp(ff, [0, 9, 63], [3.8e7, 8.5e7, 4.2e7]), width=cw, color="#7c4dff", alpha=0.35)
axV.text(0.005, 0.78, "成交量（紫 = 預測段估計，財報週放量）", transform=axV.transAxes,
         fontproperties=zh, color=SUB, fontsize=9)

# RSI
axR.plot(xh, rsi14, color="#b388ff", lw=1.3)
axR.plot(xf, np.interp(ff, [0, 9, 30, 63], [rsi14[-1], 63, 58, 56]), color="#b388ff", lw=1.3, ls=":")
axR.axhline(70, color=DOWN, lw=0.7, ls="--", alpha=0.6)
axR.axhline(30, color=UP, lw=0.7, ls="--", alpha=0.6)
axR.set_ylim(0, 100); axR.set_yticks([30, 50, 70])
axR.text(0.005, 0.78, "RSI 14（虛線 = 預測延伸）", transform=axR.transAxes,
         fontproperties=zh, color=SUB, fontsize=9)

axR.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d"))
axR.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=mdates.MO, interval=2))
plt.setp(axP.get_xticklabels(), visible=False)
plt.setp(axV.get_xticklabels(), visible=False)
axR.set_xlim(xh[0] - 1, xf[-1] + 16)

fig.text(0.5, 0.015, "TradingView 風格示意 — K線/指標為情境模擬（已對齊 06/11 實際 OHLC），僅供參考，不構成投資建議",
         fontproperties=zh, fontsize=9, color=SUB, ha="center")
plt.savefig("/home/user/nvidia-tracker/mu_tradingview.png", facecolor=BG, bbox_inches="tight")
print("saved")
