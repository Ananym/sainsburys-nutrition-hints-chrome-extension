import { EventEmitter } from "node:events";
import type { AppState } from "./types.js";
import { SEARCH_TERMS } from "./config.js";

export const stateEvents = new EventEmitter();

export function emitUpdate(): void {
  stateEvents.emit("update");
}

export function createInitialState(): AppState {
  return {
    phase: "init",
    abortRequested: false,
    startedAt: Date.now(),

    cookiesFresh: false,
    cookiesHarvestedAt: null,
    cookiesRefreshing: false,

    discovery: {
      totalTerms: SEARCH_TERMS.length,
      completedTerms: 0,
      currentTerm: "",
      currentPage: 0,
      totalPages: 0,
      totalProducts: 0,
      foodProducts: 0,
      newProducts: 0,
      skippedTerms: 0,
    },

    detail: {
      totalQueue: 0,
      completed: 0,
      currentSlug: "",
      reparsed: 0,
      parseOk: 0,
      parsePartial: 0,
      parseFailed: 0,
      parseNoTable: 0,
      newFailsThisSession: 0,
    },

    reparse: {
      total: 0,
      completed: 0,
      beforeOk: 0,
      beforePartial: 0,
      beforeFailed: 0,
      beforeNoTable: 0,
      afterOk: 0,
      afterPartial: 0,
      afterFailed: 0,
      afterNoTable: 0,
      lastFail: "",
    },

    http: {
      totalRequests: 0,
      errors: 0,
      throttled: 0,
      lastError: "",
    },

    interrupted: false,
  };
}
