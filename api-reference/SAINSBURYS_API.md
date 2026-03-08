# Sainsbury's Groceries API Reference

## Overview

Sainsbury's online groceries runs a React SPA at `/gol-ui/` backed by a JSON
API at `/groceries-api/`. Both are served through Akamai CDN with **Bot
Manager** protection — the JSON API is only accessible from sessions that have
completed the Akamai JS sensor challenge.

### Authentication / Bot Protection

Akamai Bot Manager sets the `_abck` cookie. A headless browser (puppeteer-core)
must visit the site first to solve the challenge, then the resulting cookies can
be used with plain HTTP clients (axios, fetch, curl).

See `src/cookies.ts` for the implementation. The cookies typically last several
hours before needing refresh.

**Required headers for API requests:**
- `Cookie` — the full set of cookies from the browser session
- `Referer: https://www.sainsburys.co.uk/gol-ui/groceries/`
- `Sec-Fetch-Site: same-origin` / `Sec-Fetch-Mode: cors`
- Standard browser `User-Agent`

---

## Working Endpoints

All endpoints are under:
```
https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1
```

### 1. Keyword Search (primary endpoint)

```
GET /product?filter[keyword]={term}&page_size={n}&page_number={n}
```

This is the main working endpoint for discovering products.

**Parameters:**

| Param | Required | Example | Notes |
|-------|----------|---------|-------|
| `filter[keyword]` | Yes | `chicken breast` | Search term. Single letters work (except `a`). |
| `page_size` | No | `60` | Default 60. Officially 30/60/90, but **120 and 200 also work**. |
| `page_number` | No | `1` | 1-based. |

**Additional parameters (undocumented but functional):**

| Param | Example | Notes |
|-------|---------|-------|
| `sort` | `PRICE_ASC` | Sort order. Options: `FAVOURITES_FIRST` (default), `PRICE_ASC`, `PRICE_DESC`, `NAME_ASC`, `NAME_DESC`, `TOP_SELLERS`, `RATINGS_DESC` |

**Response shape:** `{ products: Product[], controls: Controls }`

See [Data Schema](#data-schema) below for full `Product` and `Controls` types.

**Key notes:**
- `details_html` is **NOT** included in search results — use the product detail endpoint for nutrition.
- `full_url` uses the format `/shop/gb/groceries/product/details/{slug}` (differs from detail endpoint).
- `zone`, `breadcrumbs`, `description`, `assets.images` are present but **empty/null** in search results.

**Price fields:**
- `unit_price.price` — price per measure (e.g. per kg). `unit_price.measure` is `"kg"`, `"100g"`, `"ltr"`, etc.
- `retail_price.price` — shelf price per unit.
- `nectar_price` — optional, present only when a Nectar promotion is active. Contains `retail_price`, `unit_price`, `measure`, `url`.

### 2. Product Detail (with nutrition)

```
GET /product?filter[product_seo_url]={slug}
```

Returns full product data **including `details_html`** — a base64-encoded HTML
blob containing the nutrition table, ingredients, allergens, etc.

**Slug format:** Just the product name slug from the `full_url`, e.g.:
```
full_url: https://www.sainsburys.co.uk/shop/gb/groceries/product/details/sainsburys-chicken-breast-fillets-300g
→ slug: sainsburys-chicken-breast-fillets-300g
```

Both of these work:
- `filter[product_seo_url]=sainsburys-chicken-breast-fillets-300g` ✓
- `filter[product_seo_url]=gb/groceries/sainsburys-chicken-breast-fillets-300g` ✓

These do NOT work:
- `filter[product_seo_url]=details/...` ✗ (400)
- `filter[product_seo_url]=gb%2Fgroceries%2F{category}%2F{slug}` ✗ (400 — the old proteinshop format is broken)

**The `details_html` field (base64-decoded):**
```html
<ProductContent>
  <HTMLContent>
    <div id="accordion-content">
      <h3>Description</h3>
      <div class="productText">...</div>
      ...
      <table class="nutritionTable">
        <thead><tr><th>Typical Values</th><th>Per 100g</th><th>Per Serving</th></tr></thead>
        <tbody>
          <tr><th>Energy (kJ)</th><td>456kJ</td><td>684kJ</td></tr>
          <tr><td>108kcal</td><td>162kcal</td></tr>
          <tr><th>Fat</th><td>1.1g</td><td>1.7g</td></tr>
          <tr><th>of which saturates</th><td>0.3g</td><td>0.5g</td></tr>
          <tr><th>Carbohydrate</th><td>0.0g</td><td>0.0g</td></tr>
          <tr><th>of which sugars</th><td>0.0g</td><td>0.0g</td></tr>
          <tr><th>Protein</th><td>23.1g</td><td>34.7g</td></tr>
          <tr><th>Salt</th><td>0.18g</td><td>0.27g</td></tr>
        </tbody>
      </table>
    </div>
  </HTMLContent>
</ProductContent>
```

The kcal row has **no `<th>`** — just `<td>` cells. This is important for parsing.

**Detail-only fields** (not present in keyword search results):

| Field | Type | Example |
|-------|------|---------|
| `sainId` | `string` | `"w7q063n7"` — internal Sainsbury's ID |
| `details_html` | `string` | Base64-encoded HTML (nutrition, ingredients, allergens, cooking instructions, storage, packaging, manufacturer) |
| `original_unit_price` | `UnitPrice` | Same shape as `unit_price` — the pre-promotion price |
| `hfss_restriction` | `HfssRestriction[]` | HFSS (high fat/sugar/salt) regulatory data per country (ENG, SCT, WLS, NIR) |
| `not_for_eu` | `boolean` | EU availability flag |
| `short_description` | `string` | Brief product description |
| `health_classification` | `object` | `{ health_rating_score_value: "5" }` |
| `promise` | `object` | Delivery promise info (usually empty) |

**Fields populated in detail but empty in search:**

| Field | In search | In detail |
|-------|-----------|-----------|
| `full_url` | `/shop/gb/groceries/product/details/{slug}` | `/gol-ui/product/{slug}` |
| `zone` | `null` | `"Meat & fish"` |
| `breadcrumbs` | `[]` | `[{ label, url }, ...]` (store hierarchy) |
| `description` | `[]` | `["text", ...]` (product description lines) |
| `assets.images` | `[]` | Full image set with multiple sizes (100x100 to 2365x2365) |

---

## Non-Working / Changed Endpoints

These endpoints from the old codebase **no longer work**:

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /taxonomy` | 405 | Does not exist |
| `GET /categories` | 405 | Does not exist |
| `GET /category/products?filter[category]=X` | 405 | Does not exist |
| `?filter[category]=X` on search | 200 but 0 results | Category filter exists but always returns empty |
| `?filter[product_uid]=X` | 405 | Does not exist as a standalone filter |
| `?filter[keyword]=&filter[product_uid]=X` | 200 but empty | UID filter returns no data |

---

## Product Enumeration Strategy

Since category browsing is non-functional, the enumeration approach uses
**keyword search sweeps**:

1. **Search by single character** — each letter/digit returns different result
   sets. `"p"` alone returns ~29,500 products. Coverage:

   | Term | Products | Term | Products |
   |------|----------|------|----------|
   | p | 29,584 | s | 10,117 |
   | 2 | 2,378 | 1 | 1,698 |
   | x | 1,265 | b | 1,022 |
   | ... | ... | a | **0** (quirk) |

2. **Paginate through results** — use `page_size=200` (works despite not being
   in `size_options`) and iterate `page_number` up to `controls.page.last`.

3. **Deduplicate by `product_uid`** — different search terms will return
   overlapping products.

4. **Fetch nutrition** — for each unique product, extract the slug from
   `full_url` and call the product detail endpoint to get `details_html`.

5. **Rate limit** — stagger requests by at least 500ms–1000ms.

### Estimated coverage

A sweep of all 36 single-character searches should capture the vast majority
of the store's ~30,000+ products. The largest result set (`"p"`) alone covers
most items since "Sainsbury's" appears in most product names.

---

## Data Schema

### Product (complete — all fields from live API)

Fields marked with **(D)** are only present in the **detail** endpoint response.

```typescript
interface Product {
  // ── Identity ──
  sainId: string;                         // (D) internal Sainsbury's ID, e.g. "w7q063n7"
  product_uid: string;                    // unique product ID, e.g. "7977681"
  favourite_uid: string | null;           // always null without user session
  eans: string[];                         // EAN barcodes, e.g. ["0000000366991"]
  product_type: string;                   // e.g. "BASIC"

  // ── Display ──
  name: string;                           // full product name
  image: string;                          // large image URL (wcsstore CDN)
  image_zoom: string | null;              // usually null
  image_thumbnail: string;                // medium image URL
  image_thumbnail_small: string;          // small image URL
  full_url: string;                       // SEO URL (format differs: see note below)

  // ── Pricing ──
  unit_price: UnitPrice;                  // price per measure (e.g. per kg)
  retail_price: RetailPrice;              // shelf price per unit
  original_unit_price: UnitPrice;         // (D) pre-promotion unit price
  nectar_price?: NectarPrice;             // optional — present when Nectar promotion active

  // ── Availability & flags ──
  is_available: boolean;
  is_alcoholic: boolean;
  is_spotlight: boolean;
  is_intolerant: boolean;
  is_mhra: boolean;                       // medicines regulation flag
  is_supply_chain_orderable: boolean;
  not_for_eu: boolean;                    // (D) EU availability flag

  // ── Promotions & labels ──
  promotions: Promotion[];
  badges: unknown[];                      // usually empty
  labels: Label[];
  display_icons: string[];                // label_uid values, e.g. ["Chilled", "British"]
  header?: { text: string; type: string };// optional, e.g. { text: "Nectar price", type: "NECTAR" }

  // ── Categorisation ──
  categories: Array<{ id: string; name: string }>;
  zone: string | null;                    // null in search, populated in detail (e.g. "Meat & fish")
  department: string | null;              // usually null
  breadcrumbs: Breadcrumb[];              // empty in search, populated in detail
  attributes: { brand: string[] };

  // ── Content ──
  description: string[];                  // empty in search, populated in detail
  short_description: string;              // (D) brief product summary
  important_information: string[];        // legal disclaimers
  details_html: string;                   // (D) base64-encoded HTML with nutrition, ingredients, etc.
  attachments: unknown[];                 // usually empty

  // ── Media ──
  assets: {
    plp_image: string;                    // groceries CDN image URL
    images: AssetImage[];                 // empty in search, multi-size in detail
    video: unknown[];                     // usually empty
  };

  // ── Reviews ──
  reviews: {
    is_enabled: boolean;
    product_uid: string;
    total: number;                        // review count
    average_rating: number;               // e.g. 3.034
  };

  // ── Regulatory ──
  hfss_restriction: HfssRestriction[];    // (D) HFSS data per UK country
  health_classification: {                // (D)
    health_rating_score_value: string;    // e.g. "5"
  };

  // ── Delivery ──
  promise: {                              // (D) usually empty
    type: string;
    earliest_promise_date: string | null;
    last_amendment_date: string | null;
    status: { label: string; type: string };
  };

  // ── Navigation ──
  associations: unknown[];                // usually empty
  pdp_deep_link: string;                  // legacy WCS product URL
}
```

**Sub-types:**

```typescript
interface UnitPrice {
  price: number;          // e.g. 7.31
  measure: string;        // "kg", "100g", "ltr", "100ml", etc.
  measure_amount: number; // usually 1
}

interface RetailPrice {
  price: number;          // shelf price, e.g. 2.34
  measure: string;        // usually "unit"
}

interface NectarPrice {
  retail_price: number;
  unit_price: number;
  measure: string;
  url: string;
  category_seo_url: string;
}

interface Promotion {
  promotion_uid: string;
  icon: string;                     // image URL for promo badge
  link: string;                     // e.g. "/gol-ui/promo-lister/10724414"
  strap_line: string;               // e.g. "Buy 1 for 3"
  start_date: string;               // ISO 8601
  end_date: string;                 // ISO 8601
  original_price: number;
  promo_mechanic_id: string;
  is_nectar: boolean;
  promo_type: string;               // e.g. "SIMPLE_FIXED_PRICE"
  promo_group: string;              // e.g. "simple"
}

interface Label {
  label_uid: string;                // e.g. "Chilled", "British", "Aldi Price Match"
  text: string;
  alt_text: string;
  color: string;                    // hex, e.g. "#005096"
  link?: string;                    // optional URL
  link_opens_in_new_window: boolean;
}

interface Breadcrumb {
  label: string;                    // e.g. "Meat & fish"
  url: string;                      // e.g. "gb/groceries/meat-fish"
}

interface AssetImage {
  id: string;
  sizes: Array<{
    width: number;                  // 100, 140, 300, 640, 1500, 2365
    height: number;
    url: string;
  }>;
}

interface HfssRestriction {
  country: string;                  // "ENG", "SCT", "WLS", "NIR"
  restricted: boolean;
  hfss_category: string;           // e.g. "Out of scope or Product not in a legislative category"
  hfss_score: number;
  last_change_date: string;         // ISO 8601
}
```

**`full_url` format difference:**
- Search endpoint: `https://www.sainsburys.co.uk/shop/gb/groceries/product/details/{slug}`
- Detail endpoint: `https://www.sainsburys.co.uk/gol-ui/product/{slug}`
- The slug is the same in both — use `extractSlug()` to get it.

### NutritionDetails (parsed from details_html)

```typescript
interface NutritionDetails {
  caloriesPer100: number | null;
  proteinPer100g: number | null;
  fatPer100g: number | null;
  satFatPer100g: number | null;
  carbPer100g: number | null;
  sugarPer100g: number | null;
  proteinPerServing: number | null;
  proteinPercentage: number | null;   // % of calories from protein
  fatPercentage: number | null;
  carbPercentage: number | null;
  satFatPercentage: number | null;
  sugarPercentage: number | null;
}
```

Calorie percentage formula: `(grams_per_100g × cal_per_gram / kcal_per_100) × 100`
- Protein: 4 cal/g
- Fat: 9 cal/g
- Carbs: 4 cal/g

### Controls (pagination & filtering metadata)

```typescript
interface Controls {
  total_record_count: number;
  returned_record_count: number;
  page: {
    active: number;
    first: number;
    last: number;           // total page count
    size: number;
    size_options: number[]; // [30, 60, 90] — but 120 and 200 also work
  };
  filters: Filter[];
  sort: {
    active: string;         // e.g. "FAVOURITES_FIRST"
    options: Array<{ display: string; value: string }>;
  };
}

interface Filter {
  key: string;              // e.g. "cat_Category", "nav_Brand", "diet_Dietary_and_Lifestyle_Options"
  label: string;            // e.g. "Category", "Brand"
  type: string;             // "SINGLE_SELECT" or "MULTI_SELECT"
  values: Array<{
    id?: string;            // filter ID (omitted for "All" options)
    label: string;
    value: string;          // URL-safe value
    selected: boolean;
    enabled: boolean;
  }>;
}
```

**Available filter keys:**

| Key | Label | Type | Notes |
|-----|-------|------|-------|
| `nav_Filter-Your-Results` | Filter Your Results | MULTI_SELECT | Favourites, New, Offers & Nectar Prices |
| `nav_Brand` | Brand | MULTI_SELECT | Brand names (Sainsbury's, Taste the Difference, etc.) |
| `diet_Dietary_and_Lifestyle_Options` | Dietary and Lifestyle Options | MULTI_SELECT | British, Halal, Organic, Keep Frozen, etc. |
| `cat_Category` | Category | SINGLE_SELECT | Top-level departments (Meat & fish, Frozen, etc.) |
| `subcat_SubCategory` | SubCategory | SINGLE_SELECT | Usually disabled |
| `aisle_Aisle` | Aisle | SINGLE_SELECT | Usually disabled |
| `shelf_Shelf` | Shelf | SINGLE_SELECT | Usually disabled |

**Note:** While filters appear in the response, `filter[category]` on the search endpoint always returns 0 results (see Non-Working Endpoints).

---

## Changelog vs. proteinshop (2023)

| Aspect | proteinshop | Current (2026) |
|--------|-------------|----------------|
| Product detail URL filter | `gb%2Fgroceries%2F{category}%2F{slug}` | Just `{slug}` (no category prefix) |
| `details_html` in search | Not checked | **Not present** — requires separate detail call |
| Category browsing | Worked via HTML scraping | **Broken** — filter returns 0, HTML pages 403 |
| Taxonomy endpoint | Assumed to exist | **Does not exist** (405) |
| Enumeration strategy | Category pages → product list | Keyword search sweeps |
| Bot protection | None (browser extension) | Akamai Bot Manager (needs headless browser cookies) |
| Page size | 120 | 200 works (officially 30/60/90) |
