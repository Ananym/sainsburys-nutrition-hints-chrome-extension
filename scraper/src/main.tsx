import fs from "node:fs";
import path from "node:path";
import { render } from "ink";
import React from "react";
import type { CliOptions } from "./types.js";
import { DEFAULT_DB_PATH, DEFAULT_MAX_AGE_DAYS } from "./config.js";
import { createInitialState } from "./state.js";
import { ScraperDb } from "./db.js";
import { init as initHttp } from "./http.js";
import { runDiscovery } from "./discovery.js";
import { runDetail } from "./detail.js";
import { runReparse } from "./reparse.js";
import { runExport } from "./export.js";
import { App } from "./ui/App.js";

const DEFAULT_EXPORT_PATH = "./data/sainsburys-hints-products.json";

// ─── CLI arg parsing ─────────────────────────────────────────────────

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    dbPath: DEFAULT_DB_PATH,
    maxAgeDays: DEFAULT_MAX_AGE_DAYS,
    discoveryOnly: false,
    detailOnly: false,
    reparse: false,
    dryRun: false,
    export: false,
    exportAfter: false,
    exportPath: DEFAULT_EXPORT_PATH,
    noTui: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--db":
        opts.dbPath = args[++i];
        break;
      case "--max-age":
        opts.maxAgeDays = parseInt(args[++i], 10);
        break;
      case "--discovery-only":
        opts.discoveryOnly = true;
        break;
      case "--detail-only":
        opts.detailOnly = true;
        break;
      case "--reparse":
        opts.reparse = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--export":
        opts.export = true;
        break;
      case "--export-after":
        opts.exportAfter = true;
        break;
      case "--export-path":
        opts.exportPath = args[++i];
        break;
      case "--no-tui":
        opts.noTui = true;
        break;
    }
  }

  return opts;
}

// ─── Plain-text summary (for cron logs) ──────────────────────────────

function printSummary(state: ReturnType<typeof createInitialState>): void {
  const elapsed = Date.now() - state.startedAt;
  const totalSec = Math.floor(elapsed / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const duration = h > 0 ? `${h}h ${m}m` : `${m}m`;

  const label = state.interrupted
    ? "stopped (progress saved)"
    : "complete";

  const d = state.discovery;
  const det = state.detail;

  console.log(`\nSainsbury's Scraper — ${label}`);
  console.log(
    `  Discovery: ${d.completedTerms}/${d.totalTerms} terms, ${d.totalProducts.toLocaleString()} products (${d.foodProducts.toLocaleString()} food), ${d.newProducts.toLocaleString()} new`
  );

  if (state.phase === "reparse" || state.phase === "done") {
    const r = state.reparse;
    if (r.total > 0) {
      console.log(
        `  Reparse:   ${r.completed}/${r.total} products`
      );
      console.log(
        `  Parse:     ${r.afterOk} ok | ${r.afterPartial} partial | ${r.afterFailed} failed | ${r.afterNoTable} no table`
      );
    }
  }

  if (det.totalQueue > 0) {
    console.log(
      `  Detail:    ${det.completed.toLocaleString()} fetched, ${det.newFailsThisSession} new failures`
    );
    console.log(
      `  Parse:     ${det.parseOk} ok | ${det.parsePartial} partial | ${det.parseFailed} failed | ${det.parseNoTable} no table`
    );
  }

  console.log(`  Errors:    ${state.http.errors} HTTP errors`);
  console.log(`  Duration:  ${duration}`);
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  // Ensure data directory exists
  const dataDir = path.dirname(opts.dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new ScraperDb(opts.dbPath);

  // --export: just export from existing DB and exit
  if (opts.export) {
    runExport(db, opts.exportPath);
    db.close();
    process.exit(0);
  }

  const state = createInitialState();

  let unmount: (() => void) | undefined;
  let waitUntilExit: (() => Promise<unknown>) | undefined;

  if (!opts.noTui) {
    // Render Ink UI
    const isTTY = process.stdin.isTTY === true;
    const inkResult = render(<App state={state} />, {
      ...(isTTY ? {} : { stdin: undefined }),
    });
    unmount = inkResult.unmount;
    waitUntilExit = inkResult.waitUntilExit;
  }

  // Wire SIGINT → graceful abort
  process.on("SIGINT", () => {
    state.abortRequested = true;
  });

  try {
    if (opts.reparse) {
      // Reparse mode — no HTTP
      runReparse(state, db, opts.noTui);
    } else {
      // Initialize HTTP (harvest cookies) unless dry-run
      if (!opts.dryRun) {
        await initHttp(state);
      }

      // Phase 1: Discovery
      if (!opts.detailOnly) {
        await runDiscovery(state, db, opts.maxAgeDays, opts.dryRun);
      }

      // Phase 2: Detail
      if (!opts.discoveryOnly && !state.abortRequested) {
        await runDetail(state, db, opts.maxAgeDays, opts.dryRun);
      }
    }

    state.interrupted = state.abortRequested;
    state.phase = state.abortRequested ? "aborted" : "done";
  } catch (err) {
    state.interrupted = true;
    state.phase = "aborted";
    state.http.lastError = err instanceof Error ? err.message : String(err);
  }

  // Final render
  if (unmount) {
    unmount();
    await waitUntilExit!();
  }

  // Print plain-text summary
  printSummary(state);

  // --export-after: export once scraping is done
  if (opts.exportAfter) {
    runExport(db, opts.exportPath);
  }

  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
