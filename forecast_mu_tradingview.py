# -*- coding: utf-8 -*-
"""MU 美光科技 — TradingView 風格 走勢預測圖
   日K蠟燭 + EMA20/50 + 成交量 + RSI + 預測投影(forecast projection)"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.patches import Rectangle, FancyArrow, Polygon
from matplotlib.font_manager import FontProperties
from datetime import datetime, timedelta

zh = FontProperties(fname="/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc")

# ===== TradingView 配色 =====
BG     = "#131722"   # 背景
GRID   = "#1f2630"
UP     = "#26a69a"   # 漲(綠)
DOWN   = "#ef5350"   # 跌(紅)
TXT    = "#d1d4dc"
SUB    = "#787b86"
EMA20C = "#2962ff"
EMA50C = "#ff6d00"

# ===== 1) 生成歷史日K (近 ~150 交易日, 還原到現價 891.88) =====
np.random.seed(11)
n_hist = 150
today = datetime(2026, 6, 11)
hist_dates = [today - timedelta(days=(n_hist - i)) for i in range(n_hist)]
# 基準路徑: 從 ~480 漲到歷史高 1089 再回落到 891.88
ax_x = [0, 40, 75, 100, 120, 135, 149]
ax_y = [470, 640, 860, 1089, 980, 1040, 891.88]
mid = np.interp(np.arange(n_hist), ax_x, ax_y)
close = np.zeros(n_hist); close[0] = mid[0]
for i in range(1, n_hist):
    drift = (mid[i] - close[i-1]) * 0.35
    close[i] = close[i-1] + drift + np.random.normal(0, mid[i]*0.012)
close[-1] = 891.88
op = np.concatenate([[close[0]], close[:-1]]) + np.random.normal(0, 4, n_hist)
hi = np.maximum(op, close) + np.abs(np.random.normal(0, mid*0.010))
lo = np.minimum(op, close) - np.abs(np.random.normal(0, mid*0.010))
vol = np.abs(np.random.normal(1, 0.4, n_hist)) * 1e7
vol[-6:] *= 1.8  # 近期放量

# ===== 2) 預測投影 (未來 ~63 交易日 ≈ 3個月) =====
n_fut = 63
fut_dates = [today + timedelta(days=i+1) for i in range(n_fut)]
ff = np.arange(1, n_fut + 1)
p0 = 891.88
# TradingView forecast: 主預測路徑 + 上下緣(信賴帶)
main = np.interp(ff, [0, 9, 20, 40, 63], [p0, 980, 1010, 1035, 1058])
up_band  = main + np.interp(ff, [0, 63], [10, 175])   # 漸開的上緣
dn_band  = main - np.interp(ff, [0, 63], [10, 200])   # 漸開的下緣

# ===== 指標: EMA & RSI (用 close) =====
def ema(a, span):
    k = 2/(span+1); out = np.zeros_like(a); out[0] = a[0]
    for i in range(1, len(a)): out[i] = a[i]*k + out[i-1]*(1-k)
    return out
ema20 = ema(close, 20); ema50 = ema(close, 50)
def rsi(a, n=14):
    d = np.diff(a); g = np.where(d>0,d,0); l = np.where(d<0,-d,0)
    ag = np.zeros_like(a); al = np.zeros_like(a)
    ag[n] = g[:n].mean(); al[n] = l[:n].mean()
    for i in range(n+1, len(a)):
        ag[i] = (ag[i-1]*(n-1)+g[i-1])/n; al[i] = (al[i-1]*(n-1)+l[i-1])/n
    rs = ag/np.where(al==0,1e-9,al); r = 100-100/(1+rs); r[:n]=np.nan; return r
rsi14 = rsi(close)

# ===== 繪圖框架 =====
fig = plt.figure(figsize=(14, 9), dpi=150)
fig.patch.set_facecolor(BG)
gs = fig.add_gridspec(3, 1, height_ratios=[3.2, 0.8, 0.9], hspace=0.06)
axP = fig.add_subplot(gs[0]); axV = fig.add_subplot(gs[1], sharex=axP); axR = fig.add_subplot(gs[2], sharex=axP)
for a in (axP, axV, axR):
    a.set_facecolor(BG)
    a.grid(color=GRID, lw=0.6)
    a.tick_params(colors=SUB, labelsize=8)
    for s in a.spines.values(): s.set_color(GRID)
    a.yaxis.tick_right(); a.yaxis.set_label_position("right")

xh = mdates.date2num(hist_dates)
xf = mdates.date2num(fut_dates)
cw = 0.62

# --- 蠟燭 ---
for xi, o, c, h, l in zip(xh, op, close, hi, lo):
    col = UP if c >= o else DOWN
    axP.vlines(xi, l, h, color=col, lw=0.8)
    axP.add_patch(Rectangle((xi-cw/2, min(o,c)), cw, abs(c-o) or 0.4, facecolor=col, edgecolor=col))

# --- EMA ---
axP.plot(xh, ema20, color=EMA20C, lw=1.3, label="EMA 20")
axP.plot(xh, ema50, color=EMA50C, lw=1.3, label="EMA 50")

# --- 預測投影帶 (forecast cone) ---
axP.fill_between(xf, dn_band, up_band, color="#2962ff", alpha=0.12, zorder=1)
axP.plot(xf, main, color="#9c27ff", lw=2.0, ls=(0,(5,2)), label="預測路徑 (基準)")
axP.plot(xf, up_band, color=UP, lw=1.1, ls=":", alpha=0.9)
axP.plot(xf, dn_band, color=DOWN, lw=1.1, ls=":", alpha=0.9)
# 預測終點標籤 (TradingView 價籤樣式)
for y, col in [(up_band[-1], UP), (main[-1], "#b388ff"), (dn_band[-1], DOWN)]:
    axP.add_patch(Rectangle((xf[-1]+0.5, y-9), 11, 18, facecolor=col, edgecolor="none", zorder=5))
    axP.text(xf[-1]+6, y, f"{y:,.0f}", color="#fff", fontsize=8.5, ha="center", va="center", zorder=6, fontweight="bold")

# --- 預測分歧箭頭 (TradingView projection tool 風格) ---
axP.annotate("", xy=(xf[25], up_band[25]), xytext=(xh[-1], close[-1]),
             arrowprops=dict(arrowstyle="-|>", color=UP, lw=1.8, alpha=0.85))
axP.annotate("", xy=(xf[25], dn_band[25]), xytext=(xh[-1], close[-1]),
             arrowprops=dict(arrowstyle="-|>", color=DOWN, lw=1.8, alpha=0.85))

# --- 現價線 + 標籤 ---
axP.axhline(p0, color=TXT, lw=0.7, ls="--", alpha=0.5)
axP.add_patch(Rectangle((xh[-1]+0.5, p0-9), 11, 18, facecolor="#363a45", edgecolor="none", zorder=5))
axP.text(xh[-1]+6, p0, f"{p0:,.0f}", color="#fff", fontsize=8.5, ha="center", va="center", zorder=6, fontweight="bold")

# --- 支撐壓力區 (TradingView 矩形區間) ---
axP.axhspan(1080, 1100, color=DOWN, alpha=0.10)
axP.text(xh[3], 1090, "壓力區 1,080–1,100 (歷史高)", color=DOWN, fontsize=8.5, fontproperties=zh)
axP.axhspan(790, 815, color=UP, alpha=0.10)
axP.text(xh[3], 800, "支撐區 790–815", color=UP, fontsize=8.5, fontproperties=zh)

# --- 財報事件標記 ---
earn = mdates.date2num(datetime(2026, 6, 24))
axP.axvline(earn, color="#ff80ab", lw=1.0, ls="--", alpha=0.8)
axP.text(earn+0.4, 760, "⚑", color="#ff80ab", fontsize=14)
axP.text(earn+1.2, 745, "6/24 財報", color="#ff80ab", fontsize=8.5, fontproperties=zh)

# --- 浮水印 (TradingView 風格) ---
axP.text(0.5, 0.5, "MU · 1D · NASDAQ", transform=axP.transAxes, fontproperties=zh,
         fontsize=30, color="#ffffff", alpha=0.05, ha="center", va="center", fontweight="bold")
axP.set_title("MU 美光科技 — TradingView 風格走勢預測 (日K · 預測未來 3 個月)",
              fontproperties=zh, color=TXT, fontsize=14, pad=10, loc="left")
axP.legend(loc="upper left", prop=zh, fontsize=9, framealpha=0.2,
           facecolor="#1c2230", edgecolor=GRID, labelcolor=TXT)
axP.set_ylim(700, 1180)

# --- 成交量 ---
vcol = [UP if c>=o else DOWN for o,c in zip(op, close)]
axV.bar(xh, vol, width=cw, color=vcol, alpha=0.85)
axV.bar(xf, np.interp(ff,[0,9,63],[1.2e7,2.6e7,1.4e7]), width=cw, color="#9c27ff", alpha=0.30)  # 預測量(虛)
axV.set_ylabel("Vol", fontproperties=zh, color=SUB, fontsize=9)
axV.text(0.01, 0.82, "成交量 (預測段為估計, 紫)", transform=axV.transAxes, fontproperties=zh, color=SUB, fontsize=8)

# --- RSI ---
axR.plot(xh, rsi14, color="#b388ff", lw=1.2)
# RSI 預測延伸
rsi_fut = np.interp(ff, [0,9,30,63], [rsi14[-1], 62, 58, 56])
axR.plot(xf, rsi_fut, color="#b388ff", lw=1.2, ls=":")
axR.axhline(70, color=DOWN, lw=0.7, ls="--", alpha=0.6)
axR.axhline(30, color=UP, lw=0.7, ls="--", alpha=0.6)
axR.axhspan(30, 70, color="#787b86", alpha=0.05)
axR.set_ylim(0, 100); axR.set_yticks([30,50,70])
axR.set_ylabel("RSI 14", fontproperties=zh, color=SUB, fontsize=9)

# --- X 軸 ---
axR.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d"))
axR.xaxis.set_major_locator(mdates.MonthLocator())
plt.setp(axP.get_xticklabels(), visible=False)
plt.setp(axV.get_xticklabels(), visible=False)
axR.set_xlim(xh[0], xf[-1]+14)
plt.setp(axR.get_xticklabels(), rotation=0, fontsize=8)

fig.text(0.5, 0.02, "TradingView 風格示意圖 — K線/指標為情境模擬非真實數據, 僅供參考不構成投資建議",
         fontproperties=zh, fontsize=8.5, color=SUB, ha="center")
plt.savefig("/home/user/nvidia-tracker/mu_tradingview.png", facecolor=BG, bbox_inches="tight")
print("saved")
