# Sainsbury's Product Scraper

Discovers all food products on Sainsbury's online groceries via keyword search sweeps, fetches nutrition data for each, and stores everything in a SQLite database.

Designed to be re-run — skips fresh data and only re-fetches stale entries (>14 days old by default).

## Setup

```
npm install
```

Requires Node 22+ (for built-in `node:sqlite`) and a Chromium browser installed locally (Chrome, Brave, or Edge) for cookie harvesting.

## Usage

```bash
# Full run: discovery sweep + nutrition fetch
npx tsx src/main.tsx

# Discovery only (find products, skip nutrition)
npx tsx src/main.tsx --discovery-only

# Detail only (fetch nutrition for already-discovered products)
npx tsx src/main.tsx --detail-only

# Re-parse stored HTML with updated parser (no API calls)
npx tsx src/main.tsx --reparse

# Dry run (show dashboard, no API calls)
npx tsx src/main.tsx --dry-run

# Export nutrition data as JSON (for browser extension)
npx tsx src/main.tsx --export

# Export after a full scrape run
npx tsx src/main.tsx --export-after

# Custom export path
npx tsx src/main.tsx --export --export-path ../extension/data/products.json

# Custom options
npx tsx src/main.tsx --db ./data/other.db --max-age 7
```

Press `q` or `Ctrl+C` to stop cleanly — all progress is saved and the next run picks up where you left off.

## How it works

**Phase 1 — Discovery:** Searches single characters (b–z, 0–9) with `page_size=200`, paginating through all results. Each product is upserted into SQLite with pricing and category data. Non-food categories (pet, household, baby, etc.) are flagged.

**Phase 2 — Detail:** For each food product, fetches the detail endpoint to get `details_html`, decodes it from base64, stores the raw HTML, and parses the nutrition table. Priority order: re-parse failures first (no API call needed), then unfetched, then stale.

**Phase 2b — Reparse:** Re-runs the parser against all stored HTML without any network access. Use this to iterate on parser improvements.

## Output

SQLite database at `./data/sainsburys.db` with tables:

- **products** — identity, pricing, nutrition per-100g/ml and per-serving, parse status
- **product_html** — raw decoded HTML for offline re-parsing
- **discovery_sweeps** — per-character sweep timestamps
- **errors** — error log

## Querying

```sql
-- Highest protein-per-calorie foods
SELECT name, calories_per_100, protein_per_100, protein_pct
FROM products WHERE parse_status = 'ok' AND is_food = 1
ORDER BY protein_pct DESC LIMIT 20;

-- Parse status breakdown
SELECT parse_status, COUNT(*) FROM products
WHERE is_food = 1 GROUP BY 1;

-- Check failures
SELECT name, parse_error FROM products
WHERE parse_status = 'failed' LIMIT 10;
```
