#!/usr/bin/env python3
"""AUTO-PILOT paper-trading bot.

Applies the same rules as autopilot.html against an Alpaca PAPER account:
  - target weights: NVDA 30 / MU 18 / TSM 16 / AVGO 14 / AMD 12 / INTC 10,
    scaled to a 65% total equity allocation (the "balanced" preset)
  - rebalance only when a position drifts more than BAND from target
  - trend risk control: close below the 20-day MA halves that target

The base URL is deliberately hardcoded to the paper endpoint. Do not point
this at a live account until you have watched it trade paper money for a
long time and understand every order it places. Nothing here predicts
prices; past performance does not guarantee future results.

Setup (repo Settings -> Secrets and variables -> Actions):
  ALPACA_API_KEY_ID      paper API key id
  ALPACA_API_SECRET_KEY  paper API secret
Optional env:
  DRY_RUN=1              log intended orders without submitting them
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

ALPACA_BASE = 'https://paper-api.alpaca.markets'  # paper trading only
USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
)

TARGET_BASE = {'NVDA': 30, 'MU': 18, 'TSM': 16, 'AVGO': 14, 'AMD': 12, 'INTC': 10}
EQUITY_FRACTION = 0.65   # balanced preset: 65% stocks / 35% cash
BAND = 0.05              # max rebalance band: |weight - target| > 5pp
BAND_FRAC = 0.40         # ...but never more than 40% of the position's own target.
                         # A risk-off flip halves the target (a 50% move); the band must
                         # sit below that, or small positions (AVGO/AMD/INTC) would
                         # never be cut. The page forces a trade on a regime change;
                         # this bot is stateless, so the scaled band stands in for it.
MA_LEN = 20              # trend risk-control lookback
MIN_TRADE = 50.0         # skip dust orders (USD)

KEY = os.environ.get('ALPACA_API_KEY_ID', '')
SECRET = os.environ.get('ALPACA_API_SECRET_KEY', '')
DRY_RUN = os.environ.get('DRY_RUN', '0') == '1'


def yahoo_closes(ticker: str, retries: int = 3) -> list[float]:
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=3mo&interval=1d'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.load(resp)
            result = data['chart']['result'][0]
            return [c for c in result['indicators']['quote'][0]['close'] if c is not None]
        except (urllib.error.URLError, KeyError, ValueError, IndexError):
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
    return []


def alpaca(path: str, payload: dict | None = None) -> object:
    req = urllib.request.Request(
        ALPACA_BASE + path,
        headers={
            'APCA-API-KEY-ID': KEY,
            'APCA-API-SECRET-KEY': SECRET,
            'Content-Type': 'application/json',
        },
        data=json.dumps(payload).encode() if payload is not None else None,
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.load(resp)


def write_summary(lines: list[str]) -> None:
    """Append a markdown report to the Actions run page (no-op outside Actions)."""
    path = os.environ.get('GITHUB_STEP_SUMMARY')
    if path:
        with open(path, 'a', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')


def main() -> None:
    if not KEY or not SECRET:
        print('Alpaca paper-trading secrets are not configured; nothing to do.')
        print('Add ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY as Actions secrets')
        print('(paper keys from https://app.alpaca.markets, Paper Trading section).')
        return

    account = alpaca('/v2/account')
    if account.get('trading_blocked') or account.get('account_blocked') \
            or account.get('status') != 'ACTIVE':
        sys.exit(f'account not tradable (status={account.get("status")}, '
                 f'trading_blocked={account.get("trading_blocked")}); refusing to trade')
    equity = float(account['equity'])
    # a second run the same day must not double-order what is still pending
    pending = {o['symbol'] for o in alpaca('/v2/orders?status=open&limit=100')}
    if pending:
        print(f'open orders already pending for: {sorted(pending)}; skipping those symbols')
    positions = {p['symbol']: float(p['market_value']) for p in alpaca('/v2/positions')}
    print(f'account equity ${equity:,.2f}, cash ${float(account["cash"]):,.2f}, '
          f'positions: {positions or "none"}')

    base_sum = sum(TARGET_BASE.values())
    plan: list[tuple[str, str, float, str]] = []  # (side, symbol, usd, reason)
    rows: list[str] = []

    for sym, base in TARGET_BASE.items():
        try:
            closes = yahoo_closes(sym)
        except (urllib.error.URLError, KeyError, ValueError, IndexError) as e:
            print(f'  {sym:5s} signal fetch failed ({e}); holding position')
            continue
        if len(closes) < MA_LEN:
            print(f'  {sym:5s} not enough history; holding position')
            continue
        px = closes[-1]
        ma = sum(closes[-MA_LEN:]) / MA_LEN
        risk_off = px < ma
        target_on = EQUITY_FRACTION * base / base_sum
        target = target_on * (0.5 if risk_off else 1.0)
        band = min(BAND, BAND_FRAC * target_on)
        held = positions.get(sym, 0.0)
        weight = held / equity
        state = 'RISK-OFF (close < MA20)' if risk_off else 'trend ok'
        print(f'  {sym:5s} px {px:9.2f}  ma20 {ma:9.2f}  {state:24s} '
              f'weight {weight*100:5.1f}%  target {target*100:5.1f}%')
        delta = target * equity - held
        skip = None
        if sym in pending:
            skip = 'skip (order pending)'
        elif abs(weight - target) <= band:
            skip = 'hold (in band)'
        elif abs(delta) < MIN_TRADE:
            skip = 'hold (dust)'
        side = 'buy' if delta > 0 else 'sell'
        action = skip or f'{side.upper()} ${abs(delta):,.0f}'
        rows.append(f'| {sym} | {px:.2f} | {ma:.2f} | {state} | {weight*100:.1f}% | '
                    f'{target*100:.1f}% | {action} |')
        if skip:
            continue
        reason = (f'{sym} weight {weight*100:.1f}% vs target {target*100:.1f}% '
                  f'(band {band*100:.1f}pp, {state})')
        plan.append((side, sym, abs(delta), reason))

    header = ['## AUTO-PILOT paper trade', '',
              f'Equity ${equity:,.2f} (paper). Dry run: {DRY_RUN}', '',
              '| Symbol | Close | MA20 | Trend | Weight | Target | Action |',
              '|---|---|---|---|---|---|---|'] + rows
    if not plan:
        print('all positions inside their bands; no orders today.')
        write_summary(header + ['', 'No orders today.'])
        return

    plan.sort(key=lambda o: o[0] != 'sell')  # free cash first
    for side, sym, usd, reason in plan:
        print(f'{"DRY-RUN " if DRY_RUN else ""}ORDER: {side:4s} {sym:5s} '
              f'${usd:,.2f} -- {reason}')
        if DRY_RUN:
            continue
        try:
            order = alpaca('/v2/orders', {
                'symbol': sym,
                'notional': str(round(usd, 2)),
                'side': side,
                'type': 'market',
                'time_in_force': 'day',
            })
            print(f'  submitted: id={order["id"]} status={order["status"]}')
        except urllib.error.HTTPError as e:
            print(f'  REJECTED: {e.read().decode()[:200]}', file=sys.stderr)
        time.sleep(0.4)
    write_summary(header + ['', '### Orders', ''] +
                  [f'- {"(dry run) " if DRY_RUN else ""}**{s.upper()} {sym}** ${usd:,.2f} -- {r}'
                   for s, sym, usd, r in plan])


if __name__ == '__main__':
    main()
