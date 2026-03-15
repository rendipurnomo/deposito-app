# DepositoPlus — Screener & Kalkulator Deposito Indonesia

Website React dengan scraper otomatis Playwright untuk data bunga deposito real.

## Quick Start

```bash
npm install && npm run dev
# buka http://localhost:5173
```

## Arsitektur Scraper

```
GitHub Actions  (Senin 08:00 WIB, gratis)
    │
    ▼
scraper.py — Playwright Chromium (headless)
    │
    ├─ Strategy 1: requests + BeautifulSoup  (fast, no JS)
    ├─ Strategy 2: Playwright desktop        (full JS render)
    ├─ Strategy 3: Playwright slow-load      (lazy content)
    ├─ Strategy 4: Playwright mobile UA      (anti-bot bypass)
    └─ Strategy 5: Fallback → last known rate
    │
    ▼
scraper/bank_rates.json  →  Git commit + push
    │
    ▼
React app fetch JSON saat halaman dibuka
```

## Setup Auto-Scraper

1. Push repo ke GitHub
2. Buka tab **Actions** → aktifkan workflow
3. Jalankan manual pertama kali: Actions → "Weekly Bank Rate Scraper" → **Run workflow**
4. Update `RATES_JSON_URL` di `src/App.jsx`:
   ```js
   const RATES_JSON_URL =
     'https://raw.githubusercontent.com/USERNAME/REPO/main/scraper/bank_rates.json'
   ```

## Jalankan Scraper Lokal

```bash
cd scraper
pip install -r requirements.txt
playwright install chromium --with-deps
python scraper.py
```

## Waterfall Strategy per Bank

| Strategy | Engine | Kegunaan |
|---|---|---|
| 1 | `requests` + BeautifulSoup | Bank konvensional (static HTML) |
| 2 | Playwright desktop | SPA / React / Vue |
| 3 | Playwright slow-load +3s | Lazy-loaded content |
| 4 | Playwright mobile UA | Beberapa site unblock mobile |
| 5 | Fallback JSON | Jika semua gagal |

## Tech Stack

React 18 + Vite · Recharts · Python + Playwright · GitHub Actions
