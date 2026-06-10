#!/usr/bin/env python3
"""SPCX Scorecard builder — generates spcx.html with latest Yahoo prices baked in.

Runs on GitHub Actions daily at 02:00 UTC (= 10:00 Beijing time).

Logic mirrors the local PowerShell updater:
  * Always update "current price" (.cur) for all 12 tickers.
  * Update "base price" (.base) only for COMPS (not SPCX) on/before IPO date 2026-06-12.
  * After IPO date, base is locked (CSS shows purple "locked" border).
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

TICKERS = [
    'SPCX', 'RKLB', 'ASTS', 'SIDU', 'BKSY', 'LUNR',
    'RDW', 'SATS', 'VSAT', 'NBIS', 'CRWV', 'IREN',
]
COMPANY_NAMES = {
    'SPCX': 'SpaceX', 'RKLB': 'Rocket Lab', 'ASTS': 'AST SpaceMobile',
    'SIDU': 'Sidus Space', 'BKSY': 'BlackSky', 'LUNR': 'Intuitive Machines',
    'RDW': 'Redwire', 'SATS': 'EchoStar', 'VSAT': 'Viasat',
    'NBIS': 'Nebius', 'CRWV': 'CoreWeave', 'IREN': 'IREN Ltd',
}
TIER = {
    'SPCX': ('epi', '震中', 'tt-epi'),
    'RKLB': ('comp', '对标', 'tt-comp'), 'ASTS': ('comp', '对标', 'tt-comp'),
    'SIDU': ('comp', '对标', 'tt-comp'), 'BKSY': ('comp', '对标', 'tt-comp'),
    'LUNR': ('comp', '对标', 'tt-comp'), 'RDW':  ('comp', '对标', 'tt-comp'),
    'SATS': ('comp', '代理', 'tt-proxy'), 'VSAT': ('comp', '代理', 'tt-proxy'),
    'NBIS': ('comp', 'AI',  'tt-ai'),   'CRWV': ('comp', 'AI',  'tt-ai'),
    'IREN': ('comp', 'AI',  'tt-ai'),
}

IPO_DATE_BJT = datetime(2026, 6, 12, tzinfo=timezone(timedelta(hours=8)))
BJT = timezone(timedelta(hours=8))
USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
)


def fetch_price(ticker: str) -> float | None:
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.load(resp)
        meta = data['chart']['result'][0]['meta']
        price = meta.get('regularMarketPrice')
        return round(float(price), 2) if price else None
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError) as e:
        print(f'  {ticker:5s} FETCH FAILED: {e}', file=sys.stderr)
        return None


BASELINE_FILE = Path(__file__).parent / 'data' / 'spcx_baseline.json'


def load_baseline() -> dict[str, float]:
    if BASELINE_FILE.exists():
        try:
            return json.loads(BASELINE_FILE.read_text(encoding='utf-8')).get('prices', {})
        except (json.JSONDecodeError, KeyError):
            return {}
    return {}


def save_baseline(base_prices: dict[str, float], stamp: str) -> None:
    BASELINE_FILE.parent.mkdir(parents=True, exist_ok=True)
    BASELINE_FILE.write_text(
        json.dumps({'snapshot_date': stamp, 'prices': base_prices}, indent=2, ensure_ascii=False),
        encoding='utf-8',
    )


def row_html(ticker: str, base_price: float | None, cur_price: float | None, base_locked: bool) -> str:
    role, tier_label, tier_class = TIER[ticker]
    company = COMPANY_NAMES[ticker]
    cur_val = f' value="{cur_price}"' if cur_price is not None else ''
    if ticker == 'SPCX':
        base_input = '<input class="px base locked" type="number" value="135" placeholder="135" readonly>'
    elif base_locked:
        base_v = f' value="{base_price}"' if base_price is not None else ''
        base_input = f'<input class="px base locked" type="number" data-ticker="{ticker}" placeholder="基准" readonly{base_v}>'
    else:
        base_v = f' value="{base_price}"' if base_price is not None else ''
        base_input = f'<input class="px base auto" type="number" data-ticker="{ticker}" placeholder="基准"{base_v}>'

    if ticker == 'SPCX':
        ticker_small = 'SpaceX'
        return (
            f'    <div class="trow" data-row data-role="{role}">\n'
            f'      <div class="nm">SPCX <span class="tier-tag {tier_class}">{tier_label}</span><small>{ticker_small}</small></div>\n'
            f'      <div>{base_input}</div>\n'
            f'      <div><input class="px cur auto" type="number" data-ticker="SPCX" placeholder="首日价"{cur_val}></div>\n'
            f'      <div class="pct">—</div>\n'
            f'      <div class="verdict v-empty">—</div>\n'
            f'    </div>'
        )
    return (
        f'    <div class="trow" data-row data-role="{role}">'
        f'<div class="nm">{ticker} <span class="tier-tag {tier_class}">{tier_label}</span><small>{company}</small></div>'
        f'<div>{base_input}</div>'
        f'<div><input class="px cur auto" type="number" data-ticker="{ticker}" placeholder="现价"{cur_val}></div>'
        f'<div class="pct">—</div><div class="verdict v-empty">—</div></div>'
    )


def build_html(prices: dict[str, float], base_prices: dict[str, float], update_base: bool, stamp_bjt: str, mode_tag: str) -> str:
    """Assemble full spcx.html from template + dynamic rows."""
    base_locked = not update_base
    sections: list[tuple[str, list[str]]] = [
        ('▸ 震中', ['SPCX']),
        ('▸ 第一圈 · 直接对标', ['RKLB', 'ASTS', 'SIDU', 'BKSY', 'LUNR', 'RDW']),
        ('▸ 第二圈 · 代理标的', ['SATS', 'VSAT']),
        ('▸ 第三圈 · AI 算力链(你的持仓)', ['NBIS', 'CRWV', 'IREN']),
    ]
    table_inner: list[str] = []
    for section_title, section_tickers in sections:
        table_inner.append(f'    <div class="section-div">{section_title}</div>')
        for t in section_tickers:
            table_inner.append(row_html(t, base_prices.get(t), prices.get(t), base_locked))
    rows_html = '\n'.join(table_inner)

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SPCX 的追踪 · 复盘记分卡</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap');
:root{{
  --bg:#0a0c12;--bg2:#0f121b;--panel:#141823;--panel2:#1a1f2d;--line:#242b3d;
  --ink:#e8edf7;--dim:#8b97b0;--faint:#5b6479;
  --cyan:#56d7ff;--amber:#ffb454;--red:#ff5d6c;--green:#52e09a;--violet:#9d8bff;
  color-scheme:dark light;
}}
@media (prefers-color-scheme: light){{
  :root{{
    --bg:#f7f9fc;--bg2:#ffffff;--panel:#f1f5fa;--panel2:#e8edf5;--line:#dde2eb;
    --ink:#1a1f2d;--dim:#5b6479;--faint:#9aa3b5;
    --cyan:#0080a8;--amber:#c2410c;--red:#dc2626;--green:#047857;--violet:#6d28d9;
  }}
}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:radial-gradient(1100px 600px at 70% -8%,rgba(86,215,255,.08),transparent 55%),var(--bg);
  color:var(--ink);font-family:'Noto Sans SC',sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased;padding:30px 18px 70px}}
.wrap{{max-width:980px;margin:0 auto}}
.head-font{{font-family:'Chakra Petch',sans-serif}}.mono{{font-family:'Space Mono',monospace}}
header{{border:1px solid var(--line);border-radius:16px;background:var(--bg2);padding:24px 26px;margin-bottom:14px}}
.kicker{{font-family:'Chakra Petch';font-size:12px;letter-spacing:3px;color:var(--cyan);text-transform:uppercase}}
h1{{font-family:'Chakra Petch';font-weight:700;font-size:30px;letter-spacing:1px;margin:5px 0 4px}}
.sub{{color:var(--dim);font-size:13.5px}}
.updated{{margin-top:10px;font-family:'Space Mono';font-size:11.5px;color:var(--faint)}}
.updated b{{color:var(--cyan);font-weight:400}}
.backlink{{display:inline-block;margin-bottom:14px;font-family:'Chakra Petch';font-size:12px;letter-spacing:1.5px;color:var(--cyan);text-decoration:none;border:1px solid var(--line);padding:6px 14px;border-radius:8px;transition:border-color .2s}}
.backlink:hover{{border-color:var(--cyan)}}
.howto{{border:1px dashed var(--line);border-radius:12px;background:rgba(86,215,255,.04);padding:14px 18px;margin-bottom:14px;font-size:13px;color:var(--dim)}}
.howto b{{color:var(--ink)}}
.howto .step{{display:inline-block;font-family:'Chakra Petch';color:var(--cyan);margin-right:6px}}
.score{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}}
.scard{{border:1px solid var(--line);border-radius:14px;background:var(--panel);padding:18px 20px;text-align:center}}
.scard .lbl{{font-family:'Chakra Petch';font-size:11px;letter-spacing:1.5px;color:var(--faint);text-transform:uppercase}}
.scard .big{{font-family:'Space Mono';font-size:34px;font-weight:700;margin-top:6px}}
.scard .vd{{font-size:12.5px;margin-top:4px;color:var(--dim)}}
.tbl{{border:1px solid var(--line);border-radius:16px;background:var(--bg2);overflow:hidden}}
.trow{{display:grid;grid-template-columns:1.6fr .9fr .9fr .8fr 1.2fr;gap:8px;align-items:center;padding:11px 16px;border-bottom:1px solid var(--line)}}
.trow.hd{{background:var(--panel2);font-family:'Chakra Petch';font-size:11px;letter-spacing:1px;color:var(--faint);text-transform:uppercase}}
.trow:last-child{{border-bottom:none}}
.tier-tag{{font-size:9.5px;padding:2px 6px;border-radius:5px;margin-left:7px;vertical-align:middle;font-weight:600}}
.tt-comp{{background:rgba(82,224,154,.13);color:var(--green)}}
.tt-proxy{{background:rgba(86,215,255,.13);color:var(--cyan)}}
.tt-ai{{background:rgba(255,180,84,.13);color:var(--amber)}}
.tt-epi{{background:rgba(157,139,255,.16);color:var(--violet)}}
.nm{{font-weight:600;font-size:14px}}.nm small{{color:var(--faint);font-weight:400;font-size:11px;display:block}}
input.px{{width:100%;background:var(--panel);border:1px solid var(--line);border-radius:8px;color:var(--ink);
  font-family:'Space Mono';font-size:13px;padding:7px 9px;text-align:right;transition:border-color .2s}}
input.px:focus{{outline:none;border-color:var(--cyan)}}
input.px.auto{{background:rgba(86,215,255,.06);border-color:rgba(86,215,255,.3)}}
input.px.locked{{background:rgba(157,139,255,.06);border-color:rgba(157,139,255,.3);color:var(--violet)}}
.pct{{font-family:'Space Mono';font-weight:700;font-size:14px;text-align:right}}
.verdict{{font-size:11.5px;font-weight:600;text-align:center;border-radius:7px;padding:5px 4px}}
.v-empty{{color:var(--faint)}}
.v-reflux{{background:rgba(255,93,108,.13);color:var(--red)}}
.v-hold{{background:rgba(255,180,84,.13);color:var(--amber)}}
.v-defy{{background:rgba(82,224,154,.13);color:var(--green)}}
.up{{color:var(--green)}}.down{{color:var(--red)}}.flat{{color:var(--dim)}}
.section-div{{padding:8px 16px;background:rgba(0,0,0,.2);font-family:'Chakra Petch';font-size:11px;letter-spacing:1.5px;color:var(--dim);border-bottom:1px solid var(--line)}}
.signals{{border:1px solid var(--line);border-radius:14px;background:var(--bg2);padding:20px 24px;margin-top:14px}}
.signals h3{{font-family:'Chakra Petch';font-size:14px;color:var(--cyan);letter-spacing:1px;margin-bottom:12px}}
.sig{{display:flex;gap:11px;align-items:flex-start;padding:8px 0;font-size:13px;color:var(--dim)}}
.sig input{{margin-top:4px;accent-color:var(--cyan);width:15px;height:15px;flex-shrink:0}}
.sig b{{color:var(--ink)}}
.foot{{margin-top:16px;border:1px solid var(--line);border-radius:12px;background:rgba(255,180,84,.05);padding:14px 18px;font-size:12px;color:var(--dim)}}
.foot b{{color:var(--amber)}}
@media(max-width:680px){{
  .score{{grid-template-columns:1fr}}
  .trow{{grid-template-columns:1.4fr 1fr 1fr;font-size:12px}}
  .trow .hide-m,.trow.hd .hide-m{{display:none}}
}}
</style>
</head>
<body>
<div class="wrap">
  <a class="backlink" href="./index.html">← 返回 NVIDIA 追踪器</a>
  <header>
    <div class="kicker">POST-IPO REVIEW · 全自动模式 · 云端版</div>
    <h1>SPCX 的追踪 · 复盘记分卡</h1>
    <div class="sub">验证假设:上市后,资金是否从"影子标的"回流到 SpaceX 本身?(sell-the-news)</div>
    <div class="updated">现价上次自动更新: <b>{stamp_bjt} BJT | {len(prices)}/{len(TICKERS)} | {mode_tag}</b> · 数据源 Yahoo Finance · 每日 02:00 UTC(10:00 BJT)由 GitHub Actions 刷新</div>
  </header>

  <div class="howto">
    <div><span class="step">①</span><b>全自动模式</b>:基准价 & 现价都由 GitHub Actions 每日 10:00 BJT 自动填入。</div>
    <div style="margin-top:5px"><span class="step">②</span><b>基准价</b>(青色边框)在 6/12 前持续追踪最新收盘 → 6/12 早 10:00 自动锁定为 IPO 前夜(6/11)收盘价 → 之后变紫色"已锁定"。</div>
    <div style="margin-top:5px"><span class="step">③</span><b>现价</b>每天写入最近一个美股交易日的收盘价。涨跌幅 + 判定全自动算。</div>
  </div>

  <div class="score">
    <div class="scard">
      <div class="lbl">SPCX 首日</div>
      <div class="big" id="spcxPct" style="color:var(--violet)">—</div>
      <div class="vd" id="spcxVd">填入上市后价</div>
    </div>
    <div class="scard">
      <div class="lbl">Sell-the-news 应验</div>
      <div class="big" id="refluxCount" style="color:var(--red)">0<span style="font-size:16px;color:var(--faint)">/—</span></div>
      <div class="vd">comps 回流(下跌)数</div>
    </div>
    <div class="scard">
      <div class="lbl">反预期(继续涨)</div>
      <div class="big" id="defyCount" style="color:var(--green)">0<span style="font-size:16px;color:var(--faint)">/—</span></div>
      <div class="vd">未应验的标的数</div>
    </div>
  </div>

  <div class="tbl">
    <div class="trow hd">
      <div>标的</div><div style="text-align:right">基准价 ($)</div><div style="text-align:right">上市后价 ($)</div><div style="text-align:right">涨跌</div><div style="text-align:center">判定</div>
    </div>
{rows_html}
  </div>

  <div class="signals">
    <h3 class="head-font">📡 复盘信号清单(打勾自查)</h3>
    <label class="sig"><input type="checkbox"><span><b>资金回流</b>:SPCX 首日强势放量,同时对标股(尤其涨幅最大的 RKLB/SIDU/ASTS)同步走弱?→ 印证 sell-the-news。</span></label>
    <label class="sig"><input type="checkbox"><span><b>是否破发</b>:SPCX 跌破 $135 发行价?破发往往拖累整个板块情绪。</span></label>
    <label class="sig"><input type="checkbox"><span><b>快速纳指</b>:有无 FTSE/Russell 等快速纳入消息?</span></label>
    <label class="sig"><input type="checkbox"><span><b>解禁临近</b>:留意 Q2 财报后的第一批解禁窗口。</span></label>
    <label class="sig"><input type="checkbox"><span><b>个股 vs 板块</b>:回调是普跌还是分化?分化才是真正机会。</span></label>
  </div>

  <div class="foot">
    <b>⚠</b> 本记分卡仅为复盘工具,<b>不构成投资建议</b>。所有价格由 Yahoo Finance 每日自动写入。判定逻辑:对标/代理/AI 股 下跌→「回流(应验)」,±2% 内→「抗跌」,上涨→「反预期」。
  </div>
</div>

<script>
function recompute(){{
  const rows=[...document.querySelectorAll('[data-row]')];
  let comps=0,reflux=0,defy=0;
  rows.forEach(r=>{{
    const base=parseFloat(r.querySelector('.base').value);
    const cur=parseFloat(r.querySelector('.cur').value);
    const pctEl=r.querySelector('.pct');
    const vEl=r.querySelector('.verdict');
    const role=r.dataset.role;
    if(!base||!cur||base<=0){{
      pctEl.textContent='—';pctEl.className='pct';
      vEl.textContent='—';vEl.className='verdict v-empty';
      if(role==='epi'){{document.getElementById('spcxPct').textContent='—';document.getElementById('spcxVd').textContent='填入上市后价';}}
      return;
    }}
    const p=(cur-base)/base*100;
    pctEl.textContent=(p>=0?'+':'')+p.toFixed(1)+'%';
    pctEl.className='pct '+(p>0.5?'up':(p<-0.5?'down':'flat'));
    if(role==='epi'){{
      const el=document.getElementById('spcxPct');
      el.textContent=(p>=0?'+':'')+p.toFixed(1)+'%';
      el.style.color=p>0.5?'var(--green)':(p<-0.5?'var(--red)':'var(--violet)');
      document.getElementById('spcxVd').textContent= p<0?'⚠ 破发':(p>15?'强势高开':'温和高开');
      vEl.textContent= p<0?'破发':'上涨';
      vEl.className='verdict '+(p<0?'v-reflux':'v-defy');
      return;
    }}
    comps++;
    if(p<-2){{vEl.textContent='🔴 回流(应验)';vEl.className='verdict v-reflux';reflux++;}}
    else if(p<=2){{vEl.textContent='🟡 抗跌';vEl.className='verdict v-hold';}}
    else{{vEl.textContent='🟢 反预期';vEl.className='verdict v-defy';defy++;}}
  }});
  document.getElementById('refluxCount').innerHTML=reflux+'<span style="font-size:16px;color:var(--faint)">/'+(comps||'—')+'</span>';
  document.getElementById('defyCount').innerHTML=defy+'<span style="font-size:16px;color:var(--faint)">/'+(comps||'—')+'</span>';
}}
document.querySelectorAll('input.px').forEach(i=>i.addEventListener('input',recompute));
recompute();
</script>
</body>
</html>
"""


def main() -> int:
    now_bjt = datetime.now(BJT)
    update_base = now_bjt.date() <= IPO_DATE_BJT.date()
    mode_tag = 'BASE+CUR' if update_base else 'CUR (base locked)'

    print(f'[{now_bjt:%Y-%m-%d %H:%M} BJT] Fetching prices… mode={mode_tag}')
    prices: dict[str, float] = {}
    with cf.ThreadPoolExecutor(max_workers=len(TICKERS)) as ex:
        for t, p in zip(TICKERS, ex.map(fetch_price, TICKERS)):
            if p is not None:
                prices[t] = p
                print(f'  {t:5s} = {p}')

    if not prices:
        print('No prices fetched. Aborting (spcx.html unchanged).', file=sys.stderr)
        return 1

    stamp = now_bjt.strftime('%Y-%m-%d %H:%M')

    # Resolve base prices:
    #   * Pre-IPO (update_base=True): use today's prices as base AND persist to baseline.json
    #     so that after IPO the locked snapshot survives across rebuilds.
    #   * Post-IPO: load baseline.json (committed on the 6/12 morning run); never overwrite.
    if update_base:
        base_prices = {t: prices[t] for t in prices if t != 'SPCX'}
        save_baseline(base_prices, stamp)
        print(f'Baseline refreshed and saved ({len(base_prices)} tickers).')
    else:
        base_prices = load_baseline()
        print(f'Baseline LOCKED — loaded {len(base_prices)} tickers from {BASELINE_FILE.name}.')

    html = build_html(prices, base_prices, update_base, stamp, mode_tag)

    out = Path(__file__).parent / 'spcx.html'
    out.write_text(html, encoding='utf-8')
    print(f'Wrote {out} ({len(html):,} bytes, {len(prices)}/{len(TICKERS)} tickers, mode={mode_tag})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
