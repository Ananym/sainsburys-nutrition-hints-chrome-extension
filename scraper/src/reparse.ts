import type { AppState } from "./types.js";
import type { ScraperDb } from "./db.js";
import { parseNutrition } from "./parser.js";
import { emitUpdate } from "./state.js";

const BATCH_SIZE = 500;

export function runReparse(state: AppState, db: ScraperDb, noTui = false): void {
  state.phase = "reparse";

  // Snapshot "before" counts
  const before = db.getParseStatusCounts();
  state.reparse.beforeOk = before.ok;
  state.reparse.beforePartial = before.partial;
  state.reparse.beforeFailed = before.failed;
  state.reparse.beforeNoTable = before.no_table;

  const total = db.getHtmlProductCount();
  state.reparse.total = total;
  state.reparse.completed = 0;

  // Reset "after" counts — will be recalculated
  state.reparse.afterOk = 0;
  state.reparse.afterPartial = 0;
  state.reparse.afterFailed = 0;
  state.reparse.afterNoTable = 0;

  emitUpdate();
  if (noTui) console.log(`Reparsing ${total} products...`);

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    if (state.abortRequested) break;

    const batch = db.getHtmlProductsBatch(BATCH_SIZE, offset);

    for (const product of batch) {
      if (state.abortRequested) break;

      const result = parseNutrition(product.html);
      db.updateNutrition(product.product_uid, result);

      switch (result.status) {
        case "ok":
          state.reparse.afterOk++;
          break;
        case "partial":
          state.reparse.afterPartial++;
          break;
        case "failed":
          state.reparse.afterFailed++;
          state.reparse.lastFail = `${product.name} — ${result.error ?? "unknown"}`;
          break;
        case "no_table":
          state.reparse.afterNoTable++;
          break;
      }

      state.reparse.completed++;

      if (state.reparse.completed % 500 === 0) {
        emitUpdate();
        if (noTui) {
          const pct = ((state.reparse.completed / total) * 100).toFixed(1);
          const r = state.reparse;
          console.log(`  ${pct}%  (${r.completed}/${total})  ok:${r.afterOk} partial:${r.afterPartial} failed:${r.afterFailed} no_table:${r.afterNoTable}`);
        }
      }
    }
  }

  emitUpdate();
  if (noTui) {
    const r = state.reparse;
    console.log(`Done. ok:${r.afterOk} partial:${r.afterPartial} failed:${r.afterFailed} no_table:${r.afterNoTable}`);
  }
}
