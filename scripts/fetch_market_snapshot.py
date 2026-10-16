#!/usr/bin/env python3
"""Fetch a static snapshot of daily closes for the AUTO-PILOT page.

Pulls daily close prices from the same Yahoo Finance chart endpoint the other
updaters in this repo use, aligns every ticker to NVDA's trading calendar
(forward-filling small gaps), and writes data/market_snapshot.json.

The window START is fixed (START_DATE) and the END rolls forward to the latest
session. A fixed start keeps the page's human-vs-Claude duel meaningful: Claude's
portfolio was written from a January-2026 viewpoint, so the comparison must always
begin there rather than slide with a rolling lookback.
"""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
)

START_DATE = '2026-01-13'   # first session of the comparison window (do not slide)

# Core six (the page's built-in pool) first, then popular extras for the
# custom-add form and the duel.
TICKERS = [
    'NVDA', 'MU', 'TSM', 'AVGO', 'AMD', 'INTC',
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA',
    'NFLX', 'ORCL', 'PLTR', 'QCOM', 'ARM', 'ASML',
    'SMCI', 'COIN', 'CRM', 'IBM', 'JPM', 'SPY',
]

MAX_FFILL_FRACTION = 0.03   # drop a ticker if more than 3% of sessions need filling
RETRIES = 3


def fetch_closes(ticker: str) -> dict[str, float]:
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=2y&interval=1d'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    last_err: Exception | None = None
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.load(resp)
            result = data['chart']['result'][0]
            closes = {}
            for ts, c in zip(result['timestamp'], result['indicators']['quote'][0]['close']):
                if c is None:
                    continue
                closes[time.strftime('%Y-%m-%d', time.gmtime(ts))] = round(float(c), 2)
            return closes
        except (urllib.error.URLError, KeyError, ValueError, IndexError, TypeError) as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f'{ticker}: {last_err}')


def main() -> None:
    series: dict[str, dict[str, float]] = {}
    for t in TICKERS:
        try:
            series[t] = fetch_closes(t)
            print(f'  {t:5s} {len(series[t])} days')
        except Exception as e:  # noqa: BLE001 - report and continue
            print(f'  {t:5s} FETCH FAILED: {e}', file=sys.stderr)
        time.sleep(0.5)

    if 'NVDA' not in series:
        sys.exit('NVDA missing; aborting without writing snapshot')

    dates = [d for d in sorted(series['NVDA']) if d >= START_DATE]
    if len(dates) < 30:
        sys.exit(f'only {len(dates)} sessions since {START_DATE}; refusing to write snapshot')

    snap = {
        'asof': dates[-1],
        'source': 'Yahoo Finance daily close',
        'start': START_DATE,
        'dates': dates,
        'series': {},
    }
    max_fill = max(2, int(len(dates) * MAX_FFILL_FRACTION))
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
        if aligned and filled <= max_fill:
            snap['series'][t] = aligned
        else:
            print(f'  {t:5s} dropped (coverage: filled={filled}, allowed={max_fill})')

    out = Path(__file__).resolve().parent.parent / 'data' / 'market_snapshot.json'
    out.write_text(json.dumps(snap, separators=(',', ':')) + '\n')
    print(f"wrote {out.name}: {len(snap['series'])} tickers, "
          f"{len(dates)} sessions, {dates[0]} -> {snap['asof']}")


if __name__ == '__main__':
    main()
