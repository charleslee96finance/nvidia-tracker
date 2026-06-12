# -*- coding: utf-8 -*-
"""MU (美光科技) 未來 3 個月 週K線 + 期權量 預測圖"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.font_manager import FontProperties
from datetime import datetime, timedelta

zh = FontProperties(fname="/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc")

# ---------- 參數 ----------
p0 = 891.88          # 現價 2026/06/11
today = datetime(2026, 6, 11)
n_weeks = 13         # 未來 ~3 個月 (13 週)
earn_week = 2        # 第2週為 6/24 財報週

# 每週基準收盤路徑 (基準情境: 財報後跳升 -> 震盪向上至 ~$1,050)
# 反映財報跳空 + 之後逐步墊高
base_close = [p0, 905, 980, 995, 1010, 1005, 1020, 1035, 1025, 1040, 1045, 1050, 1058]

rng = np.random.default_rng(7)

dates, O, H, L, C = [], [], [], [], []
prev_close = p0
for w in range(n_weeks):
    d = today + timedelta(weeks=w)
    dates.append(d)
    o = prev_close
    target_c = base_close[w]
    # 財報週 (w==earn_week) 跳空放大波動
    is_earn = (w == earn_week)
    span = (0.11 if is_earn else 0.05) * o     # 週內振幅
    c = target_c + rng.normal(0, span * 0.25)
    hi = max(o, c) + abs(rng.normal(0, span * (0.9 if is_earn else 0.55)))
    lo = min(o, c) - abs(rng.normal(0, span * (0.9 if is_earn else 0.55)))
    O.append(o); H.append(hi); L.append(lo); C.append(c)
    prev_close = c

O, H, L, C = map(np.array, (O, H, L, C))

# ---------- 期權量 (張) : 財報週爆量, 之後遞減 ----------
opt_vol = np.array([2.8, 3.5, 9.6, 6.2, 4.1, 3.3, 3.6, 4.0, 3.2, 3.0, 3.4, 3.8, 5.2])  # 單位: 十萬張
# call/put 拆分: 多頭情境 call 偏多
call_ratio = np.array([.55,.58,.66,.62,.60,.58,.60,.61,.59,.60,.61,.60,.63])
call_vol = opt_vol * call_ratio
put_vol = opt_vol * (1 - call_ratio)

# ---------- 繪圖 ----------
fig, (ax, axv) = plt.subplots(2, 1, figsize=(13, 8.5), dpi=150,
                              gridspec_kw={"height_ratios": [3, 1], "hspace": 0.08},
                              sharex=True)
for a in (ax, axv):
    a.set_facecolor("#0e1117")
fig.patch.set_facecolor("#0e1117")

x = mdates.date2num(dates)
w = 4.2  # 蠟燭寬度(天)
for xi, o, h, l, c in zip(x, O, H, L, C):
    up = c >= o
    col = "#26a69a" if up else "#ef5350"      # 綠漲 紅跌
    ax.vlines(xi, l, h, color=col, lw=1.3)     # 影線
    ax.add_patch(plt.Rectangle((xi - w/2, min(o, c)), w, abs(c - o) or 0.5,
                               facecolor=col, edgecolor=col))

# 關鍵線
ax.axhline(891.88, color="#fff", ls=":", lw=0.8, alpha=0.5)
ax.text(x[0], 905, "起漲 $891.88", color="#ddd", fontproperties=zh, fontsize=9)
ax.axhline(1089.29, color="#ffb300", ls=":", lw=0.9)
ax.text(x[0], 1095, "歷史高/壓力 $1,089", color="#ffb300", fontproperties=zh, fontsize=9)
ax.axhline(800, color="#888", ls=":", lw=0.9)
ax.text(x[0], 770, "關鍵支撐 $800", color="#aaa", fontproperties=zh, fontsize=9)

# 財報週標記
earn_x = x[earn_week]
ax.axvline(earn_x, color="#ff80ab", ls="--", lw=1.0, alpha=0.8)
ax.annotate("▶ 6/24 財報週\n預期跳空放量", xy=(earn_x, H[earn_week]),
            xytext=(earn_x + 6, H[earn_week] + 40),
            color="#ff80ab", fontproperties=zh, fontsize=10,
            arrowprops=dict(arrowstyle="->", color="#ff80ab"))

ax.set_title("MU 美光科技｜未來 3 個月 週K線預測 + 期權量 (2026/06 → 2026/09)",
             fontproperties=zh, fontsize=15, color="#fff", pad=12)
ax.set_ylabel("股價 (USD)", fontproperties=zh, color="#ccc")
ax.set_ylim(720, 1180)
ax.grid(color="#2a2f3a", lw=0.5, alpha=0.6)

# 圖例 (蠟燭顏色)
from matplotlib.patches import Patch
ax.legend(handles=[Patch(color="#26a69a", label="收漲 (綠, 美股慣例)"),
                   Patch(color="#ef5350", label="收跌 (紅)")],
          loc="lower right", prop=zh, framealpha=0.15,
          facecolor="#1c212b", edgecolor="#444", labelcolor="#eee")

# ---------- 期權量副圖 ----------
axv.bar(x, call_vol, width=w, color="#26a69a", label="Call (買權)")
axv.bar(x, put_vol, width=w, bottom=call_vol, color="#ef5350", label="Put (賣權)")
axv.axvline(earn_x, color="#ff80ab", ls="--", lw=1.0, alpha=0.8)
axv.set_ylabel("期權量\n(十萬張)", fontproperties=zh, color="#ccc", fontsize=10)
axv.grid(color="#2a2f3a", lw=0.5, alpha=0.5, axis="y")
axv.legend(loc="upper right", prop=zh, fontsize=9, framealpha=0.15,
           facecolor="#1c212b", edgecolor="#444", labelcolor="#eee", ncol=2)

axv.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d"))
axv.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=mdates.MO, interval=1))
for a in (ax, axv):
    a.tick_params(colors="#999")
    for s in a.spines.values():
        s.set_color("#333")
plt.setp(axv.get_xticklabels(), rotation=45, ha="right", fontsize=8)
axv.set_xlim(x[0] - 5, x[-1] + 6)

fig.text(0.99, 0.005, "K線與期權量為情境模擬，僅供參考，不構成投資建議",
         fontproperties=zh, fontsize=8.5, color="#777", ha="right")
plt.savefig("/home/user/nvidia-tracker/mu_candle_3m.png",
            facecolor=fig.get_facecolor(), bbox_inches="tight")
print("saved")
