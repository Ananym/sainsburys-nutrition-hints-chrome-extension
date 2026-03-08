// Search terms for discovery: b-z, 0-9 (skip 'a' which returns 0)
export const SEARCH_TERMS = [
  "b", "c", "d", "e", "f", "g", "h", "i", "j", "k",
  "l", "m", "n", "o", "p", "q", "r", "s", "t", "u",
  "v", "w", "x", "y", "z",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
];

// Products whose categories contain any of these keywords are marked non-food
export const NON_FOOD_KEYWORDS = [
  "pet", "household", "health & beauty", "baby", "toiletries", "cleaning",
  "nappy", "nappies", "deodorant", "shampoo", "conditioner", "toothpaste",
  "toothbrush", "shower", "soap", "handwash", "moisturis", "skincare",
  "body lotion", "body spray", "body wash", "bath time",
  "fabric conditioner", "laundry", "dishwash", "bin bag", "bin liner",
  "tissue", "kitchen roll", "candle", "air freshener",
  "sanitary", "feminine", "incontinence",
  "cigarette", "tobacco", "vaping",
  "hair dye", "hair colour",
  "magazine", "tv listing",
  "stationery", "envelope", "stamps",
  "toy", "arts & craft",
  "flowers & plants",
  "make up", "cosmetic",
  "electrical",
  "maternity", "mum to be", "hospital bag",
  "party tableware", "party decoration",
  "bakeware", "baking gadget", "baking utensil",
  "cat food", "cat treat", "cat pouch", "dry cat", "natural cat",
  "dog food", "dog treat", "dog chew", "dry dog", "puppy", "frozen dog",
];

export const MAX_CONCURRENT = 5;   // max in-flight requests
export const MAX_PER_SECOND = 2;   // max requests started per second
export const PAGE_SIZE = 200;
export const COOKIE_LIFETIME_MS = 2 * 60 * 60 * 1000; // 2 hours
export const MAX_BACKOFF_MS = 32_000;
export const DEFAULT_MAX_AGE_DAYS = 14;
export const DEFAULT_DB_PATH = "./data/sainsburys.db";

const API_BASE =
  "https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1";

export function searchUrl(term: string, pageNumber: number): string {
  return (
    `${API_BASE}/product` +
    `?filter[keyword]=${encodeURIComponent(term)}` +
    `&page_size=${PAGE_SIZE}` +
    `&page_number=${pageNumber}`
  );
}

export function detailUrl(slug: string): string {
  // Decode first to avoid double-encoding (old slugs may already be percent-encoded)
  let decoded: string;
  try { decoded = decodeURIComponent(slug); } catch { decoded = slug; }
  // Strip trailing non-breaking spaces / whitespace from malformed slugs
  decoded = decoded.replace(/[\s\u00a0]+$/, "");
  return `${API_BASE}/product?filter[product_seo_url]=${encodeURIComponent(decoded)}`;
}
