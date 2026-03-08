import axios from "axios";
import type { AppState, SearchApiResponse, DetailApiResponse } from "./types.js";
import { MAX_CONCURRENT, MAX_PER_SECOND, COOKIE_LIFETIME_MS, MAX_BACKOFF_MS, searchUrl, detailUrl } from "./config.js";
import { emitUpdate } from "./state.js";
import { harvestCookies, apiHeaders } from "../../api-reference/src/cookies.js";

let cookies = "";
let cookiesHarvestedAt = 0;

export async function init(state: AppState): Promise<void> {
  await refreshCookies(state);
}

async function refreshCookies(state: AppState): Promise<void> {
  state.cookiesRefreshing = true;
  emitUpdate();
  cookies = await harvestCookies();
  cookiesHarvestedAt = Date.now();
  state.cookiesHarvestedAt = cookiesHarvestedAt;
  state.cookiesFresh = true;
  state.cookiesRefreshing = false;
  emitUpdate();
}

// Serialize concurrent cookie refreshes
let cookieRefreshPromise: Promise<void> | null = null;

async function refreshCookiesSerialized(state: AppState): Promise<void> {
  if (!cookieRefreshPromise) {
    cookieRefreshPromise = refreshCookies(state).finally(() => {
      cookieRefreshPromise = null;
    });
  }
  await cookieRefreshPromise;
}

function cookieAge(): number {
  return Date.now() - cookiesHarvestedAt;
}

async function ensureFreshCookies(state: AppState): Promise<void> {
  if (cookieAge() > COOKIE_LIFETIME_MS - 10 * 60 * 1000) {
    await refreshCookiesSerialized(state);
  }
}

// ─── Rate limiter (semaphore + sliding window) ──────────────────────

let inFlight = 0;
const slotWaiters: (() => void)[] = [];
const startTimes: number[] = [];

async function acquireSlot(): Promise<void> {
  while (true) {
    // Wait for a concurrency slot
    while (inFlight >= MAX_CONCURRENT) {
      await new Promise<void>((resolve) => slotWaiters.push(resolve));
    }

    // Check rate limit: at most MAX_PER_SECOND starts in the last 1000ms
    const now = Date.now();
    while (startTimes.length > 0 && startTimes[0] <= now - 1000) {
      startTimes.shift();
    }

    if (startTimes.length < MAX_PER_SECOND) {
      // Both checks pass — take the slot
      inFlight++;
      startTimes.push(Date.now());
      return;
    }

    // Wait until the oldest timestamp exits the window
    const waitMs = startTimes[0] + 1000 - now + 1;
    await new Promise((r) => setTimeout(r, waitMs));
    // Loop back to re-check concurrency after waiting
  }
}

function releaseSlot(): void {
  inFlight--;
  if (slotWaiters.length > 0) {
    const next = slotWaiters.shift()!;
    next();
  }
}

// ─── Request with retries ───────────────────────────────────────────

function urlLabel(url: string): string {
  const seo = url.match(/product_seo_url=([^&]+)/);
  if (seo) return decodeURIComponent(seo[1]);
  const kw = url.match(/keyword=([^&]+)/);
  if (kw) return `search "${decodeURIComponent(kw[1])}"`;
  return url.substring(url.lastIndexOf("/") + 1, url.lastIndexOf("/") + 40);
}

async function throttledRequest<T>(
  url: string,
  state: AppState
): Promise<T> {
  await ensureFreshCookies(state);

  let backoff = 1000;
  const label = urlLabel(url);

  for (let attempt = 0; attempt < 6; attempt++) {
    if (state.abortRequested) throw new Error("Aborted");

    await acquireSlot();

    state.http.totalRequests++;
    emitUpdate();

    try {
      const res = await axios.get<T>(url, {
        headers: apiHeaders(cookies),
        timeout: 30_000,
      });
      releaseSlot();
      return res.data;
    } catch (err: unknown) {
      releaseSlot();

      const status = axios.isAxiosError(err) ? err.response?.status : undefined;

      if (status === 403 && attempt === 0) {
        // Cookie expired — refresh and retry
        await refreshCookiesSerialized(state);
        continue;
      }

      if (status === 429 || (status && status >= 500)) {
        // Rate limited or server error — backoff (slot already released)
        state.http.throttled++;
        state.http.lastError = `HTTP ${status} ${label} (retrying in ${backoff / 1000}s)`;
        emitUpdate();
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        continue;
      }

      // Non-retryable error
      state.http.errors++;
      const msg = axios.isAxiosError(err)
        ? `HTTP ${status ?? "?"} ${label}: ${err.message}`
        : `${label}: ${String(err)}`;
      state.http.lastError = msg;
      emitUpdate();
      throw err;
    }
  }

  throw new Error(`Max retries exceeded for ${url}`);
}

export async function searchProducts(
  term: string,
  page: number,
  state: AppState
): Promise<SearchApiResponse> {
  return throttledRequest<SearchApiResponse>(searchUrl(term, page), state);
}

export async function fetchProductDetail(
  slug: string,
  state: AppState
): Promise<DetailApiResponse> {
  return throttledRequest<DetailApiResponse>(detailUrl(slug), state);
}
