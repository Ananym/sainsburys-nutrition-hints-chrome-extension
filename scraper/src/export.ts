import fs from "node:fs";
import path from "node:path";
import type { ScraperDb } from "./db.js";

function round1(n: unknown): number | null {
  if (n == null || typeof n !== "number") return null;
  return Math.round(n * 10) / 10;
}

function round0(n: unknown): number | null {
  if (n == null || typeof n !== "number") return null;
  return Math.round(n);
}

// Field order matches the `fields` array in the output.
// slug, then per-100 (kcal, fat, satFat, carbs, sugar, fibre, protein, salt),
// then servingSize, then per-serving (same 8 fields).
const FIELDS = [
  "slug",
  "kcal",
  "fat", "satFat", "carbs", "sugar", "fibre", "protein", "salt",
  "servingSize",
  "kcalServing",
  "fatServing", "satFatServing", "carbsServing", "sugarServing",
  "fibreServing", "proteinServing", "saltServing",
] as const;

export function runExport(db: ScraperDb, outputPath: string): void {
  const rows = db.getExportProducts();

  const tuples = rows.map((r) => [
    r.slug,
    // Per 100
    round0(r.calories_per_100),
    round1(r.fat_per_100),
    round1(r.sat_fat_per_100),
    round1(r.carbs_per_100),
    round1(r.sugar_per_100),
    round1(r.fibre_per_100),
    round1(r.protein_per_100),
    round1(r.salt_per_100),
    // Serving
    r.serving_size ?? null,
    round0(r.calories_per_serving),
    round1(r.fat_per_serving),
    round1(r.sat_fat_per_serving),
    round1(r.carbs_per_serving),
    round1(r.sugar_per_serving),
    round1(r.fibre_per_serving),
    round1(r.protein_per_serving),
    round1(r.salt_per_serving),
  ]);

  const data = {
    version: 2,
    generated: new Date().toISOString(),
    fields: FIELDS,
    products: tuples,
  };

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(data));

  const sizeKB = Math.round(fs.statSync(outputPath).size / 1024);
  console.log(
    `Exported ${tuples.length} products to ${outputPath} (${sizeKB} KB)`
  );
}
