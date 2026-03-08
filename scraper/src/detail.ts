import type { AppState } from "./types.js";
import type { ScraperDb } from "./db.js";
import { MAX_CONCURRENT } from "./config.js";
import { fetchProductDetail } from "./http.js";
import { parseNutrition } from "./parser.js";
import { emitUpdate } from "./state.js";

export async function runDetail(
  state: AppState,
  db: ScraperDb,
  maxAgeDays: number,
  dryRun: boolean
): Promise<void> {
  state.phase = "detail";

  const queue = db.getDetailQueue(maxAgeDays);
  state.detail.totalQueue = queue.length;
  state.detail.completed = 0;

  // Load initial parse counts
  const counts = db.getParseStatusCounts();
  state.detail.parseOk = counts.ok;
  state.detail.parsePartial = counts.partial;
  state.detail.parseFailed = counts.failed;
  state.detail.parseNoTable = counts.no_table;

  emitUpdate();

  if (dryRun) {
    state.detail.completed = queue.length;
    emitUpdate();
    return;
  }

  // Concurrent worker pool — each worker pulls items from the shared queue
  let queueIndex = 0;

  const worker = async () => {
    while (queueIndex < queue.length) {
      if (state.abortRequested) break;

      const item = queue[queueIndex++];

      state.detail.currentSlug = item.slug;
      emitUpdate();

      try {
        let html: string | null = null;

        if (item.hasHtml && item.isFailed) {
          // Re-parse from stored HTML — no API call
          html = db.getHtml(item.product_uid);
          if (html) {
            state.detail.reparsed++;
          }
        }

        if (!html) {
          // Fetch from API
          const response = await fetchProductDetail(item.slug, state);
          const product = response.products?.[0];

          if (product?.details_html) {
            html = Buffer.from(product.details_html, "base64").toString("utf-8");
            db.storeHtml(item.product_uid, html);
          }
        }

        if (html) {
          const result = parseNutrition(html);
          db.updateNutrition(item.product_uid, result);
          db.clearErrors(item.product_uid, "detail");

          // Update counters
          switch (result.status) {
            case "ok":
              state.detail.parseOk++;
              break;
            case "partial":
              state.detail.parsePartial++;
              break;
            case "failed":
              state.detail.parseFailed++;
              state.detail.newFailsThisSession++;
              break;
            case "no_table":
              state.detail.parseNoTable++;
              break;
          }
        } else {
          // No HTML available — mark as no_table
          db.updateNutrition(item.product_uid, { status: "no_table" });
          state.detail.parseNoTable++;
        }

        state.detail.completed++;
        emitUpdate();
      } catch (err) {
        state.detail.completed++;
        db.logError(
          item.product_uid,
          "detail",
          err instanceof Error ? err.message : String(err)
        );
        emitUpdate();
      }
    }
  };

  await Promise.all(Array.from({ length: MAX_CONCURRENT }, () => worker()));
}
