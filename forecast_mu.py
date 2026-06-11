# -*- coding: utf-8 -*-
"""MU (美光科技) 未來 12 個月走勢情境預估圖"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.font_manager import FontProperties
from datetime import datetime, timedelta

zh = FontProperties(fname="/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc")

rng = np.random.default_rng(42)

# ---------- 歷史段 (2025/06 ~ 2026/06/11, 模擬還原: 52週低 103 -> 歷史高 1089 -> 現價 891.88) ----------
start = datetime(2025, 6, 11)
today = datetime(2026, 6, 11)
n_hist = (today - start).days
hist_dates = [start + timedelta(days=i) for i in range(n_hist + 1)]

# 關鍵錨點 (天數, 價格)
anchors_x = [0, 60, 140, 220, 290, 330, 350, 358, n_hist]
anchors_y = [103.25, 160, 380, 620, 900, 1089.29, 980, 1040, 891.88]
t = np.arange(n_hist + 1)
base_hist = np.interp(t, anchors_x, anchors_y)
noise = rng.normal(0, 1, n_hist + 1).cumsum()
noise = noise / np.abs(noise).max() * 28
noise[0] = noise[-1] = 0
hist = base_hist + noise * (base_hist / 1089)  # 價格越高波動越大
hist[-1] = 891.88

# ---------- 預測段 (未來 12 個月) ----------
n_fut = 365
fut_dates = [today + timedelta(days=i) for i in range(n_fut + 1)]
tf = np.arange(n_fut + 1)
p0 = 891.88

def path(anchor_days, anchor_px, vol, seed):
    r = np.random.default_rng(seed)
    base = np.interp(tf, anchor_days, anchor_px)
    nz = r.normal(0, 1, n_fut + 1).cumsum()
    nz = nz / np.abs(nz).max() * vol
    nz[0] = 0
    return base + nz

# 牛市: 6/24 財報大超預期, HBM 超級週期延續 -> ~$1,400
bull = path([0, 13, 30, 120, 240, 365], [p0, 1000, 1100, 1180, 1300, 1400], 35, 1)
# 基準: 符合 Morgan Stanley $1,050 目標, 區間震盪向上
base = path([0, 13, 40, 150, 270, 365], [p0, 940, 980, 1000, 1030, 1060], 30, 2)
# 熊市: AI 資本支出放緩 + 升息, 記憶體週期反轉 -> ~$520
bear = path([0, 13, 60, 150, 270, 365], [p0, 800, 720, 640, 560, 520], 28, 3)

# ---------- 繪圖 ----------
fig, ax = plt.subplots(figsize=(13, 7.5), dpi=150)
fig.patch.set_facecolor("#0e1117")
ax.set_facecolor("#0e1117")

ax.plot(hist_dates, hist, color="#e8e8e8", lw=1.6, label="歷史走勢 (近一年)")
ax.plot(fut_dates, bull, color="#00c853", lw=2.0, ls="--", label="牛市情境 35%：HBM 超級週期延續 → ~$1,400 (+57%)")
ax.plot(fut_dates, base, color="#ffb300", lw=2.2, ls="--", label="基準情境 45%：大行目標價區 → ~$1,050 (+18%)")
ax.plot(fut_dates, bear, color="#ff5252", lw=2.0, ls="--", label="熊市情境 20%：週期反轉/升息 → ~$520 (-42%)")
ax.fill_between(fut_dates, bear, bull, color="#4f8bd6", alpha=0.10)

# 關鍵水平線
ax.axhline(1089.29, color="#888", lw=0.9, ls=":")
ax.text(hist_dates[8], 1102, "歷史高點 $1,089", color="#aaa", fontsize=9, fontproperties=zh)
ax.axhline(800, color="#888", lw=0.9, ls=":")
ax.text(hist_dates[8], 812, "關鍵支撐 $800", color="#aaa", fontsize=9, fontproperties=zh)

# 今日 / 財報日標記
ax.axvline(today, color="#fff", lw=0.8, ls="-", alpha=0.5)
ax.annotate("今日 06/11\n$891.88 (-4.7%)\n盤後 +4.2%", xy=(today, 891.88),
            xytext=(today - timedelta(days=95), 640),
            color="#fff", fontsize=10, fontproperties=zh,
            arrowprops=dict(arrowstyle="->", color="#fff", alpha=0.7))
earn = datetime(2026, 6, 24)
ax.axvline(earn, color="#ff80ab", lw=1.0, ls="--", alpha=0.8)
ax.annotate("▶ 6/24 財報\n(最大變數)", xy=(earn, 1180), xytext=(earn + timedelta(days=12), 1240),
            color="#ff80ab", fontsize=10, fontproperties=zh,
            arrowprops=dict(arrowstyle="->", color="#ff80ab", alpha=0.8))

# 期末目標價標籤
for y, c, txt in [(bull[-1], "#00c853", f"${bull[-1]:,.0f}"),
                  (base[-1], "#ffb300", f"${base[-1]:,.0f}"),
                  (bear[-1], "#ff5252", f"${bear[-1]:,.0f}")]:
    ax.text(fut_dates[-1] + timedelta(days=6), y, txt, color=c, fontsize=11, fontweight="bold", va="center")

ax.set_title("MU 美光科技｜未來 12 個月走勢情境預估 (2026/06 → 2027/06)",
             fontproperties=zh, fontsize=15, color="#fff", pad=14)
ax.set_ylabel("股價 (USD)", fontproperties=zh, color="#ccc", fontsize=11)
ax.tick_params(colors="#999")
for s in ax.spines.values():
    s.set_color("#333")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y/%m"))
ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
ax.grid(color="#2a2f3a", lw=0.5, alpha=0.6)
ax.set_xlim(hist_dates[0], fut_dates[-1] + timedelta(days=40))
ax.set_ylim(0, 1520)

leg = ax.legend(loc="upper left", prop=zh, fontsize=10, framealpha=0.15,
                facecolor="#1c212b", edgecolor="#444", labelcolor="#eee")
fig.text(0.99, 0.01, "情境機率為主觀估計，僅供參考，不構成投資建議",
         fontproperties=zh, fontsize=8.5, color="#777", ha="right")
plt.tight_layout()
plt.savefig("/home/user/nvidia-tracker/mu_forecast.png", facecolor=fig.get_facecolor(), bbox_inches="tight")
print("saved")
