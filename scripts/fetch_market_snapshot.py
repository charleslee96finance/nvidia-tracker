#!/usr/bin/env python3
"""Fetch a static snapshot of daily closes for the AUTO-PILOT simulator page.

Pulls ~6 months of daily close prices from the same Yahoo Finance chart
endpoint the other updaters in this repo use, aligns every ticker to NVDA's
trading calendar (forward-filling small gaps), and writes a compact JSON
snapshot to data/market_snapshot.json.
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
)

# Core six (the simulator's built-in pool) first, then popular extras
# available to the page's custom-add form.
TICKERS = [
    'NVDA', 'MU', 'TSM', 'AVGO', 'AMD', 'INTC',
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA',
    'NFLX', 'ORCL', 'PLTR', 'QCOM', 'ARM', 'ASML',
    'SMCI', 'COIN', 'CRM', 'IBM', 'JPM', 'SPY',
]

SESSIONS = 126  # ~6 months of trading days
MAX_FFILL = 6   # drop a ticker if it needs more forward-fills than this


def fetch_closes(ticker: str) -> dict[str, float]:
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=7mo&interval=1d'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.load(resp)
    result = data['chart']['result'][0]
    closes = {}
    for ts, c in zip(result['timestamp'], result['indicators']['quote'][0]['close']):
        if c is None:
            continue
        day = time.strftime('%Y-%m-%d', time.gmtime(ts))
        closes[day] = round(float(c), 2)
    return closes


def main() -> None:
    series: dict[str, dict[str, float]] = {}
    for t in TICKERS:
        try:
            series[t] = fetch_closes(t)
            print(f'  {t:5s} {len(series[t])} days')
        except Exception as e:  # noqa: BLE001 - report and continue
            print(f'  {t:5s} FETCH FAILED: {e}', file=sys.stderr)
        time.sleep(0.6)

    if 'NVDA' not in series:
        sys.exit('NVDA missing; aborting without writing snapshot')

    dates = sorted(series['NVDA'])[-SESSIONS:]
    snap = {
        'asof': dates[-1],
        'source': 'Yahoo Finance daily close',
        'dates': dates,
        'series': {},
    }
    for t, closes in series.items():
        aligned, last, filled = [], None, 0
        for d in dates:
            v = closes.get(d)
            if v is None:
                filled += 1
                v = last
            if v is None:  # missing at the very start: no basis to fill
                aligned = []
                break
            aligned.append(v)
            last = v
        if aligned and filled <= MAX_FFILL:
            snap['series'][t] = aligned
        else:
            print(f'  {t:5s} dropped (coverage: filled={filled})')

    out = Path(__file__).resolve().parent.parent / 'data' / 'market_snapshot.json'
    out.write_text(json.dumps(snap, separators=(',', ':')) + '\n')
    print(f"wrote {out.name}: {len(snap['series'])} tickers, "
          f"{len(dates)} sessions, asof {snap['asof']}")


if __name__ == '__main__':
    main()
