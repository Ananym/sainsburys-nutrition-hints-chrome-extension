/**
 * Live API tests — harvest cookies via headless browser, then hit
 * the real Sainsbury's endpoints to verify the documented API.
 *
 * Skip with: SKIP_LIVE=1 npm test
 */

import { describe, it, expect, beforeAll } from "vitest";
import axios, { AxiosInstance } from "axios";
import { harvestCookies, apiHeaders } from "../src/cookies.js";
import { parseProductDetailResponse } from "../src/parsers.js";

const SKIP = process.env.SKIP_LIVE === "1";
const describeLive = SKIP ? describe.skip : describe;

const BASE =
  "https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1";

let client: AxiosInstance;

beforeAll(async () => {
  if (SKIP) return;
  const cookies = await harvestCookies();
  client = axios.create({
    timeout: 20_000,
    validateStatus: () => true,
    headers: apiHeaders(cookies),
  });
}, 60_000);

// ─── Keyword Search ─────────────────────────────────────────────────

describeLive("Keyword Search API", () => {
  it("returns products for a search term", async () => {
    const res = await client.get(
      `${BASE}/product?filter%5Bkeyword%5D=chicken+breast&page_size=5&page_number=1`
    );
    expect(res.status).toBe(200);
    expect(res.data.products.length).toBeGreaterThan(0);
    expect(res.data.controls.total_record_count).toBeGreaterThan(0);
  });

  it("supports pagination", async () => {
    const page1 = await client.get(
      `${BASE}/product?filter%5Bkeyword%5D=chicken&page_size=5&page_number=1`
    );
    const page2 = await client.get(
      `${BASE}/product?filter%5Bkeyword%5D=chicken&page_size=5&page_number=2`
    );
    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);

    const uids1 = page1.data.products.map((p: any) => p.product_uid);
    const uids2 = page2.data.products.map((p: any) => p.product_uid);
    // Pages should have different products
    expect(uids1).not.toEqual(uids2);
  });

  it("accepts page_size=200 despite official options being 30/60/90", async () => {
    const res = await client.get(
      `${BASE}/product?filter%5Bkeyword%5D=bread&page_size=200&page_number=1`
    );
    expect(res.status).toBe(200);
    // Should return up to 200 if enough results exist
    expect(res.data.products.length).toBeGreaterThan(60);
  });

  it("includes price and category data in results", async () => {
    const res = await client.get(
      `${BASE}/product?filter%5Bkeyword%5D=milk&page_size=1`
    );
    expect(res.status).toBe(200);
    const p = res.data.products[0];
    expect(p).toHaveProperty("product_uid");
    expect(p).toHaveProperty("name");
    expect(p).toHaveProperty("full_url");
    expect(p).toHaveProperty("unit_price");
    expect(p.unit_price).toHaveProperty("price");
    expect(p).toHaveProperty("retail_price");
    expect(p).toHaveProperty("categories");
    expect(p).toHaveProperty("is_available");
  });

  it("does NOT include details_html in search results", async () => {
    const res = await client.get(
      `${BASE}/product?filter%5Bkeyword%5D=chicken&page_size=1`
    );
    expect(res.status).toBe(200);
    expect(res.data.products[0].details_html).toBeFalsy();
  });
});

// ─── Product Detail ─────────────────────────────────────────────────

describeLive("Product Detail API", () => {
  it("returns details_html for a product slug", async () => {
    const slug = "sainsburys-chicken-breast-fillets-300g";
    const res = await client.get(
      `${BASE}/product?filter%5Bproduct_seo_url%5D=${encodeURIComponent(slug)}`
    );
    expect(res.status).toBe(200);
    expect(res.data.products.length).toBe(1);
    expect(res.data.products[0].details_html).toBeTruthy();
    expect(typeof res.data.products[0].details_html).toBe("string");
  });

  it("has parseable nutrition data in details_html", async () => {
    const slug = "sainsburys-chicken-breast-fillets-300g";
    const res = await client.get(
      `${BASE}/product?filter%5Bproduct_seo_url%5D=${encodeURIComponent(slug)}`
    );
    expect(res.status).toBe(200);

    const nutrition = parseProductDetailResponse(res.data);
    expect(nutrition).not.toBeNull();
    expect(nutrition!.proteinPer100g).toBeGreaterThan(0);
    expect(nutrition!.caloriesPer100).toBeGreaterThan(0);
    expect(nutrition!.proteinPercentage).toBeGreaterThan(0);
  });

  it("also works with gb/groceries/ prefix", async () => {
    const slug = "gb/groceries/sainsburys-chicken-breast-fillets-300g";
    const res = await client.get(
      `${BASE}/product?filter%5Bproduct_seo_url%5D=${encodeURIComponent(slug)}`
    );
    expect(res.status).toBe(200);
    expect(res.data.products.length).toBe(1);
  });

  it("rejects the old category/slug format with 400", async () => {
    // This is how proteinshop used to build URLs — no longer works
    const slug = "meat-fish/sainsburys-chicken-breast-fillets-300g";
    const res = await client.get(
      `${BASE}/product?filter%5Bproduct_seo_url%5D=${encodeURIComponent(slug)}`
    );
    expect(res.status).toBe(400);
  });
});

// ─── Non-Working Endpoints (regression tests) ───────────────────────

describeLive("Non-working endpoints (document regressions)", () => {
  it("taxonomy returns 405", async () => {
    const res = await client.get(`${BASE}/taxonomy`);
    expect(res.status).toBe(405);
  });

  it("category/products returns 405", async () => {
    const res = await client.get(
      `${BASE}/category/products?filter%5Bcategory%5D=13343&page_size=2`
    );
    expect(res.status).toBe(405);
  });

  it("filter[category] on search returns 0 results", async () => {
    const res = await client.get(
      `${BASE}/product?filter%5Bkeyword%5D=&filter%5Bcategory%5D=310865&page_size=5`
    );
    expect(res.status).toBe(200);
    expect(res.data.controls.total_record_count).toBe(0);
  });
});
