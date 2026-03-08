import { Product } from "./data.js";

export interface UnitPrice {
  amount: number;
  unit: string;
}

const UNIT_PRICE_RE = /^(?:£([\d.]+)|([\d.]+)p)\s*\/\s*(.+)$/;

export function parseUnitPrice(text: string): UnitPrice | null {
  const m = text.trim().match(UNIT_PRICE_RE);
  if (!m) return null;
  const amount = m[1] != null ? parseFloat(m[1]) : parseFloat(m[2]) / 100;
  return { amount, unit: m[3].trim() };
}

export function pricePer100(up: UnitPrice): number | null {
  const u = up.unit.toLowerCase();
  if (u === "kg") return up.amount / 10;
  if (u === "100g") return up.amount;
  if (u === "ltr" || u === "litre") return up.amount / 10;
  if (u === "100ml") return up.amount;
  return null; // /ea or unknown
}

export function formatPricePerProtein(
  product: Product,
  unitPriceText: string | null
): string | null {
  if (!unitPriceText) return null;

  const up = parseUnitPrice(unitPriceText);
  if (!up) return null;

  const per100 = pricePer100(up);
  if (per100 !== null) {
    // Weight-based: price per 20g protein
    if (!product.protein || product.protein <= 0) return null;
    const pricePer20g = (per100 * 20) / product.protein;
    return `£${pricePer20g.toFixed(2)} / 20g protein`;
  }

  // Per-item: show protein per portion if available
  if (up.unit.toLowerCase() === "ea" && product.proteinServing != null && product.proteinServing > 0) {
    return `${product.proteinServing}g protein / portion`;
  }

  return null;
}

export function formatProteinPerKcal(product: Product): string | null {
  if (!product.protein || !product.kcal || product.kcal <= 0) return null;
  const gPer100kcal = (product.protein / product.kcal) * 100;
  return `${gPer100kcal.toFixed(1)}g protein / 100kcal`;
}

export function computeCostPerProtein(
  product: Product,
  unitPriceText: string | null
): number | null {
  if (!unitPriceText) return null;
  const up = parseUnitPrice(unitPriceText);
  if (!up) return null;
  const per100 = pricePer100(up);
  if (per100 === null) return null;
  if (!product.protein || product.protein <= 0) return null;
  return (per100 * 20) / product.protein;
}

export function computeProteinPerKcal(product: Product): number | null {
  if (!product.protein || !product.kcal || product.kcal <= 0) return null;
  return (product.protein / product.kcal) * 100;
}
