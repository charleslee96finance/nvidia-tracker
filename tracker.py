#!/usr/bin/env python3
"""NVIDIA Daily Tracker — generates index.html from RSS feeds + SEC EDGAR.

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

import feedparser
import requests

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
OUTPUT_FILE = ROOT / "index.html"
CACHE_FILE = DATA_DIR / "cache.json"
DATA_DIR.mkdir(exist_ok=True)

USER_AGENT = "NVIDIA Tracker (github.com/nvidia-tracker)"

FEEDS = [
    ("Google News (NVIDIA)",
     "https://news.google.com/rss/search?q=NVIDIA+OR+%22Jensen+Huang%22&hl=en-US&gl=US&ceid=US:en"),
    ("Google News (Investments)",
     "https://news.google.com/rss/search?q=NVIDIA+(invests+OR+acquires+OR+stake+OR+backs+OR+partnership)&hl=en-US&gl=US&ceid=US:en"),
    ("Yahoo Finance NVDA",
     "https://feeds.finance.yahoo.com/rss/2.0/headline?s=NVDA&region=US&lang=en-US"),
    ("NVIDIA Blog",
     "https://blogs.nvidia.com/feed/"),
]

SEC_CIK = "0001045810"
SEC_URL = f"https://data.sec.gov/submissions/CIK{SEC_CIK}.json"

INVEST_PATTERNS = [
    r"NVIDIA\s+(?:invests?|invested|to invest|investing)\s+(?:[\$\d.,]+\s*(?:billion|million|B|M)?\s*(?:in|into)\s+)?([A-Z][\w\s&.\-]+?)(?=[\s.,;:!?]|$)",
    r"NVIDIA\s+(?:acquires?|acquired|to acquire|acquiring)\s+([A-Z][\w\s&.\-]+?)(?=[\s.,;:!?]|$)",
    r"NVIDIA\s+(?:takes?|took|taking)\s+(?:a\s+)?(?:[\$\d.,]+\s*(?:billion|million|B|M)?\s*)?stake\s+in\s+([A-Z][\w\s&.\-]+?)(?=[\s.,;:!?]|$)",
    r"NVIDIA\s+(?:backs?|backed|backing|leads?|led|leading)\s+([A-Z][\w\s&.\-]+?)\s+(?:funding|round|Series|investment)",
    r"NVIDIA\s+(?:partners?|partnered|partnering)\s+with\s+([A-Z][\w\s&.\-]+?)(?=[\s.,;:!?]|$)",
]

STOP_WORDS = {"the", "a", "an", "this", "that", "its", "their",
              "our", "your", "and", "or", "but", "new", "more"}


def load_seen() -> set[str]:
    if CACHE_FILE.exists():
        try:
            data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            return set(data.get("seen_ids", []))
        except Exception as e:
            print(f"cache load failed: {e}", file=sys.stderr)
    return set()


def save_seen(ids: list[str]) -> None:
    CACHE_FILE.write_text(
        json.dumps(
            {"seen_ids": ids[:2000],
             "updated": datetime.now(timezone.utc).isoformat()},
            ensure_ascii=False, indent=2),
        encoding="utf-8")


def fetch_news(seen: set[str]) -> list[dict]:
    items = []
    for source, url in FEEDS:
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


def dedupe(items: list[dict]) -> list[dict]:
    seen_titles = set()
    out = []
    for it in items:
        key = it["title"].lower()
        if key and key not in seen_titles:
            seen_titles.add(key)
            out.append(it)
    return out


def parse_date(s: str) -> datetime:
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


def detect_investments(items: list[dict]) -> list[dict]:
    investments = []
    seen_targets = set()
    for it in items:
        text = f"{it['title']}. {it['summary']}"
        for pat in INVEST_PATTERNS:
            for m in re.finditer(pat, text, re.IGNORECASE):
                target = m.group(1).strip(" .,;:!?")
                if not (2 <= len(target) <= 60):
                    continue
                if target.lower() in STOP_WORDS:
                    continue
                key = target.lower()
                if key in seen_targets:
                    continue
                seen_targets.add(key)
                investments.append({
                    "target": target,
                    "title": it["title"],
                    "link": it["link"],
                    "source": it["source"],
                    "date": it["published"],
                    "is_new": it["is_new"],
                })
    return investments


def fetch_sec() -> list[dict]:
    try:
        r = requests.get(SEC_URL,
                         headers={"User-Agent": USER_AGENT},
                         timeout=20)
        r.raise_for_status()
        data = r.json()
        recent = data["filings"]["recent"]
        cik_int = int(SEC_CIK)
        descriptions = recent.get("primaryDocDescription", [])
        filings = []
        for i in range(min(40, len(recent["form"]))):
            form = recent["form"][i]
            if not re.match(r"^(8-K|10-Q|10-K|SC 13[GD]|13F)", form):
                continue
            acc = recent["accessionNumber"][i].replace("-", "")
            doc = recent["primaryDocument"][i]
            url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc}/{doc}"
            desc = descriptions[i] if i < len(descriptions) else ""
            filings.append({
                "form": form,
                "date": recent["filingDate"][i],
                "url": url,
                "description": desc,
            })
        print(f"SEC: {len(filings)} filings", file=sys.stderr)
        return filings[:15]
    except Exception as e:
        print(f"SEC error: {e}", file=sys.stderr)
        return []


TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="900">
<title>NVIDIA 每日追踪 · {{NOW}}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#050810;--bg2:#0b0f1e;--border:rgba(255,255,255,.07);--border2:rgba(255,255,255,.15);--text:#e8edf5;--text2:#8a9ab8;--text3:#4a5a78;--green:#00e5a0;--blue:#4da6ff;--amber:#f5a623;--fire:#ff4d00;--purple:#a78bfa}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Syne',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(77,166,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(77,166,255,.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}
.wrap{max-width:1200px;margin:0 auto;padding:40px 20px 60px;position:relative;z-index:1}
.hero{margin-bottom:36px}
.hero-eyebrow{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--blue);margin-bottom:12px;opacity:.8}
.hero-title{font-size:clamp(32px,5vw,48px);font-weight:800;line-height:1.05;background:linear-gradient(135deg,#fff 0%,#4da6ff 50%,#00e5a0 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-1px;margin-bottom:8px}
.hero-sub{font-size:14px;color:var(--text2)}
.hero-time{display:inline-block;margin-top:10px;font-family:'Space Mono',monospace;font-size:11px;color:var(--text3);border:1px solid var(--border2);padding:4px 14px;border-radius:20px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:36px}
.stat{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:18px 20px;text-align:center}
.stat-label{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:8px}
.stat-val{font-size:24px;font-weight:700}
.stat-val.green{color:var(--green)}.stat-val.blue{color:var(--blue)}.stat-val.amber{color:var(--amber)}.stat-val.fire{color:var(--fire)}
.section-label{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:var(--text3);margin:32px 0 14px;display:flex;align-items:center;gap:10px}
.section-label::after{content:'';flex:1;height:1px;background:var(--border)}
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
.sec-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;display:grid;grid-template-columns:90px 100px 1fr;gap:14px;align-items:center;text-decoration:none;color:var(--text);transition:border-color .2s}
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
.news-source{font-family:'Space Mono',monospace;font-size:10px;color:var(--blue);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
.news-title{display:block;font-size:14px;font-weight:600;color:var(--text);text-decoration:none;line-height:1.4;margin-bottom:8px}
.news-title:hover{color:var(--blue)}
.news-summary{font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:8px}
.news-date{font-family:'Space Mono',monospace;font-size:10px;color:var(--text3)}
.badge{font-size:9px;padding:2px 7px;border-radius:20px;font-weight:700;letter-spacing:.5px}
.badge-new{background:var(--green);color:#000}
.empty{padding:40px;text-align:center;color:var(--text3);background:var(--bg2);border:1px dashed var(--border2);border-radius:12px}
.footer{text-align:center;font-size:11px;color:var(--text3);line-height:1.8;padding-top:24px;margin-top:40px;border-top:1px solid var(--border)}
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div class="hero-eyebrow">Daily Tracker · Auto-Updated</div>
    <h1 class="hero-title">NVIDIA 每日追踪</h1>
    <p class="hero-sub">新闻 · 投资信号 · SEC 文件 · 自动每 2 小时更新</p>
    <span class="hero-time" id="time-badge">最近更新：{{NOW}}</span>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-label">总新闻</div><div class="stat-val blue">{{TOTAL}}</div></div>
    <div class="stat"><div class="stat-label">本次新增</div><div class="stat-val green">{{NEW}}</div></div>
    <div class="stat"><div class="stat-label">投资信号</div><div class="stat-val fire">{{SIGNALS}}</div></div>
    <div class="stat"><div class="stat-label">SEC 文件</div><div class="stat-val amber">{{SEC}}</div></div>
  </div>
  <div class="section-label">🔥 投资 / 收购 / 合作信号</div>
  <div class="signal-grid">{{INV_HTML}}</div>
  <div class="section-label">📋 SEC 官方文件（NVIDIA Corp · CIK {{CIK}}）</div>
  <div class="sec-grid">{{SEC_HTML}}</div>
  <div class="section-label">📰 全部新闻（最新 80 条）</div>
  <div class="news-grid">{{NEWS_HTML}}</div>
  <div class="footer">
    数据源：Google News · Yahoo Finance · NVIDIA Blog · SEC EDGAR<br>
    由 GitHub Actions 自动构建 · 不构成投资建议
  </div>
</div>
<script>
// Convert UTC timestamp to viewer's local time
const badge = document.getElementById('time-badge');
const utc = '{{NOW_ISO}}';
if (utc) {
  try {
    const d = new Date(utc);
    const local = d.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
    badge.textContent = '最近更新：' + local + '（你本地时间）';
  } catch (e) {}
}
</script>
</body>
</html>
"""


def render_html(news: list[dict], investments: list[dict],
                sec_filings: list[dict]) -> str:
    new_count = sum(1 for n in news if n["is_new"])
    now_utc = datetime.now(timezone.utc)
    now_str = now_utc.strftime("%Y-%m-%d %H:%M UTC")
    now_iso = now_utc.isoformat()

    inv_html_parts = []
    for inv in investments:
        badge = '<span class="badge badge-new">NEW</span>' if inv["is_new"] else ""
        new_cls = "signal-new" if inv["is_new"] else ""
        inv_html_parts.append(f"""
    <div class="signal-card {new_cls}">
      <div class="signal-target">{escape(inv['target'])} {badge}</div>
      <div class="signal-title"><a href="{escape(inv['link'])}" target="_blank" rel="noopener">{escape(inv['title'])}</a></div>
      <div class="signal-meta">{escape(inv['source'])} · {escape(inv['date'])}</div>
    </div>""")
    inv_html = "".join(inv_html_parts) or '<div class="empty">本次未检测到新的投资 / 收购信号。</div>'

    sec_html_parts = []
    for f in sec_filings:
        cls = "sec-default"
        if f["form"].startswith("8-K"):
            cls = "sec-8k"
        elif f["form"].startswith("10-"):
            cls = "sec-10"
        elif f["form"].startswith("SC 13"):
            cls = "sec-13"
        elif f["form"].startswith("13F"):
            cls = "sec-13f"
        sec_html_parts.append(f"""
    <a href="{escape(f['url'])}" target="_blank" rel="noopener" class="sec-card">
      <span class="sec-form {cls}">{escape(f['form'])}</span>
      <span class="sec-date">{escape(f['date'])}</span>
      <span class="sec-desc">{escape(f['description'] or '')}</span>
    </a>""")
    sec_html = "".join(sec_html_parts) or '<div class="empty">无新文件。</div>'

    news_html_parts = []
    for it in news[:80]:
        badge = '<span class="badge badge-new">NEW</span>' if it["is_new"] else ""
        new_cls = "news-new" if it["is_new"] else ""
        news_html_parts.append(f"""
    <div class="news-card {new_cls}">
      <div class="news-source">{escape(it['source'])} {badge}</div>
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
        "{{SIGNALS}}": str(len(investments)),
        "{{SEC}}": str(len(sec_filings)),
        "{{INV_HTML}}": inv_html,
        "{{SEC_HTML}}": sec_html,
        "{{NEWS_HTML}}": news_html,
        "{{CIK}}": SEC_CIK,
    }
    out = TEMPLATE
    for k, v in replacements.items():
        out = out.replace(k, v)
    return out


def main() -> int:
    seen = load_seen()
    print(f"loaded {len(seen)} seen ids", file=sys.stderr)

    news = fetch_news(seen)
    news = dedupe(news)
    news.sort(key=lambda x: parse_date(x["published"]), reverse=True)
    print(f"unique items: {len(news)}", file=sys.stderr)

    investments = detect_investments(news)
    print(f"investment signals: {len(investments)}", file=sys.stderr)

    sec_filings = fetch_sec()

    html = render_html(news, investments, sec_filings)
    OUTPUT_FILE.write_text(html, encoding="utf-8")
    print(f"wrote {OUTPUT_FILE} ({len(html):,} bytes)", file=sys.stderr)

    all_ids = [n["id"] for n in news] + list(seen)
    unique_ids = list(dict.fromkeys(all_ids))
    save_seen(unique_ids)
    print(f"saved {len(unique_ids)} seen ids", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
