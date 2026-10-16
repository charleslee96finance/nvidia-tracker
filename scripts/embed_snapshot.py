#!/usr/bin/env python3
"""Re-embed data/market_snapshot.json into autopilot.html as the offline fallback.

autopilot.html fetches data/market_snapshot.json at runtime when served over
http(s) (GitHub Pages), so the live site refreshes by itself. The copy embedded in
the page is only used when that fetch is unavailable (file://, sandboxed viewers),
so refresh it occasionally with:  python scripts/embed_snapshot.py
"""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
page = root / 'autopilot.html'
snap = json.loads((root / 'data' / 'market_snapshot.json').read_text())
text = page.read_text(encoding='utf-8')

pattern = re.compile(r'(var MARKET = MARKET_OVERRIDE \|\| )\{.*?\};(\s*var DATES)', re.DOTALL)
if len(pattern.findall(text)) != 1:
    sys.exit('embedded snapshot anchor not found exactly once')
blob = json.dumps(snap, separators=(',', ':'), ensure_ascii=False)
text = pattern.sub(lambda m: m.group(1) + blob + ';' + m.group(2), text)
page.write_text(text, encoding='utf-8')
print(f"embedded {len(snap['series'])} tickers, {len(snap['dates'])} sessions, asof {snap['asof']}")
