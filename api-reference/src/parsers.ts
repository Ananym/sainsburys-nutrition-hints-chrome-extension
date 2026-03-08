/**
 * Parsers for Sainsbury's API responses and HTML pages.
 * Adapted from proteinshop — cleaned up and documented.
 */

import { JSDOM } from "jsdom";

// ─── Types ──────────────────────────────────────────────────────────

export interface NutritionDetails {
  caloriesPer100: number | null;
  proteinPer100g: number | null;
  fatPer100g: number | null;
  satFatPer100g: number | null;
  carbPer100g: number | null;
  sugarPer100g: number | null;
  proteinPerServing: number | null;
  proteinPercentage: number | null;
  fatPercentage: number | null;
  carbPercentage: number | null;
  satFatPercentage: number | null;
  sugarPercentage: number | null;
}

export interface ProductListing {
  title: string;
  designator: string;
  priceText: string | null;
}

export interface CategoryPageInfo {
  totalProducts: number;
  pageCount: number;
  products: ProductListing[];
}

// ─── Product detail JSON → Nutrition ────────────────────────────────

/**
 * Decode the base64 `details_html` field from the product API response
 * and extract nutrition data from the `.nutritionTable`.
 */
export function parseProductDetailResponse(json: {
  products: Array<{ details_html: string; [k: string]: unknown }>;
}): NutritionDetails | null {
  if (!json.products?.length) return null;
  const html64 = json.products[0].details_html;
  if (!html64) return null;
  const html = Buffer.from(html64, "base64").toString("utf-8");
  return parseNutritionFromHtml(html);
}

/**
 * Given an HTML string containing a `.nutritionTable`, extract nutrition values.
 */
export function parseNutritionFromHtml(html: string): NutritionDetails | null {
  const doc = new JSDOM(html).window.document;
  const table = doc.querySelector<HTMLTableElement>(".nutritionTable");
  if (!table) return null;
  return parseNutritionTable(table);
}

export function parseNutritionTable(
  table: HTMLTableElement
): NutritionDetails {
  const rows = Array.from(table.tBodies[0]?.rows ?? []);

  let caloriesPer100: number | null = null;
  let proteinPer100g: number | null = null;
  let fatPer100g: number | null = null;
  let satFatPer100g: number | null = null;
  let carbPer100g: number | null = null;
  let sugarPer100g: number | null = null;
  let proteinPerServing: number | null = null;

  for (const row of rows) {
    const header = row.querySelector("th");
    const isKcalRow = !header;
    const firstDataCol = isKcalRow ? 0 : 1;
    const label = row.cells[0]?.textContent?.trim() ?? "";
    const valuePer100 = row.cells[firstDataCol]?.textContent?.trim();
    const valuePerServing = row.cells[firstDataCol + 1]?.textContent?.trim();

    const parseNum = (s: string | undefined) =>
      s ? parseFloat(s) || null : null;

    const extractGrams = (s: string | undefined): number | null => {
      if (!s) return null;
      const m = s.match(/^([\d.]+)\s?g?/);
      return m ? parseFloat(m[1]) : null;
    };

    if (label === "Protein") {
      proteinPer100g = extractGrams(valuePer100);
      proteinPerServing = extractGrams(valuePerServing);
    } else if (
      isKcalRow ||
      (label.includes("Energy") && !label.toLowerCase().includes("kj"))
    ) {
      // kcal row: value might be "108kcal" or just "108"
      let m = valuePer100?.match(/^\d+$/);
      if (m) {
        caloriesPer100 = parseFloat(m[0]);
      } else {
        m = valuePer100?.match(/(\d+)\s?kcal/i);
        if (m) caloriesPer100 = parseFloat(m[1]);
      }
    } else if (label === "Fat") {
      fatPer100g = extractGrams(valuePer100);
    } else if (label.toLowerCase().includes("saturate")) {
      satFatPer100g = extractGrams(valuePer100);
    } else if (label === "Carbohydrate") {
      carbPer100g = extractGrams(valuePer100);
    } else if (label.toLowerCase().includes("sugar")) {
      sugarPer100g = extractGrams(valuePer100);
    }
  }

  const PROTEIN_CAL = 4;
  const FAT_CAL = 9;
  const CARB_CAL = 4;

  const pct = (g: number | null, calPerG: number) =>
    g !== null && caloriesPer100
      ? (100 * (g * calPerG)) / caloriesPer100
      : null;

  return {
    caloriesPer100,
    proteinPer100g,
    fatPer100g,
    satFatPer100g,
    carbPer100g,
    sugarPer100g,
    proteinPerServing,
    proteinPercentage: pct(proteinPer100g, PROTEIN_CAL),
    fatPercentage: pct(fatPer100g, FAT_CAL),
    carbPercentage: pct(carbPer100g, CARB_CAL),
    satFatPercentage: pct(satFatPer100g, FAT_CAL),
    sugarPercentage: pct(sugarPer100g, CARB_CAL),
  };
}

// ─── Category listing HTML → products ───────────────────────────────

/**
 * Parse a legacy HTML category listing page.
 */
export function parseCategoryListingPage(
  html: string,
  itemsPerPage = 120
): CategoryPageInfo {
  const doc = new JSDOM(html).window.document;
  const totalProducts = parseTotalProductCount(doc);
  const pageCount = Math.ceil(totalProducts / itemsPerPage);
  const products = parseProductCards(doc);
  return { totalProducts, pageCount, products };
}

function parseTotalProductCount(doc: Document): number {
  const heading = doc.querySelector("h1.resultsHeading");
  if (!heading) throw new Error("No h1.resultsHeading found");
  const text = heading.textContent ?? "";
  const match = text.match(/[\d,]+/);
  if (!match) throw new Error(`No product count in heading: "${text}"`);
  return parseInt(match[0].replace(",", ""), 10);
}

function parseProductCards(doc: Document): ProductListing[] {
  const items = doc.querySelectorAll("li.gridItem");
  const results: ProductListing[] = [];

  items.forEach((li) => {
    const nameDiv = li.querySelector("div.productNameAndPromotions");
    if (!nameDiv) return;
    const anchor = nameDiv.querySelector("a");
    if (!anchor) return;

    const title = (anchor.textContent ?? "").trim();
    const href = anchor.getAttribute("href") ?? "";
    const designator = extractDesignator(href);
    const priceEl = nameDiv.querySelector("p.pricePerMeasure");
    const priceText = priceEl?.textContent?.trim() ?? null;

    if (title && designator) {
      results.push({ title, designator, priceText });
    }
  });

  return results;
}

// ─── URL / designator helpers ───────────────────────────────────────

/**
 * Extract the product SEO slug from a Sainsbury's product URL.
 *
 * Input:  "https://www.sainsburys.co.uk/shop/gb/groceries/product/details/sainsburys-chicken-breast-fillets-300g"
 * Output: "sainsburys-chicken-breast-fillets-300g"
 *
 * The slug is the last path segment after stripping "details/".
 */
export function extractSlug(url: string): string {
  const idx = url.lastIndexOf("product/");
  if (idx === -1) return "";
  let product = url.substring(idx + 8);
  product = product.replace("details/", "");
  // If there's a category prefix (old format), take only the last segment
  if (product.includes("/")) {
    product = product.substring(product.lastIndexOf("/") + 1);
  }
  return product;
}

/** @deprecated Use extractSlug instead — kept for legacy HTML parser compat */
export function extractDesignator(url: string): string {
  const idx = url.lastIndexOf("product/");
  if (idx === -1) return "";
  const product = url.substring(idx + 8);
  return product.replace("details/", "");
}

/**
 * Build the product detail API URL from a slug.
 * The slug is just the product name, e.g. "sainsburys-chicken-breast-fillets-300g"
 */
export function productApiUrl(slug: string): string {
  const encoded = encodeURIComponent(slug);
  return `https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/product?filter[product_seo_url]=${encoded}`;
}

/**
 * Build a category listing URL.
 */
export function categoryListingUrl(
  categorySlug: string,
  page: number,
  pageSize = 120
): string {
  const url = new URL(
    `https://www.sainsburys.co.uk/shop/gb/groceries/${categorySlug}/seeall`
  );
  url.searchParams.set("fromMegaNav", "1");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("catSeeAll", "true");
  url.searchParams.set("beginIndex", String(page * pageSize));
  return url.toString();
}
