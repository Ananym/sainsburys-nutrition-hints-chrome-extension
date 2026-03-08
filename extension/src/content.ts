import { Product, loadProductData, buildProductMap } from "./data.js";
import { findUnannotatedCards, extractSlug, extractUnitPriceText, clearAnnotations, stampOriginalOrder, getGridItems, findProductList } from "./cards.js";
import { annotateCard } from "./overlay.js";

let productMap: Map<string, Product> | null = null;

function annotateAll(): void {
  if (!productMap) return;
  const cards = findUnannotatedCards();
  for (const card of cards) {
    const slug = extractSlug(card);
    if (!slug) continue;
    const product = productMap.get(slug);
    if (!product) continue;
    const unitPriceText = extractUnitPriceText(card);
    annotateCard(card, product, unitPriceText);
  }
  stampOriginalOrder();
  ensureSortBar();
}

// --- Sort bar ---

type SortMode = "cost-protein" | "protein-kcal" | null;
let activeSort: SortMode = null;

/** Find the element before which we insert the sort bar. */
function findSortBarAnchor(): HTMLElement | null {
  // Find the product list and insert before it
  const list = findProductList();
  if (!list) return null;
  // On search pages the list is inside a CSS grid (div.SRF), so go up to
  // the section to escape the grid layout. On category pages the list parent
  // uses normal block flow so we can insert right before the list.
  const srf = list.closest<HTMLElement>("div.SRF");
  if (srf) {
    const section = srf.closest<HTMLElement>("section");
    if (section) return section;
  }
  return list;
}

function ensureSortBar(): void {
  if (document.querySelector(".sh-sort-bar")) return;
  const anchor = findSortBarAnchor();
  if (!anchor) return;

  const bar = document.createElement("div");
  bar.className = "sh-sort-bar";

  const label = document.createElement("span");
  label.className = "sh-sort-bar__label";
  label.textContent = "Sort:";
  bar.appendChild(label);

  const btnCost = document.createElement("button");
  btnCost.className = "sh-sort-btn";
  btnCost.textContent = "\u00A3/protein";
  btnCost.addEventListener("click", () => toggleSort("cost-protein"));
  bar.appendChild(btnCost);

  const btnKcal = document.createElement("button");
  btnKcal.className = "sh-sort-btn";
  btnKcal.textContent = "protein/kcal";
  btnKcal.addEventListener("click", () => toggleSort("protein-kcal"));
  bar.appendChild(btnKcal);

  anchor.insertAdjacentElement("beforebegin", bar);
}

function toggleSort(mode: SortMode): void {
  if (activeSort === mode) {
    activeSort = null;
    restoreOriginalOrder();
  } else {
    activeSort = mode;
    applySort(mode!);
  }
  updateSortButtons();
}

function updateSortButtons(): void {
  const btns = document.querySelectorAll<HTMLButtonElement>(".sh-sort-btn");
  btns.forEach((btn) => {
    const isActive =
      (activeSort === "cost-protein" && btn.textContent === "£/protein") ||
      (activeSort === "protein-kcal" && btn.textContent === "protein/kcal");
    btn.classList.toggle("sh-sort-btn--active", isActive);
  });
}

function applySort(mode: "cost-protein" | "protein-kcal"): void {
  const list = findProductList();
  if (!list) { console.log("[SH] Sort: no product list found"); return; }

  const items = getGridItems();
  if (items.length === 0) { console.log("[SH] Sort: no grid items"); return; }

  // Search pages have product-tile-row wrappers; category pages put items directly in a <ul>.
  const rows = Array.from(list.querySelectorAll<HTMLElement>(":scope > .product-tile-row"));
  const isRowBased = rows.length > 0;

  // Gather all product items and non-product items
  const allItems: HTMLElement[] = [];
  const adItems: HTMLElement[] = [];

  if (isRowBased) {
    for (const r of rows) {
      for (const child of Array.from(r.children) as HTMLElement[]) {
        if (child.classList.contains("pt-grid-item")) {
          allItems.push(child);
        } else {
          adItems.push(child);
        }
      }
    }
  } else {
    // Category pages: items are direct children of <ul>
    for (const child of Array.from(list.children) as HTMLElement[]) {
      if (child.classList.contains("pt-grid-item")) {
        allItems.push(child);
      } else {
        adItems.push(child);
      }
    }
  }

  const attr = mode === "cost-protein" ? "shCostProtein" : "shProteinKcal";
  const ascending = mode === "cost-protein"; // cheapest first vs highest first

  allItems.sort((a, b) => {
    const va = a.dataset[attr];
    const vb = b.dataset[attr];
    const na = va ? parseFloat(va) : NaN;
    const nb = vb ? parseFloat(vb) : NaN;
    const aHas = !isNaN(na);
    const bHas = !isNaN(nb);
    if (!aHas && !bHas) return 0;
    if (!aHas) return 1;
    if (!bHas) return -1;
    return ascending ? na - nb : nb - na;
  });

  if (isRowBased) {
    // Collapse into first row, remove extras
    const row = rows[0];
    for (let i = 1; i < rows.length; i++) rows[i].remove();
    for (const item of allItems) row.appendChild(item);
    for (const ad of adItems) row.appendChild(ad);
  } else {
    // Category page: reorder direct children of <ul>
    for (const item of allItems) list.appendChild(item);
    for (const ad of adItems) list.appendChild(ad);
  }

  console.log(`[SH] Sorted ${allItems.length} items by ${mode}`);
}

function restoreOriginalOrder(): void {
  const list = findProductList();
  if (!list) return;

  // Find the container that holds items — either the first row or the list itself
  const row = list.querySelector<HTMLElement>(":scope > .product-tile-row");
  const container = row ?? list;

  const children = Array.from(container.children) as HTMLElement[];
  children.sort((a, b) => {
    const oa = parseInt(a.dataset.shOrder ?? "99999", 10);
    const ob = parseInt(b.dataset.shOrder ?? "99999", 10);
    return oa - ob;
  });

  for (const child of children) {
    container.appendChild(child);
  }
  console.log("[SH] Restored original order");
}

// --- DOM observer ---

function observeDOM(): void {
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      annotateAll();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function init(): Promise<void> {
  console.log("[SH] Content script v2 loaded");
  productMap = await loadProductData();
  if (productMap) {
    console.log(`[SH] Loaded ${productMap.size} products`);
  } else {
    console.log("[SH] No product data available");
  }
  annotateAll();
  observeDOM();
}

// Listen for data updates from popup or background
chrome.storage.onChanged.addListener((changes, area) => {
  // Session override (file import) takes priority
  if (area === "session" && changes.productDataOverride) {
    const raw = changes.productDataOverride.newValue;
    if (typeof raw === "string") {
      try {
        productMap = buildProductMap(raw);
        console.log(`[SH] File override loaded: ${productMap.size} products`);
      } catch (e) {
        console.error("[SH] Failed to rebuild product data:", e);
        return;
      }
    } else {
      // Override removed — fall back to stored remote data
      loadProductData().then((map) => {
        productMap = map;
        console.log(`[SH] Override cleared, reverted to remote data`);
        clearAnnotations();
        activeSort = null;
        document.querySelector(".sh-sort-bar")?.remove();
        annotateAll();
      });
      return;
    }
    clearAnnotations();
    activeSort = null;
    document.querySelector(".sh-sort-bar")?.remove();
    annotateAll();
    return;
  }

  if (area !== "local" || !changes.productData) return;
  const raw = changes.productData.newValue;
  if (typeof raw === "string") {
    try {
      productMap = buildProductMap(raw);
      console.log(`[SH] Data updated: ${productMap.size} products`);
    } catch (e) {
      console.error("[SH] Failed to rebuild product data:", e);
      return;
    }
  } else {
    productMap = null;
    console.log("[SH] Product data cleared");
  }
  clearAnnotations();
  activeSort = null;
  document.querySelector(".sh-sort-bar")?.remove();
  annotateAll();
});

init();
