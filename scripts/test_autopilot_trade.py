#!/usr/bin/env python3
"""Offline tests for scripts/autopilot_trade.py (mocked Alpaca + price feed).

Run: python scripts/test_autopilot_trade.py
The paper-trade workflow runs this before every trading run.
"""
import contextlib
import importlib.util
import io
import os
import sys
import unittest
from pathlib import Path

os.environ['ALPACA_API_KEY_ID'] = 'test'
os.environ['ALPACA_API_SECRET_KEY'] = 'test'
os.environ.pop('GITHUB_STEP_SUMMARY', None)

_spec = importlib.util.spec_from_file_location(
    'bot', Path(__file__).with_name('autopilot_trade.py'))
bot = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bot)
bot.time.sleep = lambda *_: None

EQUITY = 100000.0
BASE_SUM = sum(bot.TARGET_BASE.values())
TARGET_ON = {s: EQUITY * bot.EQUITY_FRACTION * b / BASE_SUM for s, b in bot.TARGET_BASE.items()}
ACTIVE = {'status': 'ACTIVE', 'trading_blocked': False, 'account_blocked': False,
          'equity': str(EQUITY), 'cash': str(EQUITY)}

UP = [100 + i * 0.5 for i in range(60)]      # last close above its 20-day MA
DOWN = [100 - i * 0.5 for i in range(60)]    # last close below its 20-day MA


def run_bot(closes_by_sym, account=ACTIVE, positions=None, open_orders=None, dry_run=False):
    sent = []

    def fake_alpaca(path, payload=None):
        if path == '/v2/account':
            return account
        if path.startswith('/v2/positions'):
            return [{'symbol': s, 'market_value': str(v)} for s, v in (positions or {}).items()]
        if path.startswith('/v2/orders?status=open'):
            return [{'symbol': s} for s in (open_orders or [])]
        if path == '/v2/orders':
            sent.append(payload)
            return {'id': 'x', 'status': 'accepted'}
        raise AssertionError(f'unexpected call {path}')

    bot.alpaca = fake_alpaca
    bot.yahoo_closes = lambda sym, retries=3: closes_by_sym(sym)
    bot.DRY_RUN = dry_run
    with contextlib.redirect_stdout(io.StringIO()):
        bot.main()
    return sent


class TestAutopilotTrade(unittest.TestCase):
    def test_fresh_account_buys_every_name_at_target_weight(self):
        sent = run_bot(lambda s: UP)
        self.assertEqual({o['symbol'] for o in sent}, set(bot.TARGET_BASE))
        for o in sent:
            self.assertEqual(o['side'], 'buy')
            self.assertAlmostEqual(float(o['notional']), TARGET_ON[o['symbol']], delta=1)

    def test_risk_off_halves_the_target(self):
        sent = run_bot(lambda s: DOWN if s == 'INTC' else UP)
        intc = next(o for o in sent if o['symbol'] == 'INTC')
        self.assertAlmostEqual(float(intc['notional']), TARGET_ON['INTC'] / 2, delta=1)

    def test_risk_off_flip_cuts_every_holding_including_small_ones(self):
        # Regression: with a fixed 5pp band, AVGO/AMD/INTC were never reduced.
        sent = run_bot(lambda s: DOWN, positions=dict(TARGET_ON))
        sold = {o['symbol'] for o in sent if o['side'] == 'sell'}
        self.assertEqual(sold, set(bot.TARGET_BASE))

    def test_positions_at_target_in_uptrend_do_nothing(self):
        self.assertEqual(run_bot(lambda s: UP, positions=dict(TARGET_ON)), [])

    def test_pending_order_symbol_is_skipped(self):
        sent = run_bot(lambda s: UP, open_orders=['MU'])
        self.assertNotIn('MU', {o['symbol'] for o in sent})
        self.assertEqual(len(sent), len(bot.TARGET_BASE) - 1)

    def test_blocked_account_refuses_to_trade(self):
        with self.assertRaises(SystemExit):
            run_bot(lambda s: UP, account=dict(ACTIVE, trading_blocked=True))

    def test_dry_run_sends_nothing(self):
        self.assertEqual(run_bot(lambda s: UP, dry_run=True), [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
