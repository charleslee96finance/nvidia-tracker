"""執行層：統一下單介面。

  PaperBroker  — 本地紙上交易，狀態存 JSON，零風險測試（預設）
  AlpacaBroker — 串接 Alpaca 紙上/實盤 API（需設定環境變數金鑰）
"""
from __future__ import annotations
import json
import os
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class Fill:
    symbol: str
    side: str          # "buy" / "sell"
    qty: int
    price: float
    ts: str


class PaperBroker:
    """本地模擬券商：市價單以引擎傳入的最新價成交，含手續費。"""

    def __init__(self, state_path: str = "state/portfolio.json",
                 init_cash: float = 100_000, commission: float = 0.0005):
        self.state_path = state_path
        self.commission = commission
        os.makedirs(os.path.dirname(state_path) or ".", exist_ok=True)
        if os.path.exists(state_path):
            with open(state_path) as f:
                self.state = json.load(f)
        else:
            self.state = {"cash": init_cash, "positions": {}, "trades": [],
                          "equity_history": []}

    # ---- 查詢 ----
    def position(self, symbol: str) -> int:
        return int(self.state["positions"].get(symbol, 0))

    def cash(self) -> float:
        return float(self.state["cash"])

    def equity(self, prices: dict[str, float]) -> float:
        pos_val = sum(q * prices.get(s, 0.0)
                      for s, q in self.state["positions"].items())
        return self.cash() + pos_val

    # ---- 下單 ----
    def market_order(self, symbol: str, qty: int, price: float) -> Fill | None:
        """qty > 0 買進，qty < 0 賣出。回傳成交回報。"""
        if qty == 0:
            return None
        side = "buy" if qty > 0 else "sell"
        cost = abs(qty) * price
        fee = cost * self.commission
        if side == "buy" and cost + fee > self.cash():
            qty = int((self.cash() - fee) // price)          # 現金不足 → 縮量
            if qty <= 0:
                return None
            cost = qty * price
        held = self.position(symbol)
        if side == "sell" and abs(qty) > held:
            qty = -held                                       # 不做空
            if qty == 0:
                return None
            cost = abs(qty) * price

        self.state["cash"] -= qty * price + cost * self.commission
        self.state["positions"][symbol] = held + qty
        fill = Fill(symbol, side, abs(qty), price,
                    datetime.now(timezone.utc).isoformat(timespec="seconds"))
        self.state["trades"].append(fill.__dict__)
        return fill

    def record_equity(self, prices: dict[str, float]) -> float:
        eq = self.equity(prices)
        self.state["equity_history"].append(round(eq, 2))
        return eq

    def save(self):
        with open(self.state_path, "w") as f:
            json.dump(self.state, f, indent=2, ensure_ascii=False)


class AlpacaBroker:
    """Alpaca 紙上/實盤接口（REST）。

    需環境變數：
      ALPACA_API_KEY / ALPACA_SECRET_KEY
      ALPACA_BASE_URL (預設 paper：https://paper-api.alpaca.markets)
    """

    def __init__(self):
        self.key = os.environ.get("ALPACA_API_KEY")
        self.secret = os.environ.get("ALPACA_SECRET_KEY")
        self.base = os.environ.get("ALPACA_BASE_URL",
                                   "https://paper-api.alpaca.markets")
        if not (self.key and self.secret):
            raise RuntimeError(
                "未設定 ALPACA_API_KEY / ALPACA_SECRET_KEY 環境變數。"
                "請至 alpaca.markets 申請紙上交易金鑰後 export 再執行。")

    def _req(self, method: str, path: str, body: dict | None = None):
        req = urllib.request.Request(
            self.base + path,
            data=json.dumps(body).encode() if body else None,
            method=method,
            headers={"APCA-API-KEY-ID": self.key,
                     "APCA-API-SECRET-KEY": self.secret,
                     "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode())

    def position(self, symbol: str) -> int:
        try:
            return int(float(self._req("GET", f"/v2/positions/{symbol}")["qty"]))
        except Exception:                                     # noqa: BLE001
            return 0

    def cash(self) -> float:
        return float(self._req("GET", "/v2/account")["cash"])

    def equity(self, prices=None) -> float:
        return float(self._req("GET", "/v2/account")["equity"])

    def market_order(self, symbol: str, qty: int, price: float | None = None):
        if qty == 0:
            return None
        side = "buy" if qty > 0 else "sell"
        return self._req("POST", "/v2/orders", {
            "symbol": symbol, "qty": abs(qty),
            "side": side, "type": "market", "time_in_force": "day"})

    def record_equity(self, prices=None) -> float:
        return self.equity()

    def save(self):
        pass
