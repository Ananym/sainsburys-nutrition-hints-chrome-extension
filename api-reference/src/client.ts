/**
 * Sainsbury's API client — thin wrapper around the endpoints discovered
 * from the legacy proteinshop codebase and live exploration.
 */

import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const ITEMS_PER_PAGE = 120;

export function createClient(): AxiosInstance {
  const jar = new CookieJar();
  const client = wrapper(
    axios.create({
      jar,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
      },
      withCredentials: true,
      timeout: 15_000,
    })
  );
  return client;
}

// ─── Category listing (HTML) ────────────────────────────────────────

/**
 * Build the URL for a paginated category "see all" listing.
 * `beginIndex` is 0-based (page 1 → beginIndex 0, page 2 → 120, …).
 */
export function categoryListingUrl(
  category: string,
  page: number,
  pageSize = ITEMS_PER_PAGE
): string {
  const url = new URL(
    `https://www.sainsburys.co.uk/shop/gb/groceries/${category}/seeall`
  );
  url.searchParams.set("fromMegaNav", "1");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("catSeeAll", "true");
  url.searchParams.set("beginIndex", String(page * pageSize));
  return url.toString();
}

/**
 * Alternative "CategorySeeAllView" endpoint that takes numeric IDs
 * instead of slug-based category names.
 */
export function categorySeeAllViewUrl(opts: {
  categoryId: number;
  storeId?: number;
  pageSize?: number;
  beginIndex?: number;
  orderBy?: string;
}): string {
  const url = new URL(
    "https://www.sainsburys.co.uk/shop/CategorySeeAllView"
  );
  url.searchParams.set("storeId", String(opts.storeId ?? 10151));
  url.searchParams.set("catalogId", "10148");
  url.searchParams.set("langId", "44");
  url.searchParams.set("categoryId", String(opts.categoryId));
  url.searchParams.set("categoryFacetId1", String(opts.categoryId));
  url.searchParams.set("pageSize", String(opts.pageSize ?? ITEMS_PER_PAGE));
  url.searchParams.set("beginIndex", String(opts.beginIndex ?? 0));
  url.searchParams.set(
    "orderBy",
    opts.orderBy ?? "FAVOURITES_FIRST"
  );
  return url.toString();
}

export async function fetchCategoryPage(
  client: AxiosInstance,
  category: string,
  page: number
): Promise<string> {
  const url = categoryListingUrl(category, page);
  const res = await client.get<string>(url);
  return res.data;
}

// ─── Product details (JSON API) ─────────────────────────────────────

const PRODUCT_API_BASE =
  "https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/product";

/**
 * Build the URL for the product detail JSON API.
 * `productPath` is the slug portion, e.g.
 * "breast---fillet-44/sainsburys-chicken-breast-fillets-300g"
 */
export function productDetailUrl(productPath: string): string {
  const encoded = encodeURIComponent(productPath);
  return `${PRODUCT_API_BASE}?filter[product_seo_url]=gb%2Fgroceries%2F${encoded}`;
}

export interface ProductApiResponse {
  products: Array<{
    product_uid: string;
    name: string;
    details_html: string; // base64-encoded HTML
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export async function fetchProductDetail(
  client: AxiosInstance,
  productPath: string
): Promise<ProductApiResponse> {
  const url = productDetailUrl(productPath);
  const res = await client.get<ProductApiResponse>(url);
  return res.data;
}

// ─── Groceries API — category / taxonomy endpoints ──────────────────

const GROCERIES_API =
  "https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1";

export function categorySearchUrl(
  categoryId: string,
  opts?: { pageSize?: number; pageNumber?: number }
): string {
  const url = new URL(`${GROCERIES_API}/category/products`);
  url.searchParams.set("filter[keyword]", "");
  url.searchParams.set("filter[category]", categoryId);
  url.searchParams.set("page_size", String(opts?.pageSize ?? 60));
  url.searchParams.set("page_number", String(opts?.pageNumber ?? 1));
  return url.toString();
}

export function searchUrl(
  term: string,
  opts?: { pageSize?: number; pageNumber?: number }
): string {
  const url = new URL(`${GROCERIES_API}/product`);
  url.searchParams.set("filter[keyword]", term);
  url.searchParams.set("page_size", String(opts?.pageSize ?? 60));
  url.searchParams.set("page_number", String(opts?.pageNumber ?? 1));
  return url.toString();
}

export function taxonomyUrl(): string {
  return "https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/taxonomy";
}
