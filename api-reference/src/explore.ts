/**
 * Exploration script — harvest browser cookies, then hit each known
 * endpoint and save sample responses into ./snapshots/.
 *
 * Run:  npm run explore
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { harvestCookies, apiHeaders } from "./cookies.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = path.resolve(__dirname, "../snapshots");
fs.mkdirSync(SNAP_DIR, { recursive: true });

function save(name: string, data: unknown) {
  const ext = typeof data === "string" ? "html" : "json";
  const content =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const fp = path.join(SNAP_DIR, `${name}.${ext}`);
  fs.writeFileSync(fp, content, "utf-8");
  console.log(`  → saved ${fp}`);
}

function summarise(label: string, ok: boolean, detail: string) {
  const mark = ok ? "✓" : "✗";
  console.log(`\n[${mark}] ${label}`);
  console.log(`    ${detail}`);
}

async function main() {
  console.log("═══ Harvesting cookies via headless browser… ═══");
  const cookies = await harvestCookies();
  const cookieNames = cookies.split("; ").map((c) => c.split("=")[0]);
  console.log(`Got ${cookieNames.length} cookies: ${cookieNames.join(", ")}`);

  const headers = apiHeaders(cookies);
  const client = axios.create({
    timeout: 20_000,
    validateStatus: () => true,
    headers,
  });

  // ─── 1. Product detail JSON API ────────────────────────────────
  console.log("\n═══ 1. Product detail JSON API ═══");
  {
    const designator = "meat-fish%2Fsainsburys-british-chicken-breast-fillets-300g";
    const url = `https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/product?filter[product_seo_url]=gb%2Fgroceries%2F${designator}`;
    console.log(`  URL: ${url}`);
    const res = await client.get(url);
    const data = res.data;
    if (res.status === 200 && typeof data === "object" && data?.products?.length) {
      const p = data.products[0];
      const productKeys = Object.keys(p);
      summarise("Product detail API", true, `status=200  name=${p.name}  keys=[${productKeys.join(",")}]`);
      save("product-detail", data);
      if (p.details_html) {
        const decoded = Buffer.from(p.details_html, "base64").toString("utf-8");
        save("product-details-html-decoded", decoded);
      }
    } else {
      summarise("Product detail API", false, `status=${res.status}  body=${String(data).slice(0, 300)}`);
    }
  }

  // ─── 2. Keyword search ────────────────────────────────────────
  console.log("\n═══ 2. Keyword search ═══");
  {
    const url = "https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/product?filter[keyword]=chicken+breast&page_size=5&page_number=1";
    console.log(`  URL: ${url}`);
    const res = await client.get(url);
    if (res.status === 200 && typeof res.data === "object") {
      const count = res.data.products?.length ?? 0;
      summarise("Keyword search", true, `status=200  products=${count}  topKeys=[${Object.keys(res.data).join(",")}]`);
      save("keyword-search", res.data);
    } else {
      summarise("Keyword search", false, `status=${res.status}`);
    }
  }

  // ─── 3. Taxonomy ──────────────────────────────────────────────
  console.log("\n═══ 3. Taxonomy ═══");
  {
    const url = "https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/taxonomy";
    console.log(`  URL: ${url}`);
    const res = await client.get(url);
    if (res.status === 200 && typeof res.data === "object") {
      summarise("Taxonomy", true, `status=200  topKeys=[${Object.keys(res.data).join(",")}]`);
      save("taxonomy", res.data);
    } else {
      summarise("Taxonomy", false, `status=${res.status}`);
    }
  }

  // ─── 4. Category products ─────────────────────────────────────
  console.log("\n═══ 4. Category products (Meat & Fish = 13343) ═══");
  {
    const url = "https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/category/products?filter[keyword]=&filter[category]=13343&page_size=5&page_number=1";
    console.log(`  URL: ${url}`);
    const res = await client.get(url);
    if (res.status === 200 && typeof res.data === "object") {
      const count = res.data.products?.length ?? 0;
      summarise("Category products", true, `status=200  products=${count}  topKeys=[${Object.keys(res.data).join(",")}]`);
      save("category-products", res.data);
    } else {
      summarise("Category products", false, `status=${res.status}`);
    }
  }

  // ─── 5. Legacy HTML category listing ──────────────────────────
  console.log("\n═══ 5. Legacy HTML category listing ═══");
  {
    const url = "https://www.sainsburys.co.uk/shop/gb/groceries/meat-fish/seeall?fromMegaNav=1&pageSize=120&catSeeAll=true&beginIndex=0";
    console.log(`  URL: ${url}`);
    const res = await client.get(url, {
      headers: { ...headers, Accept: "text/html,application/xhtml+xml,*/*" },
    });
    const html = String(res.data);
    const headingMatch = html.match(/<h1[^>]*class="resultsHeading"[^>]*>([\s\S]*?)<\/h1>/i);
    if (res.status === 200 && headingMatch) {
      summarise("Legacy HTML listing", true, `status=200  heading=${headingMatch[1].trim()}  length=${html.length}`);
      save("legacy-category-listing", html.slice(0, 100_000));
    } else {
      summarise("Legacy HTML listing", false, `status=${res.status}  hasHeading=${!!headingMatch}  length=${html.length}`);
      save("legacy-category-listing", html.slice(0, 50_000));
    }
  }

  console.log("\n═══ Done ═══");
  console.log(`Snapshots saved to: ${SNAP_DIR}`);
}

main().catch(console.error);
