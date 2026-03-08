const CARD_SELECTOR = "article.pt-card";
const MARKER_CLASS = "sh-annotated";

export function findUnannotatedCards(): HTMLElement[] {
  const all = document.querySelectorAll<HTMLElement>(CARD_SELECTOR);
  return Array.from(all).filter((el) => !el.classList.contains(MARKER_CLASS));
}

export function extractSlug(card: HTMLElement): string | null {
  const link = card.querySelector<HTMLAnchorElement>("a[href]");
  if (!link) return null;
  const parts = link.getAttribute("href")?.split("/");
  return parts?.pop() ?? null;
}

export function extractUnitPriceText(card: HTMLElement): string | null {
  const el = card.querySelector<HTMLElement>('[data-testid="pt-unit-price"]');
  return el?.textContent?.trim() ?? null;
}

export function markAnnotated(card: HTMLElement): void {
  card.classList.add(MARKER_CLASS);
}

export function clearAnnotations(): void {
  document.querySelectorAll(`.${MARKER_CLASS}`).forEach((card) => {
    card.classList.remove(MARKER_CLASS);
  });
  document.querySelectorAll(".sh-overlay").forEach((el) => el.remove());
}

/**
 * Find the product list container. Handles two page types:
 * - Search results: div.ds-o-grid containing article.pt-card
 * - Category pages: ul.ln-o-grid containing article.pt-card
 */
export function findProductList(): HTMLElement | null {
  // Search results page
  for (const grid of document.querySelectorAll<HTMLElement>("div.ds-o-grid")) {
    if (grid.querySelector("article.pt-card")) return grid;
  }
  // Category page
  for (const ul of document.querySelectorAll<HTMLElement>("ul.ln-o-grid")) {
    if (ul.querySelector("article.pt-card")) return ul;
  }
  return null;
}

/** Stamp original DOM order on grid items so we can restore after sorting. */
export function stampOriginalOrder(): void {
  const list = findProductList();
  if (!list) return;
  const items = list.querySelectorAll<HTMLElement>(".pt-grid-item");
  items.forEach((item, i) => {
    if (!item.dataset.shOrder) {
      item.dataset.shOrder = String(i);
    }
  });
}

/** Get all product grid items. */
export function getGridItems(): HTMLElement[] {
  const list = findProductList();
  if (!list) return [];
  return Array.from(list.querySelectorAll<HTMLElement>(".pt-grid-item"));
}
