import { DatabaseSync } from "node:sqlite";
import type { NutritionResult } from "./types.js";

export class ScraperDb {
  private db: DatabaseSync;

  constructor(filePath: string) {
    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        product_uid       TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        slug              TEXT NOT NULL,
        eans              TEXT,
        brand             TEXT,
        categories        TEXT,
        is_available      INTEGER NOT NULL DEFAULT 1,
        is_food           INTEGER NOT NULL DEFAULT 1,

        unit_price        REAL,
        unit_measure      TEXT,
        retail_price      REAL,

        nutrition_unit        TEXT,
        energy_kj_per_100     REAL,
        calories_per_100      REAL,
        fat_per_100           REAL,
        sat_fat_per_100       REAL,
        carbs_per_100         REAL,
        sugar_per_100         REAL,
        fibre_per_100         REAL,
        protein_per_100       REAL,
        salt_per_100          REAL,

        serving_size          TEXT,
        energy_kj_per_serving REAL,
        calories_per_serving  REAL,
        fat_per_serving       REAL,
        sat_fat_per_serving   REAL,
        carbs_per_serving     REAL,
        sugar_per_serving     REAL,
        fibre_per_serving     REAL,
        protein_per_serving   REAL,
        salt_per_serving      REAL,

        protein_pct           REAL,
        fat_pct               REAL,
        carb_pct              REAL,

        parse_status          TEXT,
        parse_error           TEXT,

        discovered_at         TEXT NOT NULL,
        detail_fetched_at     TEXT,
        listing_updated_at    TEXT NOT NULL,
        parsed_at             TEXT
      );

      CREATE TABLE IF NOT EXISTS product_html (
        product_uid   TEXT PRIMARY KEY REFERENCES products(product_uid),
        html          TEXT NOT NULL,
        fetched_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS discovery_sweeps (
        search_term   TEXT PRIMARY KEY,
        last_swept_at TEXT NOT NULL,
        product_count INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS errors (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        product_uid   TEXT,
        phase         TEXT NOT NULL,
        error_message TEXT NOT NULL,
        http_status   INTEGER,
        occurred_at   TEXT NOT NULL
      );
    `);

    // Create indexes (IF NOT EXISTS handles re-runs)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_products_parse_status
        ON products (parse_status) WHERE is_food = 1;
      CREATE INDEX IF NOT EXISTS idx_products_stale_detail
        ON products (detail_fetched_at) WHERE is_food = 1;
      CREATE INDEX IF NOT EXISTS idx_products_slug
        ON products (slug);
    `);
  }

  // ─── Discovery sweeps ────────────────────────────────────────────

  getSweepAge(term: string): number | null {
    const row = this.db
      .prepare("SELECT last_swept_at FROM discovery_sweeps WHERE search_term = ?")
      .get(term) as { last_swept_at: string } | undefined;
    if (!row) return null;
    return (Date.now() - new Date(row.last_swept_at).getTime()) / 86_400_000;
  }

  recordSweep(term: string, count: number): void {
    this.db
      .prepare(
        `INSERT INTO discovery_sweeps (search_term, last_swept_at, product_count)
         VALUES (?, ?, ?)
         ON CONFLICT(search_term) DO UPDATE SET last_swept_at = excluded.last_swept_at,
                                                product_count = excluded.product_count`
      )
      .run(term, new Date().toISOString(), count);
  }

  // ─── Product upsert ──────────────────────────────────────────────

  upsertProduct(
    product: {
      product_uid: string;
      name: string;
      slug: string;
      eans?: string[];
      brand?: string;
      categories?: Array<{ id: string; name: string }>;
      is_available: boolean;
      unit_price?: number;
      unit_measure?: string;
      retail_price?: number;
    },
    isFood: boolean
  ): "new" | "updated" {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare("SELECT product_uid FROM products WHERE product_uid = ?")
      .get(product.product_uid);

    if (existing) {
      this.db
        .prepare(
          `UPDATE products SET
            name = ?, slug = ?, eans = ?, brand = ?, categories = ?,
            is_available = ?, is_food = ?,
            unit_price = ?, unit_measure = ?, retail_price = ?,
            listing_updated_at = ?
          WHERE product_uid = ?`
        )
        .run(
          product.name,
          product.slug,
          product.eans ? JSON.stringify(product.eans) : null,
          product.brand ?? null,
          product.categories ? JSON.stringify(product.categories) : null,
          product.is_available ? 1 : 0,
          isFood ? 1 : 0,
          product.unit_price ?? null,
          product.unit_measure ?? null,
          product.retail_price ?? null,
          now,
          product.product_uid
        );
      return "updated";
    }

    this.db
      .prepare(
        `INSERT INTO products (
          product_uid, name, slug, eans, brand, categories,
          is_available, is_food,
          unit_price, unit_measure, retail_price,
          discovered_at, listing_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        product.product_uid,
        product.name,
        product.slug,
        product.eans ? JSON.stringify(product.eans) : null,
        product.brand ?? null,
        product.categories ? JSON.stringify(product.categories) : null,
        product.is_available ? 1 : 0,
        isFood ? 1 : 0,
        product.unit_price ?? null,
        product.unit_measure ?? null,
        product.retail_price ?? null,
        now,
        now
      );
    return "new";
  }

  // ─── Detail queue ────────────────────────────────────────────────

  getDetailQueue(maxAgeDays: number): Array<{ product_uid: string; slug: string; hasHtml: boolean; isFailed: boolean }> {
    const staleDate = new Date(
      Date.now() - maxAgeDays * 86_400_000
    ).toISOString();

    // Priority 1: failed with stored HTML (re-parse only, no API call)
    const failedWithHtml = this.db
      .prepare(
        `SELECT p.product_uid, p.slug, 1 as has_html, 1 as is_failed
         FROM products p
         JOIN product_html ph ON ph.product_uid = p.product_uid
         WHERE p.is_food = 1
           AND p.parse_status IN ('failed', 'partial')
         ORDER BY p.parsed_at ASC`
      )
      .all() as Array<{ product_uid: string; slug: string; has_html: number; is_failed: number }>;

    // Priority 2: never fetched (skip products with broken slugs — slug=name means no real slug)
    const unfetched = this.db
      .prepare(
        `SELECT product_uid, slug, 0 as has_html, 0 as is_failed
         FROM products
         WHERE is_food = 1 AND detail_fetched_at IS NULL
           AND slug != name
         ORDER BY discovered_at ASC`
      )
      .all() as Array<{ product_uid: string; slug: string; has_html: number; is_failed: number }>;

    // Priority 3: stale
    const stale = this.db
      .prepare(
        `SELECT p.product_uid, p.slug, 0 as has_html, 0 as is_failed
         FROM products p
         WHERE p.is_food = 1
           AND p.detail_fetched_at IS NOT NULL
           AND p.detail_fetched_at < ?
           AND (p.parse_status IS NULL OR p.parse_status NOT IN ('failed', 'partial'))
         ORDER BY p.detail_fetched_at ASC`
      )
      .all(staleDate) as Array<{ product_uid: string; slug: string; has_html: number; is_failed: number }>;

    return [
      ...failedWithHtml.map((r) => ({
        product_uid: r.product_uid,
        slug: r.slug,
        hasHtml: true,
        isFailed: true,
      })),
      ...unfetched.map((r) => ({
        product_uid: r.product_uid,
        slug: r.slug,
        hasHtml: false,
        isFailed: false,
      })),
      ...stale.map((r) => ({
        product_uid: r.product_uid,
        slug: r.slug,
        hasHtml: false,
        isFailed: false,
      })),
    ];
  }

  // ─── HTML storage ────────────────────────────────────────────────

  storeHtml(uid: string, html: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO product_html (product_uid, html, fetched_at)
         VALUES (?, ?, ?)
         ON CONFLICT(product_uid) DO UPDATE SET html = excluded.html, fetched_at = excluded.fetched_at`
      )
      .run(uid, html, now);
    this.db
      .prepare("UPDATE products SET detail_fetched_at = ? WHERE product_uid = ?")
      .run(now, uid);
  }

  getHtml(uid: string): string | null {
    const row = this.db
      .prepare("SELECT html FROM product_html WHERE product_uid = ?")
      .get(uid) as { html: string } | undefined;
    return row?.html ?? null;
  }

  // ─── Nutrition update ────────────────────────────────────────────

  updateNutrition(uid: string, result: NutritionResult): void {
    const now = new Date().toISOString();

    // Calculate derived percentages
    let proteinPct: number | null = null;
    let fatPct: number | null = null;
    let carbPct: number | null = null;

    if (result.caloriesPer100 && result.caloriesPer100 > 0) {
      if (result.proteinPer100 != null)
        proteinPct = (result.proteinPer100 * 4 * 100) / result.caloriesPer100;
      if (result.fatPer100 != null)
        fatPct = (result.fatPer100 * 9 * 100) / result.caloriesPer100;
      if (result.carbsPer100 != null)
        carbPct = (result.carbsPer100 * 4 * 100) / result.caloriesPer100;
    }

    this.db
      .prepare(
        `UPDATE products SET
          nutrition_unit = ?,
          energy_kj_per_100 = NULL, calories_per_100 = ?,
          fat_per_100 = ?, sat_fat_per_100 = ?,
          carbs_per_100 = ?, sugar_per_100 = ?,
          fibre_per_100 = ?, protein_per_100 = ?, salt_per_100 = ?,
          serving_size = ?,
          energy_kj_per_serving = NULL, calories_per_serving = ?,
          fat_per_serving = ?, sat_fat_per_serving = ?,
          carbs_per_serving = ?, sugar_per_serving = ?,
          fibre_per_serving = ?, protein_per_serving = ?, salt_per_serving = ?,
          protein_pct = ?, fat_pct = ?, carb_pct = ?,
          parse_status = ?, parse_error = ?, parsed_at = ?
        WHERE product_uid = ?`
      )
      .run(
        result.nutritionUnit ?? null,
        result.caloriesPer100 ?? null,
        result.fatPer100 ?? null,
        result.satFatPer100 ?? null,
        result.carbsPer100 ?? null,
        result.sugarPer100 ?? null,
        result.fibrePer100 ?? null,
        result.proteinPer100 ?? null,
        result.saltPer100 ?? null,
        result.servingSize ?? null,
        result.caloriesPerServing ?? null,
        result.fatPerServing ?? null,
        result.satFatPerServing ?? null,
        result.carbsPerServing ?? null,
        result.sugarPerServing ?? null,
        result.fibrePerServing ?? null,
        result.proteinPerServing ?? null,
        result.saltPerServing ?? null,
        proteinPct,
        fatPct,
        carbPct,
        result.status,
        result.error ?? null,
        now,
        uid
      );
  }

  // ─── Reparse helpers ─────────────────────────────────────────────

  getAllHtmlProducts(): Array<{ product_uid: string; name: string; html: string }> {
    return this.db
      .prepare(
        `SELECT ph.product_uid, p.name, ph.html
         FROM product_html ph
         JOIN products p ON p.product_uid = ph.product_uid
         WHERE p.is_food = 1
         ORDER BY ph.product_uid`
      )
      .all() as Array<{ product_uid: string; name: string; html: string }>;
  }

  getHtmlProductCount(): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM product_html ph
         JOIN products p ON p.product_uid = ph.product_uid
         WHERE p.is_food = 1`
      )
      .get() as { cnt: number };
    return row.cnt;
  }

  getHtmlProductsBatch(
    limit: number,
    offset: number
  ): Array<{ product_uid: string; name: string; html: string }> {
    return this.db
      .prepare(
        `SELECT ph.product_uid, p.name, ph.html
         FROM product_html ph
         JOIN products p ON p.product_uid = ph.product_uid
         WHERE p.is_food = 1
         ORDER BY ph.product_uid
         LIMIT ? OFFSET ?`
      )
      .all(limit, offset) as Array<{ product_uid: string; name: string; html: string }>;
  }

  getParseStatusCounts(): { ok: number; partial: number; failed: number; no_table: number } {
    const rows = this.db
      .prepare(
        `SELECT parse_status, COUNT(*) as cnt
         FROM products
         WHERE is_food = 1 AND detail_fetched_at IS NOT NULL
         GROUP BY parse_status`
      )
      .all() as Array<{ parse_status: string | null; cnt: number }>;

    const counts = { ok: 0, partial: 0, failed: 0, no_table: 0 };
    for (const row of rows) {
      if (row.parse_status === "ok") counts.ok = row.cnt;
      else if (row.parse_status === "partial") counts.partial = row.cnt;
      else if (row.parse_status === "failed") counts.failed = row.cnt;
      else if (row.parse_status === "no_table") counts.no_table = row.cnt;
    }
    return counts;
  }

  // ─── Error logging ───────────────────────────────────────────────

  logError(
    uid: string | null,
    phase: string,
    message: string,
    httpStatus?: number
  ): void {
    this.db
      .prepare(
        `INSERT INTO errors (product_uid, phase, error_message, http_status, occurred_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(uid, phase, message, httpStatus ?? null, new Date().toISOString());
  }

  // ─── Error cleanup ──────────────────────────────────────────────

  clearErrors(uid: string, phase: string): void {
    this.db
      .prepare("DELETE FROM errors WHERE product_uid = ? AND phase = ?")
      .run(uid, phase);
  }

  // ─── Stats ───────────────────────────────────────────────────────

  getProductCounts(): { total: number; food: number } {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN is_food = 1 THEN 1 ELSE 0 END), 0) as food
         FROM products`
      )
      .get() as { total: number; food: number };
    return row;
  }

  getErrorCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt FROM errors")
      .get() as { cnt: number };
    return row.cnt;
  }

  getFoodProductCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt FROM products WHERE is_food = 1")
      .get() as { cnt: number };
    return row.cnt;
  }

  // ─── Export ──────────────────────────────────────────────────────

  getExportProducts(): Array<Record<string, string | number | null>> {
    return this.db
      .prepare(
        `SELECT slug,
                calories_per_100,
                fat_per_100, sat_fat_per_100,
                carbs_per_100, sugar_per_100,
                fibre_per_100, protein_per_100, salt_per_100,
                serving_size,
                calories_per_serving,
                fat_per_serving, sat_fat_per_serving,
                carbs_per_serving, sugar_per_serving,
                fibre_per_serving, protein_per_serving, salt_per_serving
         FROM products
         WHERE is_food = 1
           AND parse_status IN ('ok', 'partial')
           AND calories_per_100 IS NOT NULL
         ORDER BY slug`
      )
      .all() as Array<Record<string, string | number | null>>;
  }

  close(): void {
    this.db.close();
  }
}
