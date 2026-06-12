"""全自動交易引擎：每日執行一次完整決策循環。

流程：
  取數據 → 4策略訊號 → 集成投票 → 風控(波動率倉位/回撤熔斷) → 計算目標股數
  → 與現有持倉比較 → 下單 → 記錄權益與交易日誌

用法：
  python3 engine.py --once                 # 跑一次決策（紙上交易，預設）
  python3 engine.py --once --dry-run       # 只看決策不下單
  python3 engine.py --once --broker alpaca # 用 Alpaca（需 API 金鑰）
排程（每個交易日收盤後自動執行）：
  cron:  30 16 * * 1-5  cd /path/to/quant_trading && python3 engine.py --once
"""
from __future__ import annotations
import argparse
import json
from datetime import datetime, timezone

from data import load_prices
from strategies import STRATEGIES
from risk import vol_target_scale, drawdown_guard, size_position
from broker import PaperBroker, AlpacaBroker

# ===== 系統參數（可調） =====
CONFIG = {
    "ticker": "MU",
    "lookback_start": "2024-01-01",   # 取多長歷史算訊號
    "ensemble_threshold": 0.5,        # 集成票數 >= 50% 才持倉
    "target_ann_vol": 0.35,           # 波動率目標 35%
    "max_drawdown": 0.25,             # 帳戶回撤 25% 熔斷
    "max_position_pct": 1.0,          # 最大倉位 100%（不開槓桿）
    "strategy_weights": {             # 各策略投票權重
        "趨勢均線交叉 (EMA20/50)": 0.35,
        "動量+RSI": 0.25,
        "突破 (唐奇安55/20)": 0.25,
        "均值回歸 (布林20,2σ)": 0.15,
    },
}


def compute_signal(df) -> dict:
    """回傳各策略最新訊號與加權集成權重。"""
    votes = {}
    for name, fn in STRATEGIES.items():
        votes[name] = float(fn(df).iloc[-1])
    w = CONFIG["strategy_weights"]
    ensemble = sum(votes[k] * w.get(k, 0) for k in votes) / sum(w.values())
    return {"votes": votes, "ensemble": ensemble}


def run_once(broker_name: str = "paper", dry_run: bool = False) -> dict:
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    tkr = CONFIG["ticker"]

    # 1) 數據
    df, src = load_prices(tkr, start=CONFIG["lookback_start"])
    price = float(df["Close"].iloc[-1])

    # 2) 訊號
    sig = compute_signal(df)
    raw_weight = sig["ensemble"] if sig["ensemble"] >= CONFIG["ensemble_threshold"] else 0.0

    # 3) 風控
    vol_scale = vol_target_scale(df["Close"], CONFIG["target_ann_vol"])
    target_weight = raw_weight * vol_scale

    broker = AlpacaBroker() if broker_name == "alpaca" else PaperBroker()
    eq_hist = broker.state["equity_history"] if isinstance(broker, PaperBroker) else []
    guard_ok = drawdown_guard(eq_hist + [broker.equity({tkr: price})],
                              CONFIG["max_drawdown"])
    if not guard_ok:
        target_weight = 0.0                                   # 熔斷 → 強制空手

    # 4) 目標股數 vs 現有持倉 → 下單
    equity = broker.equity({tkr: price})
    target_shares = size_position(equity, price, target_weight,
                                  CONFIG["max_position_pct"])
    held = broker.position(tkr)
    delta = target_shares - held

    fill = None
    if not dry_run and delta != 0:
        fill = broker.market_order(tkr, delta, price)
    if not dry_run:
        broker.record_equity({tkr: price})
        broker.save()

    # 5) 決策日誌
    report = {
        "time": ts, "ticker": tkr, "price": round(price, 2), "data_source": src,
        "votes": sig["votes"], "ensemble": round(sig["ensemble"], 3),
        "vol_scale": round(vol_scale, 3),
        "drawdown_guard": "OK" if guard_ok else "⛔ 熔斷",
        "target_weight": round(target_weight, 3),
        "equity": round(equity, 2), "held_shares": held,
        "target_shares": target_shares, "order_delta": delta,
        "fill": fill.__dict__ if fill else ("DRY-RUN" if dry_run else "無需調整"),
    }
    _print_card(report)
    return report


def _print_card(r: dict):
    print("\n┌─────────────── 自動交易決策卡 ───────────────")
    print(f"│ 時間   {r['time']}   來源 {r['data_source']}")
    print(f"│ 標的   {r['ticker']}  最新價 ${r['price']:,}")
    print("│ 策略投票：")
    for k, v in r["votes"].items():
        print(f"│   {'🟢 持有' if v else '⚪ 空手'}  {k}")
    print(f"│ 集成權重 {r['ensemble']}  × 波動率縮放 {r['vol_scale']}  → 目標倉位 {r['target_weight']}")
    print(f"│ 回撤熔斷 {r['drawdown_guard']}")
    print(f"│ 帳戶權益 ${r['equity']:,}   持倉 {r['held_shares']} 股 → 目標 {r['target_shares']} 股")
    print(f"│ 下單     {('買進' if r['order_delta']>0 else '賣出' if r['order_delta']<0 else '—')} "
          f"{abs(r['order_delta'])} 股   成交: {r['fill']}")
    print("└──────────────────────────────────────────────")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="執行一次決策循環")
    ap.add_argument("--dry-run", action="store_true", help="只看決策不下單")
    ap.add_argument("--broker", default="paper", choices=["paper", "alpaca"])
    args = ap.parse_args()
    if args.once:
        run_once(args.broker, args.dry_run)
    else:
        print(__doc__)
