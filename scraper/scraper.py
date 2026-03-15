"""
DepositoPlus — Playwright Bank Rate Scraper
═══════════════════════════════════════════
Runs via GitHub Actions every Monday 08:00 WIB.
Output: scraper/bank_rates.json

Strategy per bank (waterfall):
  1. requests + BeautifulSoup  (fast, no JS needed)  — timeout 12s
  2. Playwright Chromium        (full JS render)       — timeout 30s
  3. Playwright + stealth JS    (anti-bot bypass)      — timeout 40s
  4. Playwright via mobile UA   (some sites unblock)   — timeout 30s
  5. Fallback → last known rate from bank_rates.json

Install:
  pip install -r requirements.txt
  playwright install chromium --with-deps

Run:
  python scraper.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup
from playwright.async_api import (
    async_playwright,
    Browser,
    BrowserContext,
    Page,
    TimeoutError as PlaywrightTimeout,
)

# ══════════════════════════════════════════════════════════════════
# LOGGING
# ══════════════════════════════════════════════════════════════════
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("deposito-scraper")

# ══════════════════════════════════════════════════════════════════
# CONSTANTS
# ══════════════════════════════════════════════════════════════════
WIB          = timezone(timedelta(hours=7))
OUTPUT_FILE  = Path(__file__).parent / "bank_rates.json"
HTTP_TIMEOUT = 12          # seconds for requests
PW_TIMEOUT   = 30_000      # ms for Playwright (30s)
PW_TIMEOUT_STEALTH = 40_000
JITTER_MIN   = 1.2
JITTER_MAX   = 3.0

DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
MOBILE_UA  = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36"

HTTP_HEADERS = {
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control":   "no-cache",
    "User-Agent":      DESKTOP_UA,
}

# ══════════════════════════════════════════════════════════════════
# SEED DATA  (fallback values if all scrape attempts fail)
# ══════════════════════════════════════════════════════════════════
SEED_DATA: list[dict] = [
    {"id": "bri",       "nama": "Bank BRI",          "tipe": "Konvensional", "kategori": "BUMN",
     "bunga_pa": 3.00,  "setoran_min": 1_000_000,    "tenor": [1,3,6,12,24], "lps_tipe": "bank_umum",
     "metode_buka": "App & Cabang", "app": "BRImo",
     "keterangan": "Bunga 3.00% berlaku tenor 1 & 3 bln. Buka via BRImo min Rp1jt.", "warna": "#1a7dd4"},
    {"id": "bca",       "nama": "Bank BCA",           "tipe": "Konvensional", "kategori": "Swasta Besar",
     "bunga_pa": 2.50,  "setoran_min": 8_000_000,    "tenor": [1,3,6,12],    "lps_tipe": "bank_umum",
     "metode_buka": "App & Cabang", "app": "myBCA",
     "keterangan": "Bunga 2.50% tenor 1 bln. Reputasi sangat kuat, jaringan luas.", "warna": "#005baa"},
    {"id": "mandiri",   "nama": "Bank Mandiri",       "tipe": "Konvensional", "kategori": "BUMN",
     "bunga_pa": 2.25,  "setoran_min": 1_000_000,    "tenor": [1,3,6,12,24], "lps_tipe": "bank_umum",
     "metode_buka": "App & Cabang", "app": "Livin' by Mandiri",
     "keterangan": "Buka via Livin min Rp1jt. Bunga 2.25% untuk tenor 1–3 bln.", "warna": "#003087"},
    {"id": "bni",       "nama": "Bank BNI",           "tipe": "Konvensional", "kategori": "BUMN",
     "bunga_pa": 2.25,  "setoran_min": 5_000_000,    "tenor": [1,3,6,12,24], "lps_tipe": "bank_umum",
     "metode_buka": "App & Cabang", "app": "BNI Mobile",
     "keterangan": "Bunga 2.25% untuk tenor 1 bln. Setoran min Rp5jt.", "warna": "#e87722"},
    {"id": "seabank",   "nama": "SeaBank",            "tipe": "Digital",      "kategori": "Bank Digital",
     "bunga_pa": 6.00,  "setoran_min": 1_000_000,    "tenor": [1,3,6,12],    "lps_tipe": "bank_umum",
     "metode_buka": "App Only", "app": "SeaBank",
     "keterangan": "Bunga 6.00% p.a. Terintegrasi dengan ekosistem Shopee.", "warna": "#2cb67d"},
    {"id": "bankjago",  "nama": "Bank Jago",          "tipe": "Digital",      "kategori": "Bank Digital",
     "bunga_pa": 6.25,  "setoran_min": 1_000_000,    "tenor": [3,6,12,24],   "lps_tipe": "bank_umum",
     "metode_buka": "App Only", "app": "Bank Jago",
     "keterangan": "Bunga 6.25% p.a tenor 12 bln. Integrasi GoTo, fitur Kantong.", "warna": "#4ae0ad"},
    {"id": "blu",       "nama": "Blu by BCA Digital", "tipe": "Digital",      "kategori": "Bank Digital",
     "bunga_pa": 6.00,  "setoran_min": 1_000_000,    "tenor": [1,3,6,12],    "lps_tipe": "bank_umum",
     "metode_buka": "App Only", "app": "Blu",
     "keterangan": "Anak usaha BCA. Bunga 6.00% p.a. Keamanan berlapis dari grup BCA.", "warna": "#6c63ff"},
    {"id": "neobank",   "nama": "Neobank (BNC)",      "tipe": "Digital",      "kategori": "Bank Digital",
     "bunga_pa": 7.50,  "setoran_min": 200_000,      "tenor": [1,3,6,12],    "lps_tipe": "bank_umum",
     "metode_buka": "App Only", "app": "Neobank",
     "keterangan": "Neo WOW bunga hingga 7.5–8% p.a. Tenor mulai 7 hari. Min Rp200rb.", "warna": "#ff6b6b"},
    {"id": "krom",      "nama": "Krom Bank",          "tipe": "Digital",      "kategori": "Bank Digital",
     "bunga_pa": 7.00,  "setoran_min": 100_000,      "tenor": [1,3,6,12],    "lps_tipe": "bank_umum",
     "metode_buka": "App Only", "app": "Krom Bank",
     "keterangan": "Bunga reguler 6–7% p.a. Promo hingga 8.75%. Tenor harian.", "warna": "#f7c59f"},
    {"id": "allo",      "nama": "Allo Bank",          "tipe": "Digital",      "kategori": "Bank Digital",
     "bunga_pa": 6.50,  "setoran_min": 500_000,      "tenor": [1,3,6,12],    "lps_tipe": "bank_umum",
     "metode_buka": "App Only", "app": "Allo Bank",
     "keterangan": "Bunga 6.5% p.a. Bagian CT Corp. Promo Transmart & Coffee Bean.", "warna": "#ff9f1c"},
    {"id": "amar",      "nama": "Amar Bank",          "tipe": "Digital",      "kategori": "Bank Digital",
     "bunga_pa": 8.50,  "setoran_min": 100_000,      "tenor": [1,3,6,12,36], "lps_tipe": "bank_umum",
     "metode_buka": "App Only", "app": "Senyumku",
     "keterangan": "Bunga hingga 8.5–9% p.a tenor panjang. Min setoran Rp100rb.", "warna": "#e040fb"},
    {"id": "superbank", "nama": "Superbank",          "tipe": "Digital",      "kategori": "Bank Digital",
     "bunga_pa": 7.50,  "setoran_min": 500_000,      "tenor": [1,3,6,12],    "lps_tipe": "bank_umum",
     "metode_buka": "App Only", "app": "Superbank",
     "keterangan": "Kolaborasi Grab & Emtek. Bunga hingga 7.5% p.a.", "warna": "#00b4d8"},
    {"id": "jenius",    "nama": "Jenius (BTPN)",      "tipe": "Digital",      "kategori": "Bank Digital",
     "bunga_pa": 4.75,  "setoran_min": 1_000_000,    "tenor": [1,3,6,12],    "lps_tipe": "bank_umum",
     "metode_buka": "App Only", "app": "Jenius",
     "keterangan": "Bunga 4.75% p.a via Maxi Saver. Pelopor bank digital Indonesia.", "warna": "#11a7d9"},
    {"id": "digibank",  "nama": "Digibank (DBS)",     "tipe": "Digital",      "kategori": "Bank Digital",
     "bunga_pa": 6.50,  "setoran_min": 1_000_000,    "tenor": [1,3,6,12],    "lps_tipe": "bank_umum",
     "metode_buka": "App Only", "app": "Digibank",
     "keterangan": "Bunga hingga 6.5% p.a. Didukung DBS Group Asia.", "warna": "#e60026"},
]

# ══════════════════════════════════════════════════════════════════
# RATE EXTRACTION  (shared by all strategies)
# ══════════════════════════════════════════════════════════════════
# Patterns ordered from most-specific to least-specific
RATE_PATTERNS = [
    # "6,50% per tahun" / "6.50% p.a" (explicit p.a label — most reliable)
    r"(\d{1,2}[,\.]\d{2})\s*%\s*(?:per\s*tahun|p\.?a\.?|pertahun)",
    # "bunga ... 6,50%" (near keyword)
    r"(?:bunga|suku\s*bunga|rate|imbal\s*hasil)[^\d]{0,40}(\d{1,2}[,\.]\d{2})\s*%",
    # Percentage near deposito keyword
    r"deposito[^\d]{0,60}(\d{1,2}[,\.]\d{2})\s*%",
    # Generic percentage (last resort — more noise, picked carefully)
    r"(\d{1,2}[,\.]\d{2})\s*%",
]

def extract_rate(text: str, low: float = 0.5, high: float = 15.0) -> Optional[float]:
    """
    Try each pattern in order. Return the first valid rate found.
    'Valid' means: numeric, within [low, high], max 2 decimal places.
    """
    for pat in RATE_PATTERNS:
        for m in re.finditer(pat, text, re.IGNORECASE):
            raw = m.group(1).replace(",", ".")
            try:
                val = round(float(raw), 2)
                if low <= val <= high:
                    return val
            except ValueError:
                continue
    return None

def extract_max_rate(text: str, low: float = 1.0, high: float = 15.0) -> Optional[float]:
    """
    Collect all rate candidates and return the maximum.
    Used for digital banks that advertise their highest rate on homepage.
    """
    candidates: list[float] = []
    for pat in RATE_PATTERNS:
        for m in re.finditer(pat, text, re.IGNORECASE):
            raw = m.group(1).replace(",", ".")
            try:
                val = round(float(raw), 2)
                if low <= val <= high:
                    candidates.append(val)
            except ValueError:
                continue
    return max(candidates) if candidates else None

# ══════════════════════════════════════════════════════════════════
# STRATEGY 1 — requests + BeautifulSoup  (fast path, no JS)
# ══════════════════════════════════════════════════════════════════
def http_fetch(url: str) -> Optional[str]:
    """Return page text or None."""
    try:
        resp = requests.get(url, headers=HTTP_HEADERS, timeout=HTTP_TIMEOUT, allow_redirects=True)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "lxml").get_text(" ", strip=True)
    except Exception as e:
        log.debug(f"    [HTTP] {url} → {e}")
        return None

# ══════════════════════════════════════════════════════════════════
# STRATEGY 2-4 — Playwright helpers
# ══════════════════════════════════════════════════════════════════

# JavaScript injected into every Playwright page to hide automation signals
STEALTH_JS = """
() => {
    // Remove webdriver flag
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // Fake plugins array
    Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
    // Fake languages
    Object.defineProperty(navigator, 'languages', { get: () => ['id-ID','id','en-US','en'] });
    // Fake chrome runtime
    window.chrome = { runtime: {} };
    // Pass permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);
}
"""

async def pw_fetch(
    context: BrowserContext,
    url: str,
    wait_for: str = "networkidle",
    timeout: int = PW_TIMEOUT,
    extra_wait_ms: int = 0,
) -> Optional[str]:
    """
    Open URL in a new Playwright tab, inject stealth JS,
    wait for network idle (or 'load'), return full text content.
    """
    page: Page = await context.new_page()
    try:
        await page.add_init_script(STEALTH_JS)
        await page.goto(url, wait_until=wait_for, timeout=timeout)
        if extra_wait_ms:
            await page.wait_for_timeout(extra_wait_ms)
        content = await page.evaluate("() => document.body.innerText")
        return content
    except PlaywrightTimeout:
        log.debug(f"    [PW] timeout on {url}")
        return None
    except Exception as e:
        log.debug(f"    [PW] error on {url}: {e}")
        return None
    finally:
        await page.close()

# ══════════════════════════════════════════════════════════════════
# PER-BANK CONFIGS
# Each bank defines:
#   urls      — list of URLs to try (in order)
#   extract   — function(text) → Optional[float]
#   js_needed — True = skip HTTP strategy, go straight to Playwright
#   wait_for  — Playwright wait strategy ("networkidle" | "load" | "domcontentloaded")
#   extra_wait— ms to wait after page load (for lazy-loaded content)
# ══════════════════════════════════════════════════════════════════

def _rate_1bln_or_max(text: str) -> Optional[float]:
    """For conventional banks: look for 1-month rate explicitly, else pick min."""
    # Try to find rate near "1 bulan" context first
    m = re.search(
        r"1\s*(?:bulan|bln|month)[^\d]{0,50}(\d{1,2}[,\.]\d{2})\s*%"
        r"|(\d{1,2}[,\.]\d{2})\s*%[^\d]{0,50}1\s*(?:bulan|bln)",
        text, re.IGNORECASE
    )
    if m:
        raw = (m.group(1) or m.group(2)).replace(",", ".")
        val = round(float(raw), 2)
        if 0.5 <= val <= 10:
            return val
    # Fallback: pick lowest deposito rate (base rate)
    candidates = []
    for pat in RATE_PATTERNS[:2]:
        for mo in re.finditer(pat, text, re.IGNORECASE):
            raw = mo.group(1).replace(",", ".")
            try:
                v = round(float(raw), 2)
                if 0.5 <= v <= 6:
                    candidates.append(v)
            except ValueError:
                pass
    return min(candidates) if candidates else None

BANK_CONFIGS: dict[str, dict] = {
    "bri": {
        "urls": [
            "https://bri.co.id/web/bri-public/produk-bunga-deposito",
            "https://www.bri.co.id/suku-bunga",
        ],
        "extract": _rate_1bln_or_max,
        "js_needed": False,
        "wait_for": "networkidle",
        "extra_wait": 1000,
    },
    "bca": {
        "urls": [
            "https://www.bca.co.id/id/informasi/kurs/Suku-Bunga-Deposito",
        ],
        "extract": _rate_1bln_or_max,
        "js_needed": False,
        "wait_for": "networkidle",
        "extra_wait": 0,
    },
    "mandiri": {
        "urls": [
            "https://www.bankmandiri.co.id/suku-bunga-deposito",
            "https://www.bankmandiri.co.id/deposito",
        ],
        "extract": _rate_1bln_or_max,
        "js_needed": False,
        "wait_for": "networkidle",
        "extra_wait": 500,
    },
    "bni": {
        "urls": [
            "https://www.bni.co.id/id-id/beranda/tentangbni/sukubunga",
            "https://www.bni.co.id/id-id/individu/produk/simpanan/deposito-berjangka",
        ],
        "extract": _rate_1bln_or_max,
        "js_needed": True,   # BNI is SPA
        "wait_for": "networkidle",
        "extra_wait": 2000,
    },
    "seabank": {
        "urls": [
            "https://www.seabank.co.id/deposit",
            "https://www.seabank.co.id/",
        ],
        "extract": lambda t: extract_max_rate(t, low=3.0),
        "js_needed": True,
        "wait_for": "networkidle",
        "extra_wait": 3000,
    },
    "bankjago": {
        "urls": [
            "https://www.jago.com/id/deposito",
            "https://www.jago.com/id/",
        ],
        "extract": lambda t: extract_max_rate(t, low=3.0),
        "js_needed": True,
        "wait_for": "networkidle",
        "extra_wait": 3000,
    },
    "blu": {
        "urls": [
            "https://blubybcadigital.id/deposito",
            "https://blubybcadigital.id/",
        ],
        "extract": lambda t: extract_max_rate(t, low=3.0),
        "js_needed": True,
        "wait_for": "networkidle",
        "extra_wait": 3000,
    },
    "neobank": {
        "urls": [
            "https://www.neobank.id/",
            "https://www.neobank.id/deposito",
        ],
        "extract": lambda t: extract_max_rate(t, low=4.0),
        "js_needed": True,
        "wait_for": "networkidle",
        "extra_wait": 3000,
    },
    "krom": {
        "urls": [
            "https://www.krombank.id/deposito",
            "https://www.krombank.id/",
        ],
        "extract": lambda t: extract_max_rate(t, low=4.0),
        "js_needed": True,
        "wait_for": "networkidle",
        "extra_wait": 3000,
    },
    "allo": {
        "urls": [
            "https://www.allobank.com/deposito",
            "https://www.allobank.com/",
        ],
        "extract": lambda t: extract_max_rate(t, low=3.0),
        "js_needed": True,
        "wait_for": "networkidle",
        "extra_wait": 3000,
    },
    "amar": {
        "urls": [
            "https://www.amarbank.co.id/produk/deposito",
            "https://www.amarbank.co.id/",
        ],
        "extract": lambda t: extract_max_rate(t, low=4.0),
        "js_needed": True,
        "wait_for": "networkidle",
        "extra_wait": 3000,
    },
    "superbank": {
        "urls": [
            "https://www.superbank.id/",
            "https://www.superbank.id/deposito",
        ],
        "extract": lambda t: extract_max_rate(t, low=4.0),
        "js_needed": True,
        "wait_for": "networkidle",
        "extra_wait": 3000,
    },
    "jenius": {
        "urls": [
            "https://www.jenius.com/id/features/maxi-saver",
            "https://www.jenius.com/",
        ],
        "extract": lambda t: extract_max_rate(t, low=2.0),
        "js_needed": True,
        "wait_for": "networkidle",
        "extra_wait": 4000,
    },
    "digibank": {
        "urls": [
            "https://www.dbs.id/digibank/id/id/deposito.page",
            "https://www.dbs.id/digibank/id/id/beranda.page",
        ],
        "extract": lambda t: extract_max_rate(t, low=2.0),
        "js_needed": False,
        "wait_for": "networkidle",
        "extra_wait": 1000,
    },
}

# ══════════════════════════════════════════════════════════════════
# SCRAPE ONE BANK  (waterfall: HTTP → PW → PW+stealth → PW+mobile)
# ══════════════════════════════════════════════════════════════════
async def scrape_bank(
    bank_id: str,
    cfg: dict,
    pw_ctx_desktop: BrowserContext,
    pw_ctx_mobile: BrowserContext,
) -> Optional[float]:
    """
    Try each URL through the waterfall of strategies.
    Return rate float or None.
    """
    urls     = cfg["urls"]
    extract  = cfg["extract"]
    need_js  = cfg["js_needed"]
    wait_for = cfg.get("wait_for", "networkidle")
    extra_ms = cfg.get("extra_wait", 0)

    for url in urls:
        # ── Strategy 1: HTTP (skip if js_needed) ────────────────
        if not need_js:
            log.debug(f"    [1/HTTP] {url}")
            text = http_fetch(url)
            if text:
                rate = extract(text)
                if rate:
                    log.info(f"    ✓ HTTP — {rate}%")
                    return rate

        # ── Strategy 2: Playwright desktop (networkidle) ─────────
        log.debug(f"    [2/PW-desktop] {url}")
        text = await pw_fetch(pw_ctx_desktop, url, wait_for=wait_for,
                              timeout=PW_TIMEOUT, extra_wait_ms=extra_ms)
        if text:
            rate = extract(text)
            if rate:
                log.info(f"    ✓ Playwright desktop — {rate}%")
                return rate

        # ── Strategy 3: Playwright desktop + longer wait ─────────
        log.debug(f"    [3/PW-desktop-slow] {url}")
        text = await pw_fetch(pw_ctx_desktop, url, wait_for="load",
                              timeout=PW_TIMEOUT_STEALTH, extra_wait_ms=extra_ms + 3000)
        if text:
            rate = extract(text)
            if rate:
                log.info(f"    ✓ Playwright slow-load — {rate}%")
                return rate

        # ── Strategy 4: Playwright mobile UA ─────────────────────
        log.debug(f"    [4/PW-mobile] {url}")
        text = await pw_fetch(pw_ctx_mobile, url, wait_for="load",
                              timeout=PW_TIMEOUT, extra_wait_ms=extra_ms + 1000)
        if text:
            rate = extract(text)
            if rate:
                log.info(f"    ✓ Playwright mobile — {rate}%")
                return rate

    return None   # all strategies exhausted

# ══════════════════════════════════════════════════════════════════
# LOAD EXISTING JSON  (for fallback values)
# ══════════════════════════════════════════════════════════════════
def load_existing() -> dict[str, dict]:
    if OUTPUT_FILE.exists():
        try:
            with open(OUTPUT_FILE, encoding="utf-8") as f:
                data = json.load(f)
            return {b["id"]: b for b in data.get("banks", [])}
        except Exception as e:
            log.warning(f"Could not load existing data: {e}")
    return {}

# ══════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════
async def main() -> None:
    log.info("=" * 65)
    log.info("DepositoPlus Playwright Scraper")
    log.info(f"Time : {datetime.now(WIB).strftime('%Y-%m-%d %H:%M WIB')}")
    log.info("=" * 65)

    existing = load_existing()
    results  = []
    stats    = {"scraped": 0, "fallback": 0, "changed": 0}

    async with async_playwright() as pw:
        # Launch headless Chromium once, reuse for all banks
        browser: Browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )

        # Desktop context (stealth)
        ctx_desktop: BrowserContext = await browser.new_context(
            user_agent=DESKTOP_UA,
            viewport={"width": 1440, "height": 900},
            locale="id-ID",
            timezone_id="Asia/Jakarta",
            java_script_enabled=True,
            bypass_csp=True,
            extra_http_headers={
                "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
            },
        )

        # Mobile context (some sites serve simpler pages to mobile)
        ctx_mobile: BrowserContext = await browser.new_context(
            user_agent=MOBILE_UA,
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            locale="id-ID",
            timezone_id="Asia/Jakarta",
            java_script_enabled=True,
            bypass_csp=True,
        )

        for seed in SEED_DATA:
            bank_id = seed["id"]
            cfg     = BANK_CONFIGS.get(bank_id)
            log.info(f"\n── {seed['nama']} ({bank_id}) ──────────────────────────")

            scraped_rate: Optional[float] = None
            if cfg:
                try:
                    scraped_rate = await scrape_bank(bank_id, cfg, ctx_desktop, ctx_mobile)
                except Exception as e:
                    log.error(f"  Unexpected error: {e}")
            else:
                log.warning("  No config — skip to fallback")

            # Jitter between banks to be polite
            await asyncio.sleep(random.uniform(JITTER_MIN, JITTER_MAX))

            # Decide final rate
            if scraped_rate is not None:
                status     = "scraped"
                final_rate = scraped_rate
                stats["scraped"] += 1
                old = existing.get(bank_id, {}).get("bunga_pa")
                if old and abs(scraped_rate - old) >= 0.01:
                    stats["changed"] += 1
                    log.info(f"  ★ RATE CHANGED: {old}% → {scraped_rate}%")
                else:
                    log.info(f"  ✓ Rate confirmed: {scraped_rate}% p.a")
            else:
                fallback = (existing.get(bank_id, {}).get("bunga_pa") or seed["bunga_pa"])
                log.warning(f"  ✗ All strategies failed — fallback {fallback}%")
                status     = "fallback"
                final_rate = fallback
                stats["fallback"] += 1

            results.append({
                **seed,
                "bunga_pa":      final_rate,
                "scrape_status": status,
                "last_updated":  datetime.now(WIB).isoformat(),
            })

        await ctx_desktop.close()
        await ctx_mobile.close()
        await browser.close()

    # ── Write output ────────────────────────────────────────────
    output = {
        "generated_at":  datetime.now(WIB).isoformat(),
        "lps_bank_umum": 3.50,
        "lps_bpr":       6.75,
        "stats":         stats,
        "banks":         results,
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    log.info("\n" + "=" * 65)
    log.info(f"Done! Scraped: {stats['scraped']} | Fallback: {stats['fallback']} | Changed: {stats['changed']}")
    log.info(f"Output: {OUTPUT_FILE}")
    log.info("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
