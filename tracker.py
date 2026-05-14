#!/usr/bin/env python3
"""US Mega-Cap Tracker — Mag 7 + chip industry (NVIDIA, Intel, AMD, Apple, MSFT, GOOGL, AMZN, META, TSLA).

Runs on GitHub Actions. Outputs:
  - index.html  (served by GitHub Pages)
  - data/cache.json  (tracks seen item IDs across runs for the NEW badge)
"""

import concurrent.futures as cf
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

USER_AGENT = "US Mega Tracker contact@local.dev"
BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
              "AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/120.0.0.0 Safari/537.36")

# --- Company config ---------------------------------------------------------
COMPANIES = [
    # --- Chip industry ---
    {
        "name": "NVIDIA", "ticker": "NVDA", "category": "chip",
        "color": "#76b900", "cik": "0001045810",
        "blog_url": "https://blogs.nvidia.com/feed/",
        "search_terms": 'NVIDIA OR "Jensen Huang"',
        "invest_search": "NVIDIA (invests OR acquires OR stake OR backs OR partnership)",
        "name_regex": r"NVIDIA",
    },
    {
        "name": "Intel", "ticker": "INTC", "category": "chip",
        "color": "#0071c5", "cik": "0000050863",
        "blog_url": None,
        "search_terms": '"Intel Corp" OR "Lip-Bu Tan" OR "Intel chip"',
        "invest_search": "Intel (invests OR acquires OR stake OR backs OR partnership)",
        "name_regex": r"Intel(?:\s+Corp(?:oration)?)?",
    },
    {
        "name": "AMD", "ticker": "AMD", "category": "chip",
        "color": "#ed1c24", "cik": "0000002488",
        "blog_url": None,
        "search_terms": '"AMD" OR "Lisa Su" OR "Advanced Micro Devices"',
        "invest_search": "AMD (invests OR acquires OR stake OR backs OR partnership)",
        "name_regex": r"AMD|Advanced\s+Micro\s+Devices",
    },
    # --- Magnificent 7 (excluding NVIDIA, already above) ---
    {
        "name": "Apple", "ticker": "AAPL", "category": "mag7",
        "color": "#c9cfd6", "cik": "0000320193",
        "blog_url": None,
        "search_terms": '"Apple Inc" OR AAPL OR "Tim Cook"',
        "invest_search": '"Apple Inc" (invests OR acquires OR stake OR backs)',
        "name_regex": r"Apple(?:\s+Inc)?",
    },
    {
        "name": "Microsoft", "ticker": "MSFT", "category": "mag7",
        "color": "#5db1ff", "cik": "0000789019",
        "blog_url": None,
        "search_terms": 'Microsoft OR "Satya Nadella" OR MSFT',
        "invest_search": "Microsoft (invests OR acquires OR stake OR backs OR partnership)",
        "name_regex": r"Microsoft",
    },
    {
        "name": "Alphabet", "ticker": "GOOGL", "category": "mag7",
        "color": "#fbbc04", "cik": "0001652044",
        "blog_url": None,
        "search_terms": 'Alphabet OR "Sundar Pichai" OR "Google parent"',
        "invest_search": "(Alphabet OR Google) (invests OR acquires OR stake OR backs)",
        "name_regex": r"Alphabet|Google",
    },
    {
        "name": "Amazon", "ticker": "AMZN", "category": "mag7",
        "color": "#ff9900", "cik": "0001018724",
        "blog_url": None,
        "search_terms": '"Amazon.com" OR "Andy Jassy" OR AMZN',
        "invest_search": "Amazon (invests OR acquires OR stake OR backs OR partnership)",
        "name_regex": r"Amazon(?:\.com)?",
    },
    {
        "name": "Meta", "ticker": "META", "category": "mag7",
        "color": "#7c5cff", "cik": "0001326801",
        "blog_url": None,
        "search_terms": '"Meta Platforms" OR "Mark Zuckerberg" OR "Meta AI"',
        "invest_search": "Meta (invests OR acquires OR stake OR backs OR partnership)",
        "name_regex": r"Meta(?:\s+Platforms)?|Facebook",
    },
    {
        "name": "Tesla", "ticker": "TSLA", "category": "mag7",
        "color": "#ff6b6b", "cik": "0001318605",
        "blog_url": None,
        "search_terms": 'Tesla OR "Elon Musk" OR TSLA',
        "invest_search": "Tesla (invests OR acquires OR stake OR backs OR partnership)",
        "name_regex": r"Tesla(?:\s+Inc)?",
    },
]

# --- Curated database of each company's public investments / acquisitions ---
# kind: 收购 acq · 战略 strat · 私募 vc · 投资 inv · 子公司 sub · 合作 coll
KNOWN_INVESTMENTS = {
    "NVIDIA": [
        # Strategic equity / public companies
        {"name": "Intel",              "ticker": "INTC", "kind": "战略", "desc": "$50 亿战略股权",         "date": "2025-09"},
        {"name": "CoreWeave",          "ticker": "CRWV", "kind": "战略", "desc": "IPO 前持股 ~$44 亿",      "date": "2024"},
        {"name": "Nebius Group",       "ticker": "NBIS", "kind": "战略", "desc": "$20 亿追加",              "date": "2026-03"},
        {"name": "Coherent",           "ticker": "COHR", "kind": "战略", "desc": "$20 亿（光电组件）",       "date": "2026-03"},
        {"name": "Marvell Technology", "ticker": "MRVL", "kind": "战略", "desc": "$20 亿（定制 AI 芯片）",    "date": "2026-03"},
        {"name": "Nokia",              "ticker": "NOK",  "kind": "战略", "desc": "$10 亿（5G / AI-RAN）",     "date": "2025-10"},
        {"name": "Synopsys",           "ticker": "SNPS", "kind": "战略", "desc": "$20 亿（EDA 软件）",       "date": "2025-12"},
        {"name": "Corning",            "ticker": "GLW",  "kind": "战略", "desc": "$5 亿（光纤权证）",        "date": "2026-05"},
        {"name": "Lumentum",           "ticker": "LITE", "kind": "战略", "desc": "$20 亿（激光器件）",       "date": "2026-03"},
        # Private investments / AI
        {"name": "OpenAI",             "ticker": None,   "kind": "私募", "desc": "最新 $300 亿",            "date": "2026"},
        {"name": "Anthropic",          "ticker": None,   "kind": "私募", "desc": "$100 亿",                 "date": "2025-11"},
        {"name": "xAI",                "ticker": None,   "kind": "私募", "desc": "两轮 $60B + $200B",       "date": "2025"},
        {"name": "Mistral AI",         "ticker": None,   "kind": "私募", "desc": "Series C 估值 €117 亿",   "date": "2025-09"},
        {"name": "Cursor",             "ticker": None,   "kind": "私募", "desc": "Series D 估值 $293 亿",   "date": "2025-11"},
        {"name": "Quantinuum",         "ticker": None,   "kind": "私募", "desc": "量子计算 估值 $100 亿",   "date": "2025"},
        {"name": "Figure AI",          "ticker": None,   "kind": "私募", "desc": "人形机器人",              "date": "2024"},
        {"name": "Wayve",              "ticker": None,   "kind": "私募", "desc": "自动驾驶 AI",              "date": "2024"},
    ],
    "Intel": [
        {"name": "Mobileye",            "ticker": "MBLY", "kind": "子公司", "desc": "持 88% 股权（自动驾驶）", "date": "2017 收购"},
        {"name": "Altera",              "ticker": None,   "kind": "子公司", "desc": "FPGA（2024 部分剥离）",   "date": "2015"},
        {"name": "Habana Labs",         "ticker": None,   "kind": "收购",   "desc": "$20 亿（AI 芯片）",       "date": "2019"},
        {"name": "Movidius",            "ticker": None,   "kind": "收购",   "desc": "视觉处理芯片",            "date": "2016"},
        {"name": "Granulate",           "ticker": None,   "kind": "收购",   "desc": "~$6.5 亿（性能优化）",    "date": "2022"},
        {"name": "Cnvrg.io",            "ticker": None,   "kind": "收购",   "desc": "MLOps 平台",              "date": "2020"},
        {"name": "Moovit",              "ticker": None,   "kind": "收购",   "desc": "$9 亿（出行 SaaS）",      "date": "2020"},
        {"name": "Astera Labs",         "ticker": "ALAB", "kind": "投资",   "desc": "早期投资（Intel Capital）","date": "2018"},
        {"name": "SambaNova Systems",   "ticker": None,   "kind": "投资",   "desc": "AI 芯片初创",             "date": "2020"},
    ],
    "AMD": [
        {"name": "Xilinx",         "ticker": None,   "kind": "收购", "desc": "$350 亿（FPGA）",            "date": "2022-02"},
        {"name": "Pensando",       "ticker": None,   "kind": "收购", "desc": "$19 亿（DPU）",              "date": "2022"},
        {"name": "ZT Systems",     "ticker": None,   "kind": "收购", "desc": "$49 亿（AI 服务器）",        "date": "2024-08"},
        {"name": "Silo AI",        "ticker": None,   "kind": "收购", "desc": "$6.65 亿（欧洲 AI 实验室）", "date": "2024-07"},
        {"name": "Nod.ai",         "ticker": None,   "kind": "收购", "desc": "开源 AI 编译器",             "date": "2023"},
        {"name": "Mipsology",      "ticker": None,   "kind": "收购", "desc": "FPGA AI 软件",               "date": "2023"},
        {"name": "Enosemi",        "ticker": None,   "kind": "收购", "desc": "AI 系统 / 光子",             "date": "2026"},
        {"name": "MK1",            "ticker": None,   "kind": "收购", "desc": "AI 推理优化",                "date": "2026"},
        {"name": "OpenAI",         "ticker": None,   "kind": "合作", "desc": "传 $200 亿算力合作",         "date": "2025"},
    ],
    "Apple": [
        {"name": "Beats Electronics",  "ticker": None, "kind": "收购", "desc": "$30 亿（音频）",        "date": "2014"},
        {"name": "Intel 5G 调制解调器", "ticker": None, "kind": "收购", "desc": "$10 亿",                "date": "2019"},
        {"name": "Shazam",             "ticker": None, "kind": "收购", "desc": "$4 亿（音乐识别）",     "date": "2018"},
        {"name": "AuthenTec",          "ticker": None, "kind": "收购", "desc": "$3.56 亿（指纹）",      "date": "2012"},
        {"name": "Xnor.ai",            "ticker": None, "kind": "收购", "desc": "$2 亿（边缘 AI）",      "date": "2020"},
        {"name": "NextVR",             "ticker": None, "kind": "收购", "desc": "$1 亿（VR 内容）",      "date": "2020"},
        {"name": "Drive.ai",           "ticker": None, "kind": "收购", "desc": "自动驾驶（人才收购）",  "date": "2019"},
        {"name": "Pixelmator",         "ticker": None, "kind": "收购", "desc": "图像编辑器",            "date": "2024-11"},
        {"name": "DarwinAI",           "ticker": None, "kind": "收购", "desc": "(机器学习压缩)",        "date": "2024"},
        {"name": "Vilynx",             "ticker": None, "kind": "收购", "desc": "$5000 万（视频 AI）",   "date": "2020"},
    ],
    "Microsoft": [
        {"name": "Activision Blizzard", "ticker": None, "kind": "收购", "desc": "$687 亿（游戏）",          "date": "2023"},
        {"name": "LinkedIn",            "ticker": None, "kind": "收购", "desc": "$262 亿（职场社交）",      "date": "2016"},
        {"name": "Nuance Communications","ticker": None,"kind": "收购", "desc": "$197 亿（语音 AI）",       "date": "2022"},
        {"name": "ZeniMax / Bethesda",  "ticker": None, "kind": "收购", "desc": "$75 亿（游戏）",           "date": "2021"},
        {"name": "GitHub",              "ticker": None, "kind": "收购", "desc": "$75 亿（代码托管）",       "date": "2018"},
        {"name": "Skype",               "ticker": None, "kind": "收购", "desc": "$85 亿",                   "date": "2011"},
        {"name": "Mojang / Minecraft",  "ticker": None, "kind": "收购", "desc": "$25 亿",                   "date": "2014"},
        {"name": "OpenAI",              "ticker": None, "kind": "投资", "desc": "$130 亿+ 战略投资",        "date": "2019-2024"},
        {"name": "Inflection AI",       "ticker": None, "kind": "投资", "desc": "$6.5 亿（人才 + license）","date": "2024"},
    ],
    "Alphabet": [
        {"name": "Wiz",                 "ticker": None, "kind": "收购", "desc": "$320 亿（云安全）",        "date": "2025"},
        {"name": "Mandiant",            "ticker": None, "kind": "收购", "desc": "$54 亿（网络安全）",       "date": "2022"},
        {"name": "Motorola Mobility",   "ticker": None, "kind": "收购", "desc": "$125 亿（后售予 Lenovo）", "date": "2012"},
        {"name": "Nest Labs",           "ticker": None, "kind": "收购", "desc": "$32 亿（智能家居）",       "date": "2014"},
        {"name": "Fitbit",              "ticker": None, "kind": "收购", "desc": "$21 亿（可穿戴）",         "date": "2021"},
        {"name": "Looker",              "ticker": None, "kind": "收购", "desc": "$26 亿（BI）",             "date": "2020"},
        {"name": "DoubleClick",         "ticker": None, "kind": "收购", "desc": "$31 亿（广告）",           "date": "2008"},
        {"name": "YouTube",             "ticker": None, "kind": "收购", "desc": "$16.5 亿",                 "date": "2006"},
        {"name": "DeepMind",            "ticker": None, "kind": "收购", "desc": "$5 亿（AI 研究）",         "date": "2014"},
        {"name": "Android",             "ticker": None, "kind": "收购", "desc": "$5000 万",                 "date": "2005"},
        {"name": "Anthropic",           "ticker": None, "kind": "投资", "desc": "$30 亿+ 战略投资",         "date": "2022-2024"},
        {"name": "Waymo",               "ticker": None, "kind": "子公司","desc": "自动驾驶子公司",          "date": "internal"},
    ],
    "Amazon": [
        {"name": "Whole Foods Market", "ticker": None,   "kind": "收购", "desc": "$137 亿（生鲜）",     "date": "2017"},
        {"name": "MGM Studios",        "ticker": None,   "kind": "收购", "desc": "$85 亿（影视）",      "date": "2022"},
        {"name": "One Medical",        "ticker": None,   "kind": "收购", "desc": "$39 亿（医疗）",      "date": "2023"},
        {"name": "Zoox",               "ticker": None,   "kind": "收购", "desc": "$12 亿（自动驾驶）",  "date": "2020"},
        {"name": "PillPack",           "ticker": None,   "kind": "收购", "desc": "$10 亿（在线药房）",  "date": "2018"},
        {"name": "Ring",               "ticker": None,   "kind": "收购", "desc": "$10 亿+（智能家居）", "date": "2018"},
        {"name": "Zappos",             "ticker": None,   "kind": "收购", "desc": "$12 亿（鞋类电商）",  "date": "2009"},
        {"name": "Twitch",             "ticker": None,   "kind": "收购", "desc": "$9.7 亿（游戏直播）", "date": "2014"},
        {"name": "Audible",            "ticker": None,   "kind": "收购", "desc": "$3 亿（有声书）",     "date": "2008"},
        {"name": "Anthropic",          "ticker": None,   "kind": "投资", "desc": "$80 亿 战略投资",     "date": "2023-2024"},
        {"name": "Rivian",             "ticker": "RIVN", "kind": "投资", "desc": "约 17% 股权（电卡车）","date": "2019"},
    ],
    "Meta": [
        {"name": "WhatsApp",                "ticker": None, "kind": "收购", "desc": "$190 亿",                "date": "2014"},
        {"name": "Oculus",                  "ticker": None, "kind": "收购", "desc": "$20 亿（VR）",           "date": "2014"},
        {"name": "Instagram",               "ticker": None, "kind": "收购", "desc": "$10 亿",                 "date": "2012"},
        {"name": "Within (Supernatural)",   "ticker": None, "kind": "收购", "desc": "$4 亿（VR 健身）",       "date": "2022"},
        {"name": "CTRL-Labs",               "ticker": None, "kind": "收购", "desc": "$5-10 亿（神经接口）",   "date": "2019"},
        {"name": "Kustomer",                "ticker": None, "kind": "收购", "desc": "$10 亿（客服 CRM）",     "date": "2022"},
        {"name": "Beat Games (Beat Saber)", "ticker": None, "kind": "收购", "desc": "VR 游戏",                "date": "2019"},
        {"name": "Mapillary",               "ticker": None, "kind": "收购", "desc": "众包街景",               "date": "2020"},
        {"name": "Scale AI",                "ticker": None, "kind": "投资", "desc": "$140 亿 持 49% 股权",    "date": "2024-06"},
    ],
    "Tesla": [
        {"name": "SolarCity",          "ticker": None, "kind": "收购", "desc": "$26 亿（太阳能）",     "date": "2016"},
        {"name": "Maxwell Technologies","ticker": None,"kind": "收购", "desc": "$2.18 亿（电池/电容）","date": "2019"},
        {"name": "Grohmann Engineering","ticker": None,"kind": "收购", "desc": "自动化产线",           "date": "2017"},
        {"name": "Hibar Systems",      "ticker": None, "kind": "收购", "desc": "电池制造",             "date": "2019"},
        {"name": "Perbix",             "ticker": None, "kind": "收购", "desc": "工厂自动化",           "date": "2017"},
        {"name": "Riviera Tool",       "ticker": None, "kind": "收购", "desc": "冲压设备",             "date": "2015"},
        {"name": "SilLion",            "ticker": None, "kind": "收购", "desc": "硅基负极电池",          "date": "2021"},
    ],
}

# Quantifier prefixes (e.g. "up to $2.1 billion in")
_QUANT = r"(?:up\s+to\s+|over\s+|nearly\s+|approximately\s+|about\s+|around\s+|more\s+than\s+)?"
_MONEY = r"(?:[\$\d.,]+\s*(?:billion|million|trillion|B|M|K)?\s+)?"
_PREP  = r"(?:in|into|on)?\s*"
# Case-sensitive target capture: up to 4 capitalized words in a row.
_TARGET = r"(?-i:([A-Z][\w&.\-]+(?:\s+[A-Z][\w&.\-]+){0,3}))"

INVEST_PATTERN_TEMPLATES = [
    rf"(?:{{co}})\s+(?:invests?|invested|to invest|investing)\s+{_QUANT}{_MONEY}{_PREP}{_TARGET}",
    rf"(?:{{co}})\s+(?:acquires?|acquired|to acquire|acquiring)\s+{_TARGET}",
    rf"(?:{{co}})\s+(?:takes?|took|taking)\s+(?:a\s+)?{_MONEY}stake\s+in\s+{_TARGET}",
    rf"(?:{{co}})\s+(?:backs?|backed|backing|leads?|led|leading)\s+{_TARGET}(?:'s)?\s+(?:funding|round|series|investment)",
    rf"(?:{{co}})\s+(?:partners?|partnered|partnering)\s+with\s+{_TARGET}",
]

# --- Sentiment scoring for "why did the stock move" analysis ----------------
POSITIVE_WORDS = [
    # Stock movement
    "surge", "surged", "surges", "soar", "soared", "soars", "jump", "jumped", "jumps",
    "rally", "rallied", "rallies", "rebound", "rebounded", "rebounds", "climb", "climbed", "climbs",
    "rose", "rises", "gain", "gained", "gains", "advance", "advanced",
    # Outcomes
    "beat", "beats", "beating", "exceeded", "exceeds", "exceed", "record", "outperform", "outperformed",
    "raise", "raised", "raises", "hike", "hiked", "lifts", "lifted", "boost", "boosted", "boosts",
    "win", "won", "wins", "secured", "secures", "achieves", "achieved",
    # Events / business
    "launch", "launches", "launched", "unveil", "unveils", "unveiled", "debut", "debuts",
    "breakthrough", "milestone", "agree", "agreed", "partner", "partners", "partnership",
    "deal", "deals", "contract", "contracts", "expansion", "expand", "expanded",
    "invest", "invests", "invested", "invests", "acquire", "acquires", "acquired",
    "approval", "approved", "approve", "wins", "wins",
    # Sentiment / forecast
    "upgrade", "upgraded", "upgrades", "bullish", "optimistic", "strong", "robust",
    "growth", "growing", "grow", "profit", "profits", "profitable",
    "buy", "outperform", "overweight",
]

NEGATIVE_WORDS = [
    # Stock movement
    "drop", "dropped", "drops", "fall", "fell", "falls", "plunge", "plunged", "plunges",
    "tumble", "tumbled", "tumbles", "slip", "slipped", "slips", "sink", "sank",
    "decline", "declined", "declines", "slump", "slumped", "slumps", "crash", "crashed",
    "tank", "tanked", "slide", "slid",
    # Outcomes
    "miss", "missed", "misses", "missing", "cut", "cuts", "slash", "slashed", "slashes",
    "lose", "lost", "loses", "lower", "lowered", "reduce", "reduced", "halt", "halted",
    "suspend", "suspended", "underperform", "underperformed",
    # Events / business
    "warn", "warns", "warning", "concern", "concerns", "fear", "fears", "lawsuit", "sue", "sued",
    "fine", "fined", "probe", "investigation", "fraud", "scandal", "recall", "recalled",
    "breach", "leak", "delay", "delayed", "cancel", "cancelled", "canceled", "layoff", "layoffs",
    "fired", "resign", "resigned", "exit", "exits",
    # Sentiment / forecast
    "downgrade", "downgraded", "downgrades", "bearish", "weak", "weaker", "weakness",
    "recession", "slowdown", "struggle", "struggling", "trouble", "crisis", "risk", "risks",
    "sell", "underweight",
]

POS_RE = re.compile(r'\b(?:' + '|'.join(POSITIVE_WORDS) + r')\b', re.IGNORECASE)
NEG_RE = re.compile(r'\b(?:' + '|'.join(NEGATIVE_WORDS) + r')\b', re.IGNORECASE)


def score_sentiment(text):
    """Count of positive minus negative keyword hits in text."""
    if not text:
        return 0
    return len(POS_RE.findall(text)) - len(NEG_RE.findall(text))


def build_sentiment_news(news_items):
    """For each company, identify the most positive and most negative news."""
    by_ticker = {}
    for c in COMPANIES:
        company_news = [n for n in news_items if n["primary_company"] == c["name"]]
        scored = []
        for n in company_news:
            text = f"{n['title']}. {n['summary']}"
            score = score_sentiment(text)
            if score != 0:
                scored.append((score, n))
        positive = sorted([s for s in scored if s[0] > 0], key=lambda x: -x[0])[:5]
        negative = sorted([s for s in scored if s[0] < 0], key=lambda x: x[0])[:5]
        def pack(items):
            return [{
                "title": n["title"], "link": n["link"], "source": n["source"],
                "date": n["published"], "score": s,
            } for s, n in items]
        by_ticker[c["ticker"]] = {
            "positive": pack(positive),
            "negative": pack(negative),
        }
    return by_ticker


STOP_WORDS = {
    "the", "a", "an", "this", "that", "these", "those",
    "its", "their", "our", "your", "his", "her", "my", "we", "you", "they",
    "and", "or", "but", "nor", "yet", "so",
    "in", "on", "at", "by", "to", "of", "with", "from", "into", "onto",
    "for", "over", "up", "down", "as", "about", "via", "around", "through",
    "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did",
    "says", "said", "announces", "announced", "reports", "reported",
    "plans", "planned", "will", "would", "could", "may", "might",
    "expects", "expected", "warns", "warned", "raises", "raised",
    "new", "more", "less", "most", "least", "many", "few", "several",
    "first", "next", "last", "recent", "latest", "another", "other",
    "billion", "million", "trillion", "b", "m", "k",
    "ai", "ml", "ar", "vr", "ev", "iot", "us", "usa", "uk", "eu",
    "ceo", "cto", "cfo", "ipo", "vc", "pe", "ir",
    "company", "companies", "firm", "startup", "business", "team",
    "report", "deal", "investment", "investments", "stake", "shares",
    "inc", "corp", "ltd", "llc", "co",
    "today", "yesterday", "tomorrow", "year", "month", "week", "day",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
    "building", "making", "running", "doing", "working", "trying", "driving",
}


def clean_target(raw, parent_co_regex):
    target = (raw or "").strip(" \t\n.,;:!?\"'")
    if not target:
        return None
    words = target.split()
    while words and words[0].lower() in STOP_WORDS:
        words = words[1:]
    while words and words[-1].lower() in STOP_WORDS:
        words = words[:-1]
    if not words:
        return None
    cleaned = " ".join(words)
    if not (2 <= len(cleaned) <= 80):
        return None
    if not cleaned[0].isupper():
        return None
    if cleaned.lower() in STOP_WORDS:
        return None
    if not any(ch.isalpha() for ch in cleaned):
        return None
    if parent_co_regex.fullmatch(cleaned) or parent_co_regex.fullmatch(words[0]):
        return None
    return cleaned


# Build per-company patterns + feeds
for c in COMPANIES:
    c["patterns"] = [t.replace("{co}", c["name_regex"]) for t in INVEST_PATTERN_TEMPLATES]
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


def co_color(name):
    for c in COMPANIES:
        if c["name"] == name:
            return c["color"]
    return "#4da6ff"


def co_badge_inline(name):
    color = co_color(name)
    return (f'<span class="co-badge" style="background:{color}22;color:{color};'
            f'border:1px solid {color}55">{escape(name)}</span>')


# --- Cache ------------------------------------------------------------------
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
        json.dumps({"seen_ids": ids[:4000],
                    "updated": datetime.now(timezone.utc).isoformat()},
                   ensure_ascii=False, indent=2),
        encoding="utf-8")


# --- Date parsing -----------------------------------------------------------
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


# --- News fetching (parallel) -----------------------------------------------
def _fetch_one_feed(args):
    primary, source, url = args
    try:
        feed = feedparser.parse(url, request_headers={"User-Agent": USER_AGENT})
        entries = []
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
            entries.append({
                "primary_company": primary,
                "source": source,
                "title": title,
                "link": link,
                "published": published,
                "summary": summary,
                "id": item_id,
            })
        return source, entries, None
    except Exception as e:
        return source, [], str(e)


def fetch_news(seen):
    feeds = []
    for c in COMPANIES:
        for source, url in c["feeds"]:
            feeds.append((c["name"], source, url))

    items = []
    with cf.ThreadPoolExecutor(max_workers=10) as ex:
        for source, entries, err in ex.map(_fetch_one_feed, feeds):
            if err:
                print(f"[{source}] error: {err}", file=sys.stderr)
            else:
                for e in entries:
                    e["is_new"] = e["id"] not in seen
                items.extend(entries)
                print(f"[{source}] {len(entries)}", file=sys.stderr)
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


# --- Investment signal detection --------------------------------------------
def detect_investments(items):
    out = {c["name"]: [] for c in COMPANIES}
    seen_targets = {c["name"]: set() for c in COMPANIES}
    for it in items:
        text = f"{it['title']}. {it['summary']}"
        for c in COMPANIES:
            for pat in c["patterns"]:
                for m in re.finditer(pat, text, re.IGNORECASE):
                    target = clean_target(m.group(1), c["self_regex"])
                    if target is None:
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


# --- SEC EDGAR --------------------------------------------------------------
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
        return filings[:5]
    except Exception as e:
        print(f"SEC error CIK {cik}: {e}", file=sys.stderr)
        return []


def fetch_sec_all():
    out = {}
    with cf.ThreadPoolExecutor(max_workers=9) as ex:
        futures = {ex.submit(fetch_sec_for, c["cik"]): c["name"] for c in COMPANIES}
        for fut in cf.as_completed(futures):
            name = futures[fut]
            out[name] = fut.result()
            print(f"SEC {name}: {len(out[name])}", file=sys.stderr)
    return out


# --- Stock prices (Yahoo Finance Chart API) ---------------------------------
def fetch_price(ticker):
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=1mo&interval=1d"
        r = requests.get(url,
                         headers={"User-Agent": BROWSER_UA, "Accept": "application/json"},
                         timeout=15)
        r.raise_for_status()
        data = r.json()
        result = data["chart"]["result"][0]
        meta = result["meta"]
        raw_closes = result["indicators"]["quote"][0].get("close", []) or []
        raw_ts = result.get("timestamp", []) or []
        # Keep only timestamp/close pairs where close is non-null
        pairs = [(t, c) for t, c in zip(raw_ts, raw_closes) if c is not None]
        timestamps = [p[0] for p in pairs]
        closes = [p[1] for p in pairs]
        # Yesterday's close = second-to-last daily close. Yahoo's
        # meta.previousClose is often null on multi-day range queries, and
        # meta.chartPreviousClose is the price BEFORE the chart window (1 month ago) —
        # using it as the day baseline produced "INTC +107% today" type bugs.
        day_baseline = (closes[-2] if len(closes) >= 2
                        else meta.get("previousClose")
                        or meta.get("chartPreviousClose"))
        return {
            "ticker": ticker,
            "price": meta.get("regularMarketPrice"),
            "prev_close": day_baseline,
            "currency": meta.get("currency", "USD"),
            "closes": closes,
            "timestamps": timestamps,
        }
    except Exception as e:
        print(f"price error {ticker}: {e}", file=sys.stderr)
        return None


def fetch_prices_all():
    out = {}
    with cf.ThreadPoolExecutor(max_workers=9) as ex:
        futures = {ex.submit(fetch_price, c["ticker"]): c["name"] for c in COMPANIES}
        for fut in cf.as_completed(futures):
            name = futures[fut]
            data = fut.result()
            if data:
                out[name] = data
                px = data.get("price")
                px_str = f"${px:.2f}" if px else "n/a"
                print(f"price {name}: {px_str}", file=sys.stderr)
    return out


def render_sparkline(closes, width=140, height=36):
    if not closes or len(closes) < 2:
        return ""
    lo, hi = min(closes), max(closes)
    rng = hi - lo or 1
    n = len(closes)
    points = []
    for i, c in enumerate(closes):
        x = i * (width / (n - 1))
        y = height - ((c - lo) / rng) * (height - 6) - 3
        points.append(f"{x:.1f},{y:.1f}")
    pts = " ".join(points)
    up = closes[-1] >= closes[0]
    color = "#00e5a0" if up else "#ff6b6b"
    fill = "rgba(0,229,160,0.10)" if up else "rgba(255,107,107,0.10)"
    area_pts = f"0,{height} " + pts + f" {width:.1f},{height}"
    return (f'<svg viewBox="0 0 {width} {height}" width="100%" height="{height}" '
            f'preserveAspectRatio="none">'
            f'<polygon fill="{fill}" points="{area_pts}"/>'
            f'<polyline fill="none" stroke="{color}" stroke-width="1.5" points="{pts}"/>'
            f'</svg>')


def render_price_cards(prices_by_co, category):
    parts = []
    for c in COMPANIES:
        if c["category"] != category:
            continue
        data = prices_by_co.get(c["name"])
        if not data or data["price"] is None:
            parts.append(f'''
    <div class="price-card disabled">
      <div class="price-head">
        <span class="price-ticker">{escape(c["ticker"])}</span>
        {co_badge_inline(c["name"])}
      </div>
      <div class="empty" style="margin-top:8px">价格暂不可用</div>
    </div>''')
            continue
        price = data["price"]
        prev = data["prev_close"] or price
        chg = price - prev
        chg_pct = (chg / prev * 100) if prev else 0
        cls = "up" if chg >= 0 else "down"
        sign = "+" if chg >= 0 else ""
        spark = render_sparkline(data["closes"])
        closes = data["closes"]
        month_chg_pct = ((closes[-1] - closes[0]) / closes[0] * 100
                         if closes and closes[0] else 0)
        m_sign = "+" if month_chg_pct >= 0 else ""
        m_cls = "up" if month_chg_pct >= 0 else "down"
        parts.append(f'''
    <div class="price-card clickable" data-ticker="{escape(c["ticker"])}" role="button" tabindex="0" aria-label="点击查看 {escape(c["name"])} 详情">
      <div class="price-head">
        <span class="price-ticker">{escape(c["ticker"])}</span>
        {co_badge_inline(c["name"])}
      </div>
      <div class="price-main">
        <span class="price-now">${price:.2f}</span>
        <span class="price-chg {cls}">{sign}{chg:.2f} ({sign}{chg_pct:.2f}%)</span>
      </div>
      <div class="price-spark">{spark}</div>
      <div class="price-month">1 个月: <span class="{m_cls}">{m_sign}{month_chg_pct:.2f}%</span></div>
      <div class="price-hint">👆 点击查看大图</div>
    </div>''')
    return "".join(parts)


def render_investment_sections(investments_by_co):
    out = []
    for c in COMPANIES:
        signals = investments_by_co.get(c["name"], [])
        if not signals:
            continue
        cards = []
        for inv in signals:
            new_badge = '<span class="badge badge-new">NEW</span>' if inv["is_new"] else ""
            new_cls = "signal-new" if inv["is_new"] else ""
            cards.append(f'''
    <div class="signal-card {new_cls}">
      <div class="signal-target">{escape(inv['target'])} {new_badge}</div>
      <div class="signal-title"><a href="{escape(inv['link'])}" target="_blank" rel="noopener">{escape(inv['title'])}</a></div>
      <div class="signal-meta">{escape(inv['source'])} · {escape(inv['date'])}</div>
    </div>''')
        out.append(f'''
  <div class="co-section">
    <div class="co-header" style="color:{c["color"]}">
      <span class="co-dot" style="background:{c["color"]}"></span>
      <span class="co-name">{escape(c['name'])}</span>
      <span class="co-count">{len(signals)} 个信号</span>
    </div>
    <div class="signal-grid">{"".join(cards)}</div>
  </div>''')
    if not out:
        return '<div class="empty">本次未检测到任何投资 / 收购信号。</div>'
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
            rows.append(f'''
    <a href="{escape(f['url'])}" target="_blank" rel="noopener" class="sec-card">
      <span class="sec-form {cls}">{escape(f['form'])}</span>
      <span class="sec-date">{escape(f['date'])}</span>
      <span class="sec-desc">{escape(f.get('description') or '')}</span>
    </a>''')
        rows_html = "".join(rows) or '<div class="empty">无新文件。</div>'
        out.append(f'''
  <div class="co-section">
    <div class="co-header" style="color:{c["color"]}">
      <span class="co-dot" style="background:{c["color"]}"></span>
      <span class="co-name">{escape(c['name'])}</span>
      <span class="co-count">CIK {escape(c['cik'])} · {len(filings)} 份</span>
    </div>
    <div class="sec-grid">{rows_html}</div>
  </div>''')
    return "".join(out)


TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="900">
<title>美股巨头 · 投资追踪 · {{NOW}}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#050810;--bg2:#0b0f1e;--border:rgba(255,255,255,.07);--border2:rgba(255,255,255,.15);--text:#e8edf5;--text2:#8a9ab8;--text3:#4a5a78;--green:#00e5a0;--blue:#4da6ff;--amber:#f5a623;--fire:#ff4d00;--purple:#a78bfa}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Syne',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(77,166,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(77,166,255,.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}
.wrap{max-width:1280px;margin:0 auto;padding:40px 20px 60px;position:relative;z-index:1}
.hero{margin-bottom:36px}
.hero-eyebrow{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--blue);margin-bottom:12px;opacity:.8}
.hero-title{font-size:clamp(28px,5vw,46px);font-weight:800;line-height:1.05;background:linear-gradient(135deg,#fff 0%,#9dd923 25%,#5db1ff 50%,#fbbc04 75%,#ff6b6b 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-1px;margin-bottom:8px}
.hero-sub{font-size:14px;color:var(--text2)}
.hero-time{display:inline-block;margin-top:10px;font-family:'Space Mono',monospace;font-size:11px;color:var(--text3);border:1px solid var(--border2);padding:4px 14px;border-radius:20px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:36px}
.stat{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:16px 18px;text-align:center}
.stat-label{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:8px}
.stat-val{font-size:22px;font-weight:700}
.stat-val.green{color:var(--green)}.stat-val.blue{color:var(--blue)}.stat-val.amber{color:var(--amber)}.stat-val.fire{color:var(--fire)}
.section-label{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:var(--text3);margin:32px 0 14px;display:flex;align-items:center;gap:10px}
.section-label::after{content:'';flex:1;height:1px;background:var(--border)}
.subgroup-label{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:2px;color:var(--text2);margin:14px 0 10px;text-transform:uppercase}
.price-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin-bottom:18px}
.price-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:16px;transition:border-color .2s}
.price-card:hover{border-color:var(--border2)}
.price-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px}
.price-ticker{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--text2);letter-spacing:1px}
.price-main{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;gap:8px;flex-wrap:wrap}
.price-now{font-size:22px;font-weight:800}
.price-chg{font-family:'Space Mono',monospace;font-size:11px;font-weight:700}
.up{color:#00e5a0}.down{color:#ff6b6b}
.price-spark{margin-bottom:6px;height:36px}
.price-month{font-family:'Space Mono',monospace;font-size:11px;color:var(--text3)}
.co-section{margin-bottom:28px}
.co-header{display:flex;align-items:center;gap:12px;font-size:18px;font-weight:700;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border)}
.co-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;box-shadow:0 0 8px currentColor}
.co-name{flex:1}
.co-count{font-family:'Space Mono',monospace;font-size:12px;color:var(--text3);font-weight:400}
.co-badge{font-family:'Space Mono',monospace;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;letter-spacing:.5px;text-transform:uppercase;display:inline-block}
.signal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.signal-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:18px;transition:border-color .2s}
.signal-card:hover{border-color:var(--border2)}
.signal-new{border-color:rgba(0,229,160,.4);background:linear-gradient(135deg,var(--bg2) 0%,rgba(0,229,160,.05) 100%)}
.signal-target{font-size:18px;font-weight:700;color:var(--fire);margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.signal-title{font-size:13px;margin-bottom:6px;line-height:1.4}
.signal-title a{color:var(--text);text-decoration:none}
.signal-title a:hover{color:var(--blue)}
.signal-meta{font-size:11px;color:var(--text3);font-family:'Space Mono',monospace}
.sec-grid{display:flex;flex-direction:column;gap:6px}
.sec-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:grid;grid-template-columns:80px 95px 1fr;gap:14px;align-items:center;text-decoration:none;color:var(--text);transition:border-color .2s}
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
.empty{padding:20px;text-align:center;color:var(--text3);background:var(--bg2);border:1px dashed var(--border2);border-radius:12px;font-size:12px}
.footer{text-align:center;font-size:11px;color:var(--text3);line-height:1.8;padding-top:24px;margin-top:40px;border-top:1px solid var(--border)}
.filter-bar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
.filter-btn{font-family:'Space Mono',monospace;font-size:11px;font-weight:700;padding:6px 12px;border-radius:20px;border:1px solid var(--border2);background:var(--bg2);color:var(--text2);cursor:pointer;transition:all .2s}
.filter-btn:hover{color:var(--text)}
.filter-btn.active{background:var(--text);color:var(--bg);border-color:var(--text)}
.price-card.clickable{cursor:pointer}
.price-card.clickable:hover{transform:translateY(-2px);border-color:var(--border2);box-shadow:0 8px 24px rgba(0,0,0,.3)}
.price-card.disabled{opacity:.5}
.price-hint{font-family:'Space Mono',monospace;font-size:9px;color:var(--text3);margin-top:6px;text-align:right;opacity:.6}
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(6px);display:none;z-index:1000;align-items:center;justify-content:center;padding:20px;animation:fadeIn .2s}
.modal-backdrop.open{display:flex}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.modal{background:var(--bg2);border:1px solid var(--border2);border-radius:18px;padding:28px;max-width:780px;width:100%;max-height:92vh;overflow-y:auto;position:relative;animation:slideUp .25s cubic-bezier(0.22,1,0.36,1)}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
.modal-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;border:1px solid var(--border2);background:transparent;color:var(--text2);font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;line-height:1}
.modal-close:hover{background:var(--border2);color:var(--text)}
.modal-header{display:flex;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap;padding-right:40px}
.modal-ticker{font-family:'Space Mono',monospace;font-size:14px;font-weight:700;color:var(--text2);letter-spacing:2px}
.modal-name{font-size:22px;font-weight:700}
.modal-price-row{display:flex;align-items:baseline;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.modal-price{font-size:42px;font-weight:800}
.modal-chg{font-family:'Space Mono',monospace;font-size:14px;font-weight:700}
.modal-chart-wrap{position:relative;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:18px}
.modal-chart{width:100%;height:240px;display:block}
.chart-tooltip{position:absolute;display:none;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;padding:6px 10px;font-family:'Space Mono',monospace;font-size:11px;pointer-events:none;white-space:nowrap;z-index:10;color:var(--text);box-shadow:0 4px 12px rgba(0,0,0,.4)}
.modal-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px}
.modal-stat{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px}
.modal-stat-label{font-family:'Space Mono',monospace;font-size:9px;color:var(--text3);letter-spacing:1.2px;text-transform:uppercase;margin-bottom:4px}
.modal-stat-val{font-size:16px;font-weight:700;font-family:'Space Mono',monospace}
.modal-stat-val.up{color:#00e5a0}.modal-stat-val.down{color:#ff6b6b}
.modal-investments{margin:18px 0;padding-top:16px;border-top:1px solid var(--border)}
.modal-investments-title{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:14px;text-align:center}
.investment-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
.investment-card{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;transition:border-color .2s,transform .15s,background .2s}
.investment-card:hover{border-color:var(--border2)}
.investment-card.clickable{cursor:pointer;background:linear-gradient(135deg,var(--bg) 0%,rgba(77,166,255,.04) 100%)}
.investment-card.clickable:hover{border-color:rgba(77,166,255,.5);transform:translateY(-1px);background:linear-gradient(135deg,var(--bg) 0%,rgba(77,166,255,.08) 100%)}
.investment-card.clickable .inv-name{color:#4da6ff}
.inv-arrow{font-family:'Space Mono',monospace;font-size:11px;color:#4da6ff;font-weight:700;margin-left:4px;opacity:.6}
.investment-card.clickable:hover .inv-arrow{opacity:1;transform:translateX(2px);transition:all .2s}
.co-badge.clickable-badge{cursor:pointer;transition:transform .15s,filter .15s}
.co-badge.clickable-badge:hover{filter:brightness(1.4);transform:scale(1.05)}
.inv-row1{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:5px}
.inv-name{font-size:13px;font-weight:600;color:var(--text);line-height:1.3}
.inv-ticker{font-family:'Space Mono',monospace;font-size:9px;background:rgba(77,166,255,.15);color:#4da6ff;padding:1px 6px;border-radius:10px;font-weight:700;letter-spacing:.5px;flex-shrink:0}
.inv-row2{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px}
.inv-kind{display:inline-block;font-family:'Space Mono',monospace;font-size:9px;padding:1px 6px;border-radius:8px;font-weight:700;letter-spacing:.5px}
.inv-kind-acq{background:rgba(255,77,0,.15);color:#ff6b6b}
.inv-kind-strat{background:rgba(0,229,160,.15);color:#00e5a0}
.inv-kind-vc{background:rgba(167,139,250,.15);color:#a78bfa}
.inv-kind-inv{background:rgba(245,166,35,.15);color:#f5a623}
.inv-kind-sub{background:rgba(77,166,255,.15);color:#4da6ff}
.inv-kind-coll{background:rgba(255,255,255,.08);color:var(--text2)}
.inv-desc{font-size:11px;color:var(--text2);line-height:1.35}
.inv-date{font-family:'Space Mono',monospace;font-size:10px;color:var(--text3);margin-top:3px}
.modal-reasons{margin:18px 0;padding-top:16px;border-top:1px solid var(--border)}
.modal-reasons-title{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:14px;text-align:center}
.reasons-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:600px){.reasons-grid{grid-template-columns:1fr}}
.reason-col{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px}
.reason-label{font-family:'Space Mono',monospace;font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)}
.reason-label.up{color:#00e5a0}
.reason-label.down{color:#ff6b6b}
.reason-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
.reason-item{font-size:12px;line-height:1.45;padding:6px 0;border-bottom:1px dashed var(--border)}
.reason-item:last-child{border-bottom:none}
.reason-item a{color:var(--text);text-decoration:none;display:block;margin-bottom:3px}
.reason-item a:hover{color:var(--blue)}
.reason-meta{font-size:10px;color:var(--text3);font-family:'Space Mono',monospace;display:flex;justify-content:space-between;align-items:center;gap:8px}
.reason-score{padding:1px 6px;border-radius:10px;font-weight:700}
.reason-score.up{background:rgba(0,229,160,.15);color:#00e5a0}
.reason-score.down{background:rgba(255,107,107,.15);color:#ff6b6b}
.reason-empty{font-size:11px;color:var(--text3);text-align:center;padding:14px;font-style:italic}
.modal-meta{font-family:'Space Mono',monospace;font-size:10px;color:var(--text3);text-align:center;padding-top:12px;border-top:1px solid var(--border)}
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div class="hero-eyebrow">US Mega Tracker · Mag 7 + Chips</div>
    <h1 class="hero-title">美股巨头 · 投资追踪</h1>
    <p class="hero-sub">价格走势 · 新闻 · 投资信号 · SEC 文件 · 自动每 2 小时更新</p>
    <span class="hero-time" id="time-badge">最近更新：{{NOW}}</span>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-label">追踪公司</div><div class="stat-val blue">9</div></div>
    <div class="stat"><div class="stat-label">总新闻</div><div class="stat-val blue">{{TOTAL}}</div></div>
    <div class="stat"><div class="stat-label">本次新增</div><div class="stat-val green">{{NEW}}</div></div>
    <div class="stat"><div class="stat-label">投资信号</div><div class="stat-val fire">{{SIG_TOTAL}}</div></div>
    <div class="stat"><div class="stat-label">SEC 文件</div><div class="stat-val amber">{{SEC_TOTAL}}</div></div>
  </div>

  <div class="section-label">📈 股价 · 1 个月走势</div>
  <div class="subgroup-label">🔬 芯片股 (Chips)</div>
  <div class="price-grid">{{PRICE_CHIP}}</div>
  <div class="subgroup-label">⭐ Magnificent 7（除 NVIDIA 外）</div>
  <div class="price-grid">{{PRICE_MAG7}}</div>

  <div class="section-label">🔥 投资 / 收购 / 合作信号</div>
  {{INV_SECTIONS}}

  <div class="section-label">📋 SEC 官方文件</div>
  {{SEC_SECTIONS}}

  <div class="section-label">📰 全部新闻（最新 100 条）</div>
  <div class="filter-bar" id="filter-bar">
    <button class="filter-btn active" data-filter="all">全部</button>
    {{FILTER_BTNS}}
  </div>
  <div class="news-grid" id="news-grid">{{NEWS_HTML}}</div>

  <div class="footer">
    数据源：Google News · Yahoo Finance（新闻 + 股价）· NVIDIA Blog · SEC EDGAR<br>
    覆盖：NVIDIA · Intel · AMD · Apple · Microsoft · Alphabet · Amazon · Meta · Tesla<br>
    由 GitHub Actions 自动构建 · 不构成投资建议
  </div>
</div>

<div class="modal-backdrop" id="priceModal" role="dialog" aria-labelledby="modalName" aria-hidden="true">
  <div class="modal">
    <button class="modal-close" id="modalClose" aria-label="关闭">×</button>
    <div class="modal-header">
      <span class="modal-ticker" id="modalTicker">—</span>
      <span class="modal-name" id="modalName">—</span>
      <span id="modalCoBadge"></span>
    </div>
    <div class="modal-price-row">
      <span class="modal-price" id="modalPrice">$0.00</span>
      <span class="modal-chg" id="modalChg">—</span>
    </div>
    <div class="modal-chart-wrap">
      <svg class="modal-chart" id="modalChart" viewBox="0 0 600 240" preserveAspectRatio="none"></svg>
      <div class="chart-tooltip" id="chartTooltip"></div>
    </div>
    <div class="modal-stats" id="modalStats"></div>

    <div class="modal-investments">
      <div class="modal-investments-title">💼 已公开主要投资 / 收购</div>
      <div class="investment-grid" id="investmentGrid"></div>
    </div>

    <div class="modal-reasons">
      <div class="modal-reasons-title">📊 涨跌可能原因（基于近期新闻情绪分析）</div>
      <div class="reasons-grid">
        <div class="reason-col">
          <div class="reason-label up">📈 利好新闻（可能推升价格）</div>
          <ul class="reason-list" id="reasonsPos"></ul>
        </div>
        <div class="reason-col">
          <div class="reason-label down">📉 利空新闻（可能压低价格）</div>
          <ul class="reason-list" id="reasonsNeg"></ul>
        </div>
      </div>
    </div>

    <div class="modal-meta">数据来源：Yahoo Finance · 每 2 小时自动刷新 · 鼠标悬停折线图查看每日价格</div>
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

// ===== Price detail modal =====
const PRICE_DATA = {{PRICE_JSON}};
const modalEl = document.getElementById('priceModal');
const mTicker = document.getElementById('modalTicker');
const mName = document.getElementById('modalName');
const mBadge = document.getElementById('modalCoBadge');
const mPrice = document.getElementById('modalPrice');
const mChg = document.getElementById('modalChg');
const mChart = document.getElementById('modalChart');
const mStats = document.getElementById('modalStats');
const tooltip = document.getElementById('chartTooltip');

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('zh-CN', {month:'short', day:'numeric'});
}

function openPriceModal(ticker) {
  const d = PRICE_DATA[ticker];
  if (!d) return;
  mTicker.textContent = ticker;
  mName.textContent = d.name;
  mBadge.innerHTML = '<span class="co-badge" style="background:'+d.color+'22;color:'+d.color+';border:1px solid '+d.color+'55">'+d.name+'</span>';
  const closes = d.closes, tss = d.timestamps;
  const cur = d.price;
  const prev = d.prev_close || cur;
  const chg = cur - prev;
  const chgPct = prev ? (chg/prev*100) : 0;
  const up = chg >= 0;
  mPrice.textContent = '$' + cur.toFixed(2);
  mChg.textContent = (up?'+':'') + chg.toFixed(2) + ' (' + (up?'+':'') + chgPct.toFixed(2) + '%)';
  mChg.className = 'modal-chg ' + (up?'up':'down');

  const monthPct = (closes.length && closes[0]) ? ((closes[closes.length-1]-closes[0])/closes[0]*100) : 0;
  const weekIdx = Math.max(0, closes.length - 6);
  const weekBase = closes[weekIdx];
  const weekPct = weekBase ? ((closes[closes.length-1]-weekBase)/weekBase*100) : 0;
  const hi = Math.max.apply(null, closes), lo = Math.min.apply(null, closes);
  const stats = [
    ['当日涨跌', (chg>=0?'+':'')+chgPct.toFixed(2)+'%', chg>=0?'up':'down'],
    ['1 周涨跌', (weekPct>=0?'+':'')+weekPct.toFixed(2)+'%', weekPct>=0?'up':'down'],
    ['1 月涨跌', (monthPct>=0?'+':'')+monthPct.toFixed(2)+'%', monthPct>=0?'up':'down'],
    ['月内最高', '$'+hi.toFixed(2), ''],
    ['月内最低', '$'+lo.toFixed(2), ''],
    ['昨日收盘', '$'+prev.toFixed(2), '']
  ];
  mStats.innerHTML = stats.map(s =>
    '<div class="modal-stat"><div class="modal-stat-label">'+s[0]+'</div><div class="modal-stat-val '+s[2]+'">'+s[1]+'</div></div>'
  ).join('');

  renderLargeChart(closes, tss);
  renderInvestments(d.investments || []);
  renderReasons(d.positive_news || [], d.negative_news || []);
  modalEl.classList.add('open');
  modalEl.setAttribute('aria-hidden', 'false');
  // Scroll back to top when switching stocks via cross-link
  const inner = modalEl.querySelector('.modal');
  if (inner) inner.scrollTop = 0;
}

function renderInvestments(invs) {
  const grid = document.getElementById('investmentGrid');
  if (!invs || !invs.length) {
    grid.innerHTML = '<div class="reason-empty">暂无收录的公开投资</div>';
    return;
  }
  const kindMap = {'收购':'acq','战略':'strat','私募':'vc','投资':'inv','子公司':'sub','合作':'coll'};
  grid.innerHTML = invs.map(i => {
    const ticker = i.ticker ? '<span class="inv-ticker">'+escapeHtml(i.ticker)+'</span>' : '';
    const kindCls = kindMap[i.kind] || 'inv';
    // If the invested company is itself one of our tracked tickers, make the card clickable.
    const tracked = i.ticker && PRICE_DATA[i.ticker];
    const clickAttr = tracked
      ? ' clickable" data-ticker="' + escapeHtml(i.ticker) + '" role="button" tabindex="0" title="点击查看 ' + escapeHtml(i.name) + ' 详情'
      : '';
    return '<div class="investment-card' + clickAttr + '">' +
      '<div class="inv-row1"><span class="inv-name">'+escapeHtml(i.name)+'</span>'+ticker+(tracked ? ' <span class="inv-arrow">→</span>' : '')+'</div>' +
      '<div class="inv-row2"><span class="inv-kind inv-kind-'+kindCls+'">'+escapeHtml(i.kind)+'</span></div>' +
      '<div class="inv-desc">'+escapeHtml(i.desc)+'</div>' +
      '<div class="inv-date">'+escapeHtml(i.date)+'</div>' +
      '</div>';
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderReasons(pos, neg) {
  const posEl = document.getElementById('reasonsPos');
  const negEl = document.getElementById('reasonsNeg');
  const renderList = (arr, dir) => {
    if (!arr.length) {
      return '<li class="reason-empty">本周期未检测到明显' + (dir==='up'?'利好':'利空') + '新闻</li>';
    }
    return arr.map(n => {
      const score = (n.score >= 0 ? '+' : '') + n.score;
      return '<li class="reason-item">' +
        '<a href="' + escapeHtml(n.link) + '" target="_blank" rel="noopener">' + escapeHtml(n.title) + '</a>' +
        '<div class="reason-meta"><span>' + escapeHtml(n.source) + '</span>' +
        '<span class="reason-score ' + dir + '">情绪 ' + score + '</span></div>' +
        '</li>';
    }).join('');
  };
  posEl.innerHTML = renderList(pos, 'up');
  negEl.innerHTML = renderList(neg, 'down');
}

function closePriceModal() {
  modalEl.classList.remove('open');
  modalEl.setAttribute('aria-hidden', 'true');
  tooltip.style.display = 'none';
}

function renderLargeChart(closes, tss) {
  const W = 600, H = 240, padL = 50, padR = 16, padT = 12, padB = 30;
  const cw = W - padL - padR, ch = H - padT - padB;
  if (closes.length < 2) {
    mChart.innerHTML = '<text x="'+(W/2)+'" y="'+(H/2)+'" text-anchor="middle" fill="#4a5a78" font-size="12">数据不足</text>';
    return;
  }
  const lo = Math.min.apply(null, closes), hi = Math.max.apply(null, closes);
  const rng = (hi-lo) || 1;
  const n = closes.length;
  const pts = closes.map((c,i) => [padL + i*cw/(n-1), padT + ch - ((c-lo)/rng)*ch]);
  const ptsStr = pts.map(p => p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const up = closes[n-1] >= closes[0];
  const lineColor = up ? '#00e5a0' : '#ff6b6b';
  const fillColor = up ? 'rgba(0,229,160,0.10)' : 'rgba(255,107,107,0.10)';
  const areaPts = padL+','+(padT+ch) + ' ' + ptsStr + ' ' + (padL+cw)+','+(padT+ch);

  const gridY = [padT, padT+ch/2, padT+ch];
  const gridLab = [hi.toFixed(2), ((hi+lo)/2).toFixed(2), lo.toFixed(2)];
  let gridSvg = '';
  for (let i=0; i<3; i++) {
    gridSvg += '<line x1="'+padL+'" y1="'+gridY[i]+'" x2="'+(padL+cw)+'" y2="'+gridY[i]+'" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>';
    gridSvg += '<text x="'+(padL-6)+'" y="'+(gridY[i]+3)+'" text-anchor="end" font-family="Space Mono" font-size="10" fill="#4a5a78">$'+gridLab[i]+'</text>';
  }

  const dateAt = [[padL, fmtDate(tss[0]), 'start'],
                  [padL+cw/2, fmtDate(tss[Math.floor(n/2)]), 'middle'],
                  [padL+cw, fmtDate(tss[n-1]), 'end']];
  let dateSvg = '';
  dateAt.forEach(d => {
    dateSvg += '<text x="'+d[0]+'" y="'+(H-8)+'" text-anchor="'+d[2]+'" font-family="Space Mono" font-size="10" fill="#4a5a78">'+d[1]+'</text>';
  });

  mChart.innerHTML =
    gridSvg +
    '<polygon fill="'+fillColor+'" points="'+areaPts+'"/>' +
    '<polyline fill="none" stroke="'+lineColor+'" stroke-width="2" points="'+ptsStr+'"/>' +
    dateSvg +
    '<line id="hLine" x1="0" y1="'+padT+'" x2="0" y2="'+(padT+ch)+'" stroke="rgba(255,255,255,0.3)" stroke-width="1" visibility="hidden"/>' +
    '<circle id="hDot" r="5" fill="'+lineColor+'" stroke="#fff" stroke-width="2" visibility="hidden"/>' +
    '<rect id="hOverlay" x="'+padL+'" y="'+padT+'" width="'+cw+'" height="'+ch+'" fill="transparent" style="cursor:crosshair"/>';

  const hLine = document.getElementById('hLine');
  const hDot = document.getElementById('hDot');
  const hOverlay = document.getElementById('hOverlay');

  hOverlay.addEventListener('mousemove', e => {
    const rect = mChart.getBoundingClientRect();
    const xSvg = (e.clientX - rect.left) * W / rect.width;
    let best = 0, bestDist = Infinity;
    for (let i=0; i<n; i++) {
      const dd = Math.abs(pts[i][0] - xSvg);
      if (dd < bestDist) { bestDist = dd; best = i; }
    }
    hLine.setAttribute('x1', pts[best][0]);
    hLine.setAttribute('x2', pts[best][0]);
    hLine.setAttribute('visibility', 'visible');
    hDot.setAttribute('cx', pts[best][0]);
    hDot.setAttribute('cy', pts[best][1]);
    hDot.setAttribute('visibility', 'visible');
    tooltip.style.display = 'block';
    tooltip.textContent = fmtDate(tss[best]) + ' · $' + closes[best].toFixed(2);
    const tipX = Math.min(rect.width - 140, Math.max(8, e.clientX - rect.left + 12));
    tooltip.style.left = tipX + 'px';
    tooltip.style.top = '14px';
  });
  hOverlay.addEventListener('mouseleave', () => {
    hLine.setAttribute('visibility', 'hidden');
    hDot.setAttribute('visibility', 'hidden');
    tooltip.style.display = 'none';
  });
}

document.querySelectorAll('.price-card.clickable').forEach(card => {
  card.addEventListener('click', () => openPriceModal(card.dataset.ticker));
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPriceModal(card.dataset.ticker); }
  });
});

// ===== Cross-stock click navigation =====
// Map company name → ticker (so we can convert news badges to clickable jumps).
const COMPANY_TO_TICKER = {
  'NVIDIA':'NVDA','Intel':'INTC','AMD':'AMD','Apple':'AAPL',
  'Microsoft':'MSFT','Alphabet':'GOOGL','Amazon':'AMZN','Meta':'META','Tesla':'TSLA'
};

// Investment-card click → open the invested company's modal (only if tracked).
// Event delegation: one listener handles all future clicks in the grid.
document.getElementById('investmentGrid').addEventListener('click', e => {
  const card = e.target.closest('.investment-card.clickable');
  if (card && card.dataset.ticker && PRICE_DATA[card.dataset.ticker]) {
    openPriceModal(card.dataset.ticker);
  }
});
document.getElementById('investmentGrid').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    const card = e.target.closest('.investment-card.clickable');
    if (card && card.dataset.ticker && PRICE_DATA[card.dataset.ticker]) {
      e.preventDefault();
      openPriceModal(card.dataset.ticker);
    }
  }
});

// News-card company badge → open that stock's modal.
document.querySelectorAll('#news-grid .news-card').forEach(nc => {
  const company = nc.dataset.company;
  const ticker = COMPANY_TO_TICKER[company];
  if (!ticker || !PRICE_DATA[ticker]) return;
  const badge = nc.querySelector('.co-badge');
  if (!badge) return;
  badge.classList.add('clickable-badge');
  badge.setAttribute('title', '点击查看 ' + company + ' 详情');
  badge.addEventListener('click', e => {
    e.stopPropagation();
    e.preventDefault();
    openPriceModal(ticker);
  });
});
document.getElementById('modalClose').addEventListener('click', closePriceModal);
modalEl.addEventListener('click', e => { if (e.target === modalEl) closePriceModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePriceModal(); });
</script>
</body>
</html>
"""


def render_html(news, investments_by_co, sec_by_co, prices_by_co):
    new_count = sum(1 for n in news if n["is_new"])
    sig_total = sum(len(v) for v in investments_by_co.values())
    sec_total = sum(len(v) for v in sec_by_co.values())
    now_utc = datetime.now(timezone.utc)
    now_str = now_utc.strftime("%Y-%m-%d %H:%M UTC")
    now_iso = now_utc.isoformat()

    price_chip = render_price_cards(prices_by_co, "chip")
    price_mag7 = render_price_cards(prices_by_co, "mag7")
    inv_sections = render_investment_sections(investments_by_co)
    sec_sections = render_sec_sections(sec_by_co)

    # Embed price data as JSON for the click-to-detail modal.
    sentiment_news = build_sentiment_news(news)
    price_data_for_js = {}
    for c in COMPANIES:
        d = prices_by_co.get(c["name"])
        if not d or d.get("price") is None:
            continue
        sent = sentiment_news.get(c["ticker"], {"positive": [], "negative": []})
        price_data_for_js[c["ticker"]] = {
            "name": c["name"],
            "color": c["color"],
            "price": d["price"],
            "prev_close": d["prev_close"],
            "closes": d["closes"],
            "timestamps": d["timestamps"],
            "positive_news": sent["positive"],
            "negative_news": sent["negative"],
            "investments": KNOWN_INVESTMENTS.get(c["name"], []),
        }
    price_json = json.dumps(price_data_for_js, ensure_ascii=False)

    # Filter buttons for news (one per company)
    filter_btns = "".join(
        f'<button class="filter-btn" data-filter="{escape(c["name"])}" '
        f'style="color:{c["color"]}">{escape(c["name"])}</button>'
        for c in COMPANIES)

    news_html_parts = []
    for it in news[:100]:
        new_badge = '<span class="badge badge-new">NEW</span>' if it["is_new"] else ""
        new_cls = "news-new" if it["is_new"] else ""
        news_html_parts.append(f'''
    <div class="news-card {new_cls}" data-company="{escape(it['primary_company'])}">
      <div class="news-source">
        <div class="news-source-left">
          {co_badge_inline(it['primary_company'])}
          <span>{escape(it['source'])}</span>
        </div>
        {new_badge}
      </div>
      <a class="news-title" href="{escape(it['link'])}" target="_blank" rel="noopener">{escape(it['title'])}</a>
      <div class="news-summary">{escape(it['summary'])}</div>
      <div class="news-date">{escape(it['published'])}</div>
    </div>''')
    news_html = "".join(news_html_parts) or '<div class="empty">未抓取到新闻。</div>'

    replacements = {
        "{{NOW}}": now_str,
        "{{NOW_ISO}}": now_iso,
        "{{TOTAL}}": str(len(news)),
        "{{NEW}}": str(new_count),
        "{{SIG_TOTAL}}": str(sig_total),
        "{{SEC_TOTAL}}": str(sec_total),
        "{{PRICE_CHIP}}": price_chip,
        "{{PRICE_MAG7}}": price_mag7,
        "{{PRICE_JSON}}": price_json,
        "{{INV_SECTIONS}}": inv_sections,
        "{{SEC_SECTIONS}}": sec_sections,
        "{{FILTER_BTNS}}": filter_btns,
        "{{NEWS_HTML}}": news_html,
    }
    out = TEMPLATE
    for k, v in replacements.items():
        out = out.replace(k, v)
    return out


def main():
    seen = load_seen()
    print(f"loaded {len(seen)} seen ids", file=sys.stderr)

    # Run fetches concurrently across the three external sources.
    with cf.ThreadPoolExecutor(max_workers=3) as ex:
        f_news = ex.submit(fetch_news, seen)
        f_sec = ex.submit(fetch_sec_all)
        f_prices = ex.submit(fetch_prices_all)
        news = f_news.result()
        sec_by_co = f_sec.result()
        prices_by_co = f_prices.result()

    news = dedupe(news)
    news.sort(key=lambda x: parse_date(x["published"]), reverse=True)
    print(f"unique items: {len(news)}", file=sys.stderr)

    investments_by_co = detect_investments(news)
    for co, sigs in investments_by_co.items():
        if sigs:
            print(f"signals[{co}]: {len(sigs)}", file=sys.stderr)

    html = render_html(news, investments_by_co, sec_by_co, prices_by_co)
    OUTPUT_FILE.write_text(html, encoding="utf-8")
    print(f"wrote {OUTPUT_FILE} ({len(html):,} bytes)", file=sys.stderr)

    all_ids = [n["id"] for n in news] + list(seen)
    unique_ids = list(dict.fromkeys(all_ids))
    save_seen(unique_ids)
    print(f"saved {len(unique_ids)} seen ids", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
