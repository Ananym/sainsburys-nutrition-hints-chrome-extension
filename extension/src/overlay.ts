import { Product } from "./data.js";
import { formatPricePerProtein, formatProteinPerKcal, computeCostPerProtein, computeProteinPerKcal } from "./price.js";
import { markAnnotated } from "./cards.js";

interface MacroPercents {
  protein: number;
  fat: number;
  carbs: number;
}

function computeMacroPercents(product: Product): MacroPercents | null {
  const { protein, fat, carbs, kcal } = product;
  if (!kcal || kcal <= 0) return null;
  if (protein == null || fat == null || carbs == null) return null;

  const pCal = protein * 4;
  const fCal = fat * 9;
  const cCal = carbs * 4;
  const total = pCal + fCal + cCal;
  if (total <= 0) return null;

  return {
    protein: (pCal / total) * 100,
    fat: (fCal / total) * 100,
    carbs: (cCal / total) * 100,
  };
}

/** Apply inline styles to guarantee they override site CSS. */
function applyStyle(el: HTMLElement, styles: Record<string, string>): void {
  for (const [prop, val] of Object.entries(styles)) {
    el.style.setProperty(prop, val, "important");
  }
}

export function annotateCard(
  card: HTMLElement,
  product: Product,
  unitPriceText: string | null
): void {
  // Store sort metrics as data attributes on the grid item wrapper
  const gridItem = card.closest<HTMLElement>(".pt-grid-item");
  const costProtein = computeCostPerProtein(product, unitPriceText);
  const proteinKcal = computeProteinPerKcal(product);
  if (gridItem) {
    gridItem.dataset.shCostProtein = costProtein != null ? String(costProtein) : "";
    gridItem.dataset.shProteinKcal = proteinKcal != null ? String(proteinKcal) : "";
  }

  const percents = computeMacroPercents(product);
  if (!percents) {
    markAnnotated(card);
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "sh-overlay";

  // Macro bar
  const bar = document.createElement("div");
  bar.className = "sh-bar";

  const segP = document.createElement("div");
  segP.className = "sh-bar-protein";
  segP.style.width = `${percents.protein.toFixed(1)}%`;

  const segF = document.createElement("div");
  segF.className = "sh-bar-fat";
  segF.style.width = `${percents.fat.toFixed(1)}%`;

  const segC = document.createElement("div");
  segC.className = "sh-bar-carbs";
  segC.style.width = `${percents.carbs.toFixed(1)}%`;

  bar.append(segP, segF, segC);
  overlay.appendChild(bar);

  // Macro text — hidden by default, revealed on bar hover
  const macros = document.createElement("div");
  macros.className = "sh-macros";
  const p = product.protein ?? 0;
  const f = product.fat ?? 0;
  const c = product.carbs ?? 0;
  macros.textContent = `P ${p}g \u00B7 F ${f}g \u00B7 C ${c}g per 100g`;
  overlay.appendChild(macros);

  // Price per protein
  const priceLine = formatPricePerProtein(product, unitPriceText);
  if (priceLine) {
    const priceEl = document.createElement("div");
    priceEl.className = "sh-price-protein";
    applyStyle(priceEl, { "font-size": "18px", "font-weight": "400", "color": "#333" });
    priceEl.textContent = priceLine;
    overlay.appendChild(priceEl);
  }

  // Protein per kcal
  const kcalLine = formatProteinPerKcal(product);
  if (kcalLine) {
    const kcalEl = document.createElement("div");
    kcalEl.className = "sh-protein-kcal";
    applyStyle(kcalEl, { "font-size": "18px", "font-weight": "400", "color": "#555" });
    kcalEl.textContent = kcalLine;
    overlay.appendChild(kcalEl);
  }

  // Insert after unit price element
  const unitPriceEl = card.querySelector('[data-testid="pt-unit-price"]');
  if (unitPriceEl) {
    unitPriceEl.insertAdjacentElement("afterend", overlay);
  } else {
    // Fallback: append to card
    card.appendChild(overlay);
  }

  markAnnotated(card);
}
