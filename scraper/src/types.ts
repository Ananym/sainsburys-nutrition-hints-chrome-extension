// ─── CLI ─────────────────────────────────────────────────────────────

export interface CliOptions {
  dbPath: string;
  maxAgeDays: number;
  discoveryOnly: boolean;
  detailOnly: boolean;
  reparse: boolean;
  dryRun: boolean;
  export: boolean;       // --export: just export, no scraping
  exportAfter: boolean;  // --export-after: export after scraping completes
  exportPath: string;
  noTui: boolean;        // --no-tui: headless mode, plain text output
}

// ─── API response shapes ─────────────────────────────────────────────

export interface ApiProduct {
  product_uid: string;
  name: string;
  full_url: string;
  categories: Array<{ id: string; name: string }>;
  eans: string[];
  brand?: string;
  is_available: boolean;
  unit_price?: { price: number; measure: string };
  retail_price?: { price: number };
}

export interface SearchApiResponse {
  products: ApiProduct[];
  controls: {
    page: {
      current: number;
      last: number;
    };
  };
  total: number;
}

export interface DetailApiResponse {
  products: Array<{
    product_uid: string;
    name: string;
    details_html: string; // base64-encoded
    [key: string]: unknown;
  }>;
}

// ─── Nutrition parser ────────────────────────────────────────────────

export type ParseStatus = "ok" | "partial" | "no_table" | "failed";

export interface NutritionResult {
  status: ParseStatus;
  error?: string;

  nutritionUnit?: string; // "g" or "ml"
  servingSize?: string; // e.g. "150g", "Per ½ pack"

  caloriesPer100?: number;
  fatPer100?: number;
  satFatPer100?: number;
  carbsPer100?: number;
  sugarPer100?: number;
  fibrePer100?: number;
  proteinPer100?: number;
  saltPer100?: number;

  caloriesPerServing?: number;
  fatPerServing?: number;
  satFatPerServing?: number;
  carbsPerServing?: number;
  sugarPerServing?: number;
  fibrePerServing?: number;
  proteinPerServing?: number;
  saltPerServing?: number;
}

// ─── App state ───────────────────────────────────────────────────────

export type Phase =
  | "init"
  | "discovery"
  | "detail"
  | "reparse"
  | "done"
  | "aborted";

export interface AppState {
  phase: Phase;
  abortRequested: boolean;
  startedAt: number; // Date.now()

  // Cookie status
  cookiesFresh: boolean;
  cookiesHarvestedAt: number | null;
  cookiesRefreshing: boolean;

  // Discovery
  discovery: {
    totalTerms: number;
    completedTerms: number;
    currentTerm: string;
    currentPage: number;
    totalPages: number;
    totalProducts: number;
    foodProducts: number;
    newProducts: number;
    skippedTerms: number; // already fresh
  };

  // Detail
  detail: {
    totalQueue: number;
    completed: number;
    currentSlug: string;
    reparsed: number; // re-parsed from stored HTML (no API call)
    parseOk: number;
    parsePartial: number;
    parseFailed: number;
    parseNoTable: number;
    newFailsThisSession: number;
  };

  // Reparse
  reparse: {
    total: number;
    completed: number;
    beforeOk: number;
    beforePartial: number;
    beforeFailed: number;
    beforeNoTable: number;
    afterOk: number;
    afterPartial: number;
    afterFailed: number;
    afterNoTable: number;
    lastFail: string; // product name + reason
  };

  // HTTP stats
  http: {
    totalRequests: number;
    errors: number;
    throttled: number;
    lastError: string;
  };

  // Summary
  interrupted: boolean;
}
