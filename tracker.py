#!/usr/bin/env python3
"""Chip Tracker — NVIDIA · Intel · AMD daily tracker.

Runs on GitHub Actions. Outputs:
  - index.html  (served by GitHub Pages)
  - data/cache.json  (tracks seen item IDs across runs for the NEW badge)
"""

import json
import re
import sys
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from urllib.parse import quote

import feedparser
import requests

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
OUTPUT_FILE = ROOT / "index.html"
CACHE_FILE = DATA_DIR / "cache.json"
DATA_DIR.mkdir(exist_ok=True)

USER_AGENT = "Chip Tracker contact@local.dev"

# --- Company config ---------------------------------------------------------
COMPANIES = [
    {
        "name": "NVIDIA",
        "ticker": "NVDA",
        "color": "#76b900",          # NVIDIA green
        "cik": "0001045810",
        "blog_url": "https://blogs.nvidia.com/feed/",
        "search_terms": 'NVIDIA OR "Jensen Huang"',
        "invest_search": "NVIDIA (invests OR acquires OR stake OR backs OR partnership)",
        "name_regex": r"NVIDIA",
    },
    {
        "name": "Intel",
        "ticker": "INTC",
        "color": "#0071c5",          # Intel blue
        "cik": "0000050863",
        "blog_url": None,
        "search_terms": '"Intel Corp" OR "Lip-Bu Tan" OR "Intel chip"',
        "invest_search": "Intel (invests OR acquires OR stake OR backs OR partnership)",
        "name_regex": r"Intel(?:\s+Corp(?:oration)?)?",
    },
    {
        "name": "AMD",
        "ticker": "AMD",
        "color": "#ed1c24",          # AMD red
        "cik": "0000002488",
        "blog_url": None,
        "search_terms": '"AMD" OR "Lisa Su" OR "Advanced Micro Devices"',
        "invest_search": "AMD (invests OR acquires OR stake OR backs OR partnership)",
        "name_regex": r"AMD|Advanced\s+Micro\s+Devices",
    },
]

INVEST_PATTERN_TEMPLATES = [
    r"(?:{co})\s+(?:invests?|invested|to invest|investing)\s+(?:[\$\d.,]+\s*(?:billion|million|B|M)?\s*(?:in|into)\s+)?([A-Z][\w\s&.\-]+?)(?=[\s.,;:!?]|$)",
    r"(?:{co})\s+(?:acquires?|acquired|to acquire|acquiring)\s+([A-Z][\w\s&.\-]+?)(?=[\s.,;:!?]|$)",
    r"(?:{co})\s+(?:takes?|took|taking)\s+(?:a\s+)?(?:[\$\d.,]+\s*(?:billion|million|B|M)?\s*)?stake\s+in\s+([A-Z][\w\s&.\-]+?)(?=[\s.,;:!?]|$)",
    r"(?:{co})\s+(?:backs?|backed|backing|leads?|led|leading)\s+([A-Z][\w\s&.\-]+?)\s+(?:funding|round|Series|investment)",
    r"(?:{co})\s+(?:partners?|partnered|partnering)\s+with\s+([A-Z][\w\s&.\-]+?)(?=[\s.,;:!?]|$)",
]

STOP_WORDS = {"the", "a", "an", "this", "that", "its", "their", "our", "your",
              "and", "or", "but", "new", "more", "with", "to", "of", "us", "ai"}

# Build per-company patterns + feeds
for c in COMPANIES:
    c["patterns"] = [t.format(co=c["name_regex"]) for t in INVEST_PATTERN_TEMPLATES]
    c["self_regex"] = re.compile(c["name_regex"], re.IGNORECASE)
    feeds = [
        (f"Google News · {c['name']}",
         f"https://news.google.com/rss/search?q={quote(c['search_terms'])}&hl=en-US&gl=US&ceid=US:en"),
        (f"Google News · {c['name']} Investments",
         f"https://news.google.com/rss/search?q={quote(c['invest_search'])}&hl=en-US&gl=US&ceid=US:en"),
        (f"Yahoo Finance · {c['ticker']}",
         f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={c['ticker']}&region=US&lang=en-US"),
    ]
    if c["blog_url"]:
        feeds.append((f"{c['name']} Blog", c["blog_url"]))
    c["feeds"] = feeds


def co_badge_class(name):
    return {"NVIDIA": "cb-nvda", "Intel": "cb-intc", "AMD": "cb-amd"}.get(name, "cb-nvda")


def co_color(name):
    return {"NVIDIA": "#76b900", "Intel": "#0071c5", "AMD": "#ed1c24"}.get(name, "#76b900")


def load_seen():
    if CACHE_FILE.exists():
        try:
            data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            return set(data.get("seen_ids", []))
        except Exception as e:
            print(f"cache load failed: {e}", file=sys.stderr)
    return set()


def save_seen(ids):
    CACHE_FILE.write_text(
        json.dumps(
            {"seen_ids": ids[:3000],
             "updated": datetime.now(timezone.utc).isoformat()},
            ensure_ascii=False, indent=2),
        encoding="utf-8")


def fetch_news(seen):
    items = []
    for c in COMPANIES:
        for source, url in c["feeds"]:
            try:
                feed = feedparser.parse(
                    url, request_headers={"User-Agent": USER_AGENT})
                count = 0
                for entry in feed.entries[:30]:
                    title = (entry.get("title") or "").strip()
                    if not title:
                        continue
                    link = entry.get("link") or ""
                    published = entry.get("published") or entry.get("updated") or ""
                    summary = re.sub(r"<[^>]+>", " ", entry.get("summary", "") or "")
                    summary = re.sub(r"\s+", " ", summary).strip()
                    if len(summary) > 280:
                        summary = summary[:280] + "..."
                    item_id = (entry.get("id") or entry.get("guid")
                               or link or f"{source}::{title}")
                    items.append({
                        "primary_company": c["name"],
                        "source": source,
                        "title": title,
                        "link": link,
                        "published": published,
                        "summary": summary,
                        "id": item_id,
                        "is_new": item_id not in seen,
                    })
                    count += 1
                print(f"[{source}] {count} items", file=sys.stderr)
            except Exception as e:
                print(f"[{source}] error: {e}", file=sys.stderr)
    return items


def dedupe(items):
    seen_titles = set()
    out = []
    for it in items:
        key = it["title"].lower()
        if key and key not in seen_titles:
            seen_titles.add(key)
            out.append(it)
    return out


def parse_date(s):
    if not s:
        return datetime(1900, 1, 1, tzinfo=timezone.utc)
    for fmt in ("%a, %d %b %Y %H:%M:%S %Z",
                "%a, %d %b %Y %H:%M:%S %z",
                "%Y-%m-%dT%H:%M:%S%z",
                "%Y-%m-%dT%H:%M:%SZ",
                "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            continue
    return datetime(1900, 1, 1, tzinfo=timezone.utc)


def detect_investments(items):
    """Returns {company_name: [signals]}."""
    out = {c["name"]: [] for c in COMPANIES}
    seen_targets = {c["name"]: set() for c in COMPANIES}
    for it in items:
        text = f"{it['title']}. {it['summary']}"
        for c in COMPANIES:
            for pat in c["patterns"]:
                for m in re.finditer(pat, text, re.IGNORECASE):
                    target = m.group(1).strip(" .,;:!?")
                    if not (2 <= len(target) <= 60):
                        continue
                    if target.lower() in STOP_WORDS:
                        continue
                    # Skip if the "target" is just the parent company name itself
                    if c["self_regex"].fullmatch(target):
                        continue
                    key = target.lower()
                    if key in seen_targets[c["name"]]:
                        continue
                    seen_targets[c["name"]].add(key)
                    out[c["name"]].append({
                        "target": target,
                        "title": it["title"],
                        "link": it["link"],
                        "source": it["source"],
                        "date": it["published"],
                        "is_new": it["is_new"],
                    })
    return out


def fetch_sec_for(cik):
    try:
        url = f"https://data.sec.gov/submissions/CIK{cik}.json"
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
        r.raise_for_status()
        data = r.json()
        recent = data["filings"]["recent"]
        cik_int = int(cik)
        descriptions = recent.get("primaryDocDescription", [])
        filings = []
        for i in range(min(40, len(recent["form"]))):
            form = recent["form"][i]
            if not re.match(r"^(8-K|10-Q|10-K|SC 13[GD]|13F)", form):
                continue
            acc = recent["accessionNumber"][i].replace("-", "")
            doc = recent["primaryDocument"][i]
            file_url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc}/{doc}"
            desc = descriptions[i] if i < len(descriptions) else ""
            filings.append({
                "form": form,
                "date": recent["filingDate"][i],
                "url": file_url,
                "description": desc,
            })
        return filings[:10]
    except Exception as e:
        print(f"SEC error for CIK {cik}: {e}", file=sys.stderr)
        return []


def fetch_sec_all():
    out = {}
    for c in COMPANIES:
        filings = fetch_sec_for(c["cik"])
        out[c["name"]] = filings
        print(f"SEC {c['name']}: {len(filings)} filings", file=sys.stderr)
    return out


TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="900">
<title>芯片三巨头 · 投资追踪 · {{NOW}}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#050810;--bg2:#0b0f1e;--border:rgba(255,255,255,.07);--border2:rgba(255,255,255,.15);--text:#e8edf5;--text2:#8a9ab8;--text3:#4a5a78;--green:#00e5a0;--blue:#4da6ff;--amber:#f5a623;--fire:#ff4d00;--purple:#a78bfa;--nvda:#76b900;--intc:#0071c5;--amd:#ed1c24}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Syne',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(77,166,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(77,166,255,.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}
.wrap{max-width:1200px;margin:0 auto;padding:40px 20px 60px;position:relative;z-index:1}
.hero{margin-bottom:36px}
.hero-eyebrow{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--blue);margin-bottom:12px;opacity:.8}
.hero-title{font-size:clamp(28px,5vw,46px);font-weight:800;line-height:1.05;background:linear-gradient(135deg,#fff 0%,#9dd923 33%,#4da6ff 66%,#ff6b6b 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-1px;margin-bottom:8px}
.hero-sub{font-size:14px;color:var(--text2)}
.hero-time{display:inline-block;margin-top:10px;font-family:'Space Mono',monospace;font-size:11px;color:var(--text3);border:1px solid var(--border2);padding:4px 14px;border-radius:20px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:36px}
.stat{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:18px 20px;text-align:center}
.stat-label{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:8px}
.stat-val{font-size:24px;font-weight:700}
.stat-val.green{color:var(--green)}.stat-val.blue{color:var(--blue)}.stat-val.amber{color:var(--amber)}
.stat-val.nvda{color:#9dd923}.stat-val.intc{color:#4da6ff}.stat-val.amd{color:#ff6b6b}
.section-label{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:var(--text3);margin:32px 0 14px;display:flex;align-items:center;gap:10px}
.section-label::after{content:'';flex:1;height:1px;background:var(--border)}
.co-section{margin-bottom:32px}
.co-header{display:flex;align-items:center;gap:12px;font-size:18px;font-weight:700;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border)}
.co-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;box-shadow:0 0 8px currentColor}
.co-name{flex:1}
.co-count{font-family:'Space Mono',monospace;font-size:12px;color:var(--text3);font-weight:400}
.co-badge{font-family:'Space Mono',monospace;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;letter-spacing:.5px;text-transform:uppercase;display:inline-block}
.cb-nvda{background:rgba(118,185,0,.15);color:#9dd923;border:1px solid rgba(118,185,0,.3)}
.cb-intc{background:rgba(0,113,197,.18);color:#5db1ff;border:1px solid rgba(0,113,197,.4)}
.cb-amd{background:rgba(237,28,36,.15);color:#ff6b6b;border:1px solid rgba(237,28,36,.3)}
.signal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.signal-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:18px;transition:border-color .2s}
.signal-card:hover{border-color:var(--border2)}
.signal-new{border-color:rgba(0,229,160,.4);background:linear-gradient(135deg,var(--bg2) 0%,rgba(0,229,160,.05) 100%)}
.signal-target{font-size:18px;font-weight:700;color:var(--fire);margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.signal-title{font-size:13px;margin-bottom:6px;line-height:1.4}
.signal-title a{color:var(--text);text-decoration:none}
.signal-title a:hover{color:var(--blue)}
.signal-meta{font-size:11px;color:var(--text3);font-family:'Space Mono',monospace}
.sec-grid{display:flex;flex-direction:column;gap:8px}
.sec-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;display:grid;grid-template-columns:80px 95px 1fr;gap:14px;align-items:center;text-decoration:none;color:var(--text);transition:border-color .2s}
.sec-card:hover{border-color:var(--border2)}
.sec-form{font-family:'Space Mono',monospace;font-size:12px;font-weight:700;padding:3px 8px;border-radius:4px;text-align:center}
.sec-8k{background:rgba(255,77,0,.15);color:var(--fire)}
.sec-10{background:rgba(77,166,255,.1);color:var(--blue)}
.sec-13{background:rgba(0,229,160,.15);color:var(--green)}
.sec-13f{background:rgba(167,139,250,.15);color:var(--purple)}
.sec-default{background:rgba(255,255,255,.06);color:var(--text2)}
.sec-date{font-family:'Space Mono',monospace;font-size:12px;color:var(--text3)}
.sec-desc{font-size:13px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.news-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px}
.news-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:18px;transition:border-color .2s}
.news-card:hover{border-color:var(--border2)}
.news-new{border-color:rgba(77,166,255,.3)}
.news-source{font-family:'Space Mono',monospace;font-size:10px;color:var(--blue);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.news-source-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.news-title{display:block;font-size:14px;font-weight:600;color:var(--text);text-decoration:none;line-height:1.4;margin-bottom:8px}
.news-title:hover{color:var(--blue)}
.news-summary{font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:8px}
.news-date{font-family:'Space Mono',monospace;font-size:10px;color:var(--text3)}
.badge{font-size:9px;padding:2px 7px;border-radius:20px;font-weight:700;letter-spacing:.5px}
.badge-new{background:var(--green);color:#000}
.empty{padding:24px;text-align:center;color:var(--text3);background:var(--bg2);border:1px dashed var(--border2);border-radius:12px;font-size:13px}
.footer{text-align:center;font-size:11px;color:var(--text3);line-height:1.8;padding-top:24px;margin-top:40px;border-top:1px solid var(--border)}
.filter-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.filter-btn{font-family:'Space Mono',monospace;font-size:11px;font-weight:700;padding:6px 14px;border-radius:20px;border:1px solid var(--border2);background:var(--bg2);color:var(--text2);cursor:pointer;transition:all .2s}
.filter-btn:hover{color:var(--text)}
.filter-btn.active{background:var(--text);color:var(--bg);border-color:var(--text)}
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div class="hero-eyebrow">Chip Tracker · NVIDIA · Intel · AMD</div>
    <h1 class="hero-title">芯片三巨头 · 投资追踪</h1>
    <p class="hero-sub">新闻 · 投资信号 · SEC 文件 · 自动每 2 小时更新</p>
    <span class="hero-time" id="time-badge">最近更新：{{NOW}}</span>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-label">总新闻</div><div class="stat-val blue">{{TOTAL}}</div></div>
    <div class="stat"><div class="stat-label">本次新增</div><div class="stat-val green">{{NEW}}</div></div>
    <div class="stat"><div class="stat-label">NVIDIA 信号</div><div class="stat-val nvda">{{SIG_NVDA}}</div></div>
    <div class="stat"><div class="stat-label">INTEL 信号</div><div class="stat-val intc">{{SIG_INTC}}</div></div>
    <div class="stat"><div class="stat-label">AMD 信号</div><div class="stat-val amd">{{SIG_AMD}}</div></div>
    <div class="stat"><div class="stat-label">SEC 文件</div><div class="stat-val amber">{{SEC_TOTAL}}</div></div>
  </div>

  <div class="section-label">🔥 投资 / 收购 / 合作信号</div>
  {{INV_SECTIONS}}

  <div class="section-label">📋 SEC 官方文件</div>
  {{SEC_SECTIONS}}

  <div class="section-label">📰 全部新闻（最新 80 条）</div>
  <div class="filter-bar">
    <button class="filter-btn active" data-filter="all">全部</button>
    <button class="filter-btn" data-filter="NVIDIA">NVIDIA</button>
    <button class="filter-btn" data-filter="Intel">Intel</button>
    <button class="filter-btn" data-filter="AMD">AMD</button>
  </div>
  <div class="news-grid" id="news-grid">{{NEWS_HTML}}</div>

  <div class="footer">
    数据源：Google News · Yahoo Finance · NVIDIA Blog · SEC EDGAR<br>
    追踪：NVIDIA (CIK 0001045810) · Intel (CIK 0000050863) · AMD (CIK 0000002488)<br>
    由 GitHub Actions 自动构建 · 不构成投资建议
  </div>
</div>
<script>
const badge = document.getElementById('time-badge');
const utc = '{{NOW_ISO}}';
if (utc) {
  try {
    const d = new Date(utc);
    const local = d.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
    badge.textContent = '最近更新：' + local + '（你本地时间）';
  } catch (e) {}
}
const buttons = document.querySelectorAll('.filter-btn');
const cards = document.querySelectorAll('#news-grid .news-card');
buttons.forEach(btn => btn.addEventListener('click', () => {
  buttons.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const f = btn.dataset.filter;
  cards.forEach(c => {
    c.style.display = (f === 'all' || c.dataset.company === f) ? '' : 'none';
  });
}));
</script>
</body>
</html>
"""


def render_investment_sections(investments_by_co):
    out = []
    for c in COMPANIES:
        signals = investments_by_co.get(c["name"], [])
        cards = []
        for inv in signals:
            new_badge = '<span class="badge badge-new">NEW</span>' if inv["is_new"] else ""
            new_cls = "signal-new" if inv["is_new"] else ""
            cards.append(f"""
    <div class="signal-card {new_cls}">
      <div class="signal-target">{escape(inv['target'])} {new_badge}</div>
      <div class="signal-title"><a href="{escape(inv['link'])}" target="_blank" rel="noopener">{escape(inv['title'])}</a></div>
      <div class="signal-meta">{escape(inv['source'])} · {escape(inv['date'])}</div>
    </div>""")
        cards_html = "".join(cards) or '<div class="empty">本次未检测到该公司的投资信号。</div>'
        out.append(f"""
  <div class="co-section">
    <div class="co-header" style="color:{co_color(c['name'])}">
      <span class="co-dot" style="background:{co_color(c['name'])}"></span>
      <span class="co-name">{escape(c['name'])}</span>
      <span class="co-count">{len(signals)} 个信号</span>
    </div>
    <div class="signal-grid">{cards_html}</div>
  </div>""")
    return "".join(out)


def render_sec_sections(sec_by_co):
    out = []
    for c in COMPANIES:
        filings = sec_by_co.get(c["name"], [])
        rows = []
        for f in filings:
            cls = "sec-default"
            if f["form"].startswith("8-K"):
                cls = "sec-8k"
            elif f["form"].startswith("10-"):
                cls = "sec-10"
            elif f["form"].startswith("SC 13"):
                cls = "sec-13"
            elif f["form"].startswith("13F"):
                cls = "sec-13f"
            rows.append(f"""
    <a href="{escape(f['url'])}" target="_blank" rel="noopener" class="sec-card">
      <span class="sec-form {cls}">{escape(f['form'])}</span>
      <span class="sec-date">{escape(f['date'])}</span>
      <span class="sec-desc">{escape(f.get('description') or '')}</span>
    </a>""")
        rows_html = "".join(rows) or '<div class="empty">无新文件。</div>'
        out.append(f"""
  <div class="co-section">
    <div class="co-header" style="color:{co_color(c['name'])}">
      <span class="co-dot" style="background:{co_color(c['name'])}"></span>
      <span class="co-name">{escape(c['name'])}</span>
      <span class="co-count">CIK {escape(c['cik'])} · {len(filings)} 份</span>
    </div>
    <div class="sec-grid">{rows_html}</div>
  </div>""")
    return "".join(out)


def render_html(news, investments_by_co, sec_by_co):
    new_count = sum(1 for n in news if n["is_new"])
    now_utc = datetime.now(timezone.utc)
    now_str = now_utc.strftime("%Y-%m-%d %H:%M UTC")
    now_iso = now_utc.isoformat()

    inv_sections = render_investment_sections(investments_by_co)
    sec_sections = render_sec_sections(sec_by_co)
    sec_total = sum(len(v) for v in sec_by_co.values())

    news_html_parts = []
    for it in news[:80]:
        new_badge = '<span class="badge badge-new">NEW</span>' if it["is_new"] else ""
        new_cls = "news-new" if it["is_new"] else ""
        co_cls = co_badge_class(it["primary_company"])
        news_html_parts.append(f"""
    <div class="news-card {new_cls}" data-company="{escape(it['primary_company'])}">
      <div class="news-source">
        <div class="news-source-left">
          <span class="co-badge {co_cls}">{escape(it['primary_company'])}</span>
          <span>{escape(it['source'])}</span>
        </div>
        {new_badge}
      </div>
      <a class="news-title" href="{escape(it['link'])}" target="_blank" rel="noopener">{escape(it['title'])}</a>
      <div class="news-summary">{escape(it['summary'])}</div>
      <div class="news-date">{escape(it['published'])}</div>
    </div>""")
    news_html = "".join(news_html_parts) or '<div class="empty">未抓取到新闻。</div>'

    replacements = {
        "{{NOW}}": now_str,
        "{{NOW_ISO}}": now_iso,
        "{{TOTAL}}": str(len(news)),
        "{{NEW}}": str(new_count),
        "{{SIG_NVDA}}": str(len(investments_by_co.get("NVIDIA", []))),
        "{{SIG_INTC}}": str(len(investments_by_co.get("Intel", []))),
        "{{SIG_AMD}}": str(len(investments_by_co.get("AMD", []))),
        "{{SEC_TOTAL}}": str(sec_total),
        "{{INV_SECTIONS}}": inv_sections,
        "{{SEC_SECTIONS}}": sec_sections,
        "{{NEWS_HTML}}": news_html,
    }
    out = TEMPLATE
    for k, v in replacements.items():
        out = out.replace(k, v)
    return out


def main():
    seen = load_seen()
    print(f"loaded {len(seen)} seen ids", file=sys.stderr)

    news = fetch_news(seen)
    news = dedupe(news)
    news.sort(key=lambda x: parse_date(x["published"]), reverse=True)
    print(f"unique items: {len(news)}", file=sys.stderr)

    investments_by_co = detect_investments(news)
    for co, sigs in investments_by_co.items():
        print(f"signals[{co}]: {len(sigs)}", file=sys.stderr)

    sec_by_co = fetch_sec_all()

    html = render_html(news, investments_by_co, sec_by_co)
    OUTPUT_FILE.write_text(html, encoding="utf-8")
    print(f"wrote {OUTPUT_FILE} ({len(html):,} bytes)", file=sys.stderr)

    all_ids = [n["id"] for n in news] + list(seen)
    unique_ids = list(dict.fromkeys(all_ids))
    save_seen(unique_ids)
    print(f"saved {len(unique_ids)} seen ids", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
