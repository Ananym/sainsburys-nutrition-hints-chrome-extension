import type { AppState, ApiProduct } from "./types.js";
import type { ScraperDb } from "./db.js";
import { SEARCH_TERMS, NON_FOOD_KEYWORDS } from "./config.js";
import { searchProducts } from "./http.js";
import { emitUpdate } from "./state.js";
import { extractSlug } from "../../api-reference/src/parsers.js";

function isFood(product: ApiProduct): boolean {
  if (!product.categories) return true;
  return !product.categories.some((cat) => {
    const name = cat.name.toLowerCase();
    return NON_FOOD_KEYWORDS.some((kw) => name.includes(kw));
  });
}

export async function runDiscovery(
  state: AppState,
  db: ScraperDb,
  maxAgeDays: number,
  dryRun: boolean
): Promise<void> {
  state.phase = "discovery";
  state.discovery.totalTerms = SEARCH_TERMS.length;
  state.discovery.completedTerms = 0;

  // Load existing counts from DB
  const counts = db.getProductCounts();
  state.discovery.totalProducts = counts.total;
  state.discovery.foodProducts = counts.food;

  emitUpdate();

  for (const term of SEARCH_TERMS) {
    if (state.abortRequested) break;

    state.discovery.currentTerm = term;
    emitUpdate();

    // Check if this term was already swept recently
    const sweepAge = db.getSweepAge(term);
    if (sweepAge !== null && sweepAge < maxAgeDays) {
      state.discovery.skippedTerms++;
      state.discovery.completedTerms++;
      emitUpdate();
      continue;
    }

    if (dryRun) {
      state.discovery.completedTerms++;
      emitUpdate();
      continue;
    }

    let totalPages = 1;
    let productCountForTerm = 0;

    for (let page = 1; page <= totalPages; page++) {
      if (state.abortRequested) break;

      state.discovery.currentPage = page;
      state.discovery.totalPages = totalPages;
      emitUpdate();

      try {
        const response = await searchProducts(term, page, state);

        // Update total pages from first response
        if (page === 1 && response.controls?.page?.last) {
          totalPages = response.controls.page.last;
          state.discovery.totalPages = totalPages;
        }

        if (!response.products) continue;

        for (const product of response.products) {
          const rawSlug = extractSlug(product.full_url ?? "");
          // Decode percent-encoded chars to avoid double-encoding in detailUrl
          let slug: string;
          try { slug = decodeURIComponent(rawSlug); } catch { slug = rawSlug; }
          const food = isFood(product);

          const result = db.upsertProduct(
            {
              product_uid: product.product_uid,
              name: product.name,
              slug: slug || product.name, // fallback to name if no slug
              eans: product.eans,
              brand: product.brand,
              categories: product.categories,
              is_available: product.is_available,
              unit_price: product.unit_price?.price,
              unit_measure: product.unit_price?.measure,
              retail_price: product.retail_price?.price,
            },
            food
          );

          if (result === "new") {
            state.discovery.newProducts++;
            state.discovery.totalProducts++;
            if (food) state.discovery.foodProducts++;
          }

          productCountForTerm++;
        }

        emitUpdate();
      } catch (err) {
        db.logError(
          null,
          "discovery",
          `Search "${term}" page ${page}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    db.recordSweep(term, productCountForTerm);
    state.discovery.completedTerms++;
    emitUpdate();
  }
}
