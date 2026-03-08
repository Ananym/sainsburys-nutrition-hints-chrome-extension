import * as cheerio from "cheerio";
import type { NutritionResult } from "./types.js";

type $ = cheerio.CheerioAPI;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type $El = cheerio.Cheerio<any>;

/**
 * Parse nutrition data from a decoded details_html string.
 * Defensive — never throws, always returns a NutritionResult.
 */
export function parseNutrition(html: string): NutritionResult {
  try {
    const $ = cheerio.load(html);
    const $table = $("table.nutritionTable").first();
    if ($table.length === 0) {
      return { status: "no_table" };
    }
    return parseTable($, $table);
  } catch (err) {
    return {
      status: "failed",
      error: `Parser exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Value extraction ────────────────────────────────────────────────

function extractNumber(text: string | undefined | null): number | undefined {
  if (!text) return undefined;
  const s = text.trim().toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")   // comma decimals: 10,0 → 10.0
    .replace(/(\d)\s+(\d)/g, "$1$2"); // thousands separator: 1 466 → 1466
  if (s === "trace" || s === "traces" || s === "nil" || s === "-" || s === "n/a" || s === "") {
    return 0;
  }
  // Handle "<0.5g", "<0.1g" etc → 0
  if (s.startsWith("<")) return 0;
  // "Less Than" → 0
  if (s.startsWith("less than")) return 0;
  // Handle capital O for zero: "Og" → "0g" (OCR/data entry errors)
  const fixed = s.replace(/\bO(\s*(?:g|mg|ml|kcal|kj)\b)/gi, "0$1");
  // Match number possibly followed by units (g, mg, ml, kcal, kJ)
  const m = fixed.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : undefined;
}

// ─── Column detection ────────────────────────────────────────────────

interface ColumnMap {
  per100Index: number;
  perServingIndex: number | null;
  nutritionUnit: string; // "g" or "ml"
  servingSize: string | undefined;
}

function detectColumns($: $, $table: $El): ColumnMap | null {
  const $thead = $table.find("thead");
  if ($thead.length === 0) {
    // No thead — assume standard layout: th | per100 | perServing
    return {
      per100Index: 1,
      perServingIndex: 2,
      nutritionUnit: "g",
      servingSize: undefined,
    };
  }

  const $headerRow = $thead.find("tr").first();
  if ($headerRow.length === 0) return null;

  const cells = $headerRow.find("th, td").toArray();
  let per100gIndex = -1;
  let per100mlIndex = -1;
  let perServingIndex: number | null = null;
  let servingSize: string | undefined;

  for (let i = 0; i < cells.length; i++) {
    const text = $(cells[i]).text().trim().toLowerCase();

    if ((text.includes("100g") || text.includes("100 g")) && per100gIndex === -1) {
      per100gIndex = i;
    } else if ((text.includes("100ml") || text.includes("100 ml")) && per100mlIndex === -1) {
      per100mlIndex = i;
    } else if (
      text.includes("per serving") ||
      text.includes("per portion") ||
      text.includes("serving")
    ) {
      perServingIndex = i;
      // Try to extract serving size: "Per Serving (150g)" → "150g"
      const fullText = $(cells[i]).text();
      const m = fullText.match(/\(([^)]+)\)/);
      if (m) servingSize = m[1].trim();
      // Also try "Per ½ pack" style
      if (!servingSize) {
        const full = fullText.trim();
        const prefix = full.replace(/^per\s+/i, "");
        if (prefix && prefix.toLowerCase() !== "serving" && prefix.toLowerCase() !== "portion") {
          servingSize = prefix;
        }
      }
    }
  }

  // Prefer grams over ml; fall back to standard layout if neither found
  let per100Index: number;
  let nutritionUnit: string;
  if (per100gIndex !== -1) {
    per100Index = per100gIndex;
    nutritionUnit = "g";
  } else if (per100mlIndex !== -1) {
    per100Index = per100mlIndex;
    nutritionUnit = "ml";
  } else {
    per100Index = 1;
    nutritionUnit = "g";
    if (cells.length > 2) perServingIndex = 2;
  }

  return { per100Index, perServingIndex, nutritionUnit, servingSize };
}

// ─── Label matching ──────────────────────────────────────────────────

type NutrientKey =
  | "calories"
  | "fat"
  | "satFat"
  | "carbs"
  | "sugar"
  | "fibre"
  | "protein"
  | "salt"
  | "sodium";

function identifyNutrient(label: string, valueText: string | undefined): NutrientKey | null {
  const raw = label.toLowerCase().trim();

  // Detect "of which" sub-rows early, before stripping destroys context.
  // These are indented sub-nutrient rows like "(of which saturates)", "of which sugars", etc.
  // Check raw label to catch both parenthesized and bare forms.
  if (/^\(?of which\b/i.test(raw) || /^-\s*of which\b/i.test(raw)) {
    if (raw.includes("saturate")) return "satFat";
    if (raw.includes("sugar")) return "sugar";
    // Other "of which" sub-rows (e.g. "of which mono-unsaturates") — skip
    return null;
  }

  const v = (valueText ?? "").toLowerCase();

  // Energy/kcal/kJ detection — check raw label before cleaning strips units.
  // Handles: "Energy", "Energy - kJ", "- kcal", "-kcal", "kcal", "Energy (kJ/kcal)"
  if (raw.startsWith("energ")) {
    if (v.includes("kcal") || raw.includes("kcal")) return "calories";
    if (v.includes("kj") || raw.includes("kj")) return null;
    return "calories";
  }
  if (/^-?\s*kcal/i.test(raw)) return "calories";
  if (/^-?\s*kj/i.test(raw)) return null;
  if (raw === "calories" || raw === "calorie") return "calories";

  const l = raw
    .replace(/\s*\[[^\]]*\]/g, "")             // strip square bracket units: [g], [kJ], [kcal]
    .replace(/\s*\([^)]*\)/g, "")             // strip all parenthetical content: (g), (kJ/kcal), (Calories)
    .replace(/\s*\([^)]*$/g, "")              // strip trailing unclosed paren: "Protein (g" → "Protein"
    .replace(/[)]/g, "")                       // strip stray closing parens: "Salt (g))" → "Salt"
    .replace(/[*†]+$/g, "")                   // strip footnote markers: "sugars***" → "sugars"
    .replace(/:$/g, "")                        // strip trailing colon: "Fat:" → "Fat"
    .replace(/,?\s+of which.*$/i, "")          // strip "of which" suffix: "Fat of which" → "Fat"
    .replace(/\s+(?:g|mg|kcal|kj|ml)\s*$/i, "") // strip bare trailing units: "Fat g" → "Fat"
    .trim();

  // Empty label after cleaning — skip (not a recognizable nutrient).
  // Genuine continuation rows (no <th>, rowspan) are handled by the isKcalRow path.
  if (l === "") return null;

  if (l === "fat" || l === "fats" || l === "total fat" || l === "fat, total" || l === "fat total" || l === "fat - total" || l === "fat content" || l === "crude fat")
    return "fat";
  if (l.includes("saturate") || l === "sat. fat." || l === "sat. fat" || l === "sat fat") return "satFat";
  if (l.includes("carbohydrate") || l.includes("carbonhydrate") || l.includes("carbohudrate") || l.includes("carbohydarte") || l === "carbs" || l.startsWith("total carb"))
    return "carbs";
  if (l.includes("sugar")) return "sugar";
  if (l === "fibre" || l === "fiber" || l === "dietary fibre" || l === "dietary fiber" || l === "crude fibre" || l === "crude fiber")
    return "fibre";
  if (l === "protein" || l === "proteins" || l === "proetein" || l === "protien" || l === "crude protein") return "protein";
  if (l === "salt") return "salt";
  if (l === "sodium") return "sodium";

  return null;
}

// ─── Combined energy cell helpers ────────────────────────────────────

function extractKcalFromCombined(text: string): number | undefined {
  const s = text.replace(/(\d),(\d)/g, "$1.$2").replace(/(\d)\s+(\d)/g, "$1$2");
  // Explicit "kcal" label
  const m = s.match(/([\d.]+)\s*kcal/i);
  if (m) return parseFloat(m[1]);
  // kJ/kcal pattern: second number after slash (kJ always comes first)
  const slash = s.match(/([\d.]+)\s*(?:kj)?\s*\/\s*([\d.]+)/i);
  if (slash) return parseFloat(slash[2]);
  return undefined;
}

// ─── Main table parser ───────────────────────────────────────────────

function parseTable($: $, $table: $El): NutritionResult {
  // Detect animal feed / pet food tables
  const tableText = $table.text().toLowerCase();
  if (
    /analytical\s+con\w+t/i.test(tableText) || // "Analytical Constituents" + typos (Consituents, Constituests, Constiuents)
    /nutritional\s+additives\s*\(per\s*kg\)/i.test(tableText) // pet supplements
  ) {
    return { status: "no_table", error: "Animal feed analytical constituents" };
  }

  const cols = detectColumns($, $table);
  if (!cols) {
    return { status: "failed", error: "Could not detect column layout" };
  }

  const result: NutritionResult = {
    status: "ok", // will be downgraded later if needed
    nutritionUnit: cols.nutritionUnit,
    servingSize: cols.servingSize,
  };

  // Get data rows: from tbody if present, otherwise all tr except first (header)
  const $tbody = $table.find("tbody");
  const $rows = $tbody.length > 0
    ? $tbody.find("tr")
    : $table.find("tr").slice(1);

  $rows.each((_i, rowEl) => {
    const $row = $(rowEl);
    const $th = $row.find("th").first();
    const cells = $row.find("th, td").toArray();

    // Get label — from <th> if present, otherwise first cell
    let label: string;
    let isKcalRow = false;
    const hasTh = $th.length > 0;

    if (hasTh) {
      label = $th.text().trim();
    } else {
      // Row without <th> — likely kcal sub-row under Energy
      label = "";
      isKcalRow = true;
    }

    // Handle rowspan: continuation rows (no th) have one fewer cell than normal
    // rows, so all column indices need to shift left by 1.
    const colOffset = !hasTh ? 1 : 0;

    // Get value from per-100 column
    const per100Cell = cells[cols.per100Index - colOffset];
    const per100Text = per100Cell ? $(per100Cell).text().trim() : undefined;

    // Get value from per-serving column
    const servIdx = cols.perServingIndex != null ? cols.perServingIndex - colOffset : null;
    const perServingCell = servIdx != null ? cells[servIdx] : null;
    const perServingText = perServingCell ? $(perServingCell).text().trim() : undefined;

    // Identify which nutrient this row is
    let nutrient: NutrientKey | null;
    if (isKcalRow) {
      const text = (per100Text ?? "").toLowerCase();
      if (text.includes("kcal")) {
        nutrient = "calories"; // combined kJ/kcal or pure kcal
      } else if (text.includes("kj")) {
        nutrient = null; // pure kJ row — skip
      } else {
        nutrient = "calories";
      }
    } else {
      nutrient = identifyNutrient(label, per100Text);
    }

    if (!nutrient) return; // cheerio .each: return = continue

    const per100Val = extractNumber(per100Text);
    const perServingVal = extractNumber(perServingText);

    // Skip rows with no extractable value (e.g. empty colspan rows)
    if (per100Val == null && perServingVal == null) return;

    // Handle sodium → salt conversion (×2.5)
    if (nutrient === "sodium") {
      if (per100Val != null) result.saltPer100 = per100Val * 2.5;
      if (perServingVal != null) result.saltPerServing = perServingVal * 2.5;
      return;
    }

    // Map nutrient to result fields
    switch (nutrient) {
      case "calories":
        // For combined "kJ / kcal" cells, extractNumber grabs the first number (kJ).
        // Use extractKcalFromCombined first to get the correct kcal value.
        result.caloriesPer100 = extractKcalFromCombined(per100Text ?? "") ?? per100Val;
        result.caloriesPerServing = extractKcalFromCombined(perServingText ?? "") ?? perServingVal;
        break;
      case "fat":
        result.fatPer100 = per100Val;
        result.fatPerServing = perServingVal;
        break;
      case "satFat":
        result.satFatPer100 = per100Val;
        result.satFatPerServing = perServingVal;
        break;
      case "carbs":
        result.carbsPer100 = per100Val;
        result.carbsPerServing = perServingVal;
        break;
      case "sugar":
        result.sugarPer100 = per100Val;
        result.sugarPerServing = perServingVal;
        break;
      case "fibre":
        result.fibrePer100 = per100Val;
        result.fibrePerServing = perServingVal;
        break;
      case "protein":
        result.proteinPer100 = per100Val;
        result.proteinPerServing = perServingVal;
        break;
      case "salt":
        result.saltPer100 = per100Val;
        result.saltPerServing = perServingVal;
        break;
    }
  });

  // Handle "Contains negligible amounts of fat, saturates, ..." rows
  $rows.each((_i, rowEl) => {
    const text = $(rowEl).text().toLowerCase();
    if (!text.includes("negligible") && !text.includes("neligible") && !text.includes("trace amount")) return;
    if (text.includes("fat") && result.fatPer100 == null) result.fatPer100 = 0;
    if (text.includes("saturate") && result.satFatPer100 == null) result.satFatPer100 = 0;
    // If saturates are negligible, fat must also be negligible (fat >= saturates)
    if (text.includes("saturate") && result.fatPer100 == null) result.fatPer100 = 0;
    if (text.includes("carbohydrate") && result.carbsPer100 == null) result.carbsPer100 = 0;
    if (text.includes("sugar") && result.sugarPer100 == null) result.sugarPer100 = 0;
    if (text.includes("protein") && result.proteinPer100 == null) result.proteinPer100 = 0;
    if (text.includes("salt") && result.saltPer100 == null) result.saltPer100 = 0;
    if (text.includes("fibre") && result.fibrePer100 == null) result.fibrePer100 = 0;
  });

  // Determine final status
  const coreFields = [
    result.caloriesPer100,
    result.fatPer100,
    result.carbsPer100,
    result.proteinPer100,
  ];
  const corePresent = coreFields.filter((f) => f != null).length;

  if (corePresent === 0) {
    result.status = "failed";
    result.error = "No core nutrition values extracted (kcal, fat, carbs, protein)";
  } else if (corePresent < 4) {
    result.status = "partial";
    const missing: string[] = [];
    if (result.caloriesPer100 == null) missing.push("kcal");
    if (result.fatPer100 == null) missing.push("fat");
    if (result.carbsPer100 == null) missing.push("carbs");
    if (result.proteinPer100 == null) missing.push("protein");
    result.error = `Missing: ${missing.join(", ")}`;
  }
  // else: status remains "ok"

  return result;
}
