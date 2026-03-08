/**
 * Offline tests — validate parsers against saved snapshot data.
 * These always run, no network needed.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  parseProductDetailResponse,
  parseNutritionFromHtml,
  parseCategoryListingPage,
  extractDesignator,
  extractSlug,
  productApiUrl,
  categoryListingUrl,
} from "../src/parsers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAP = path.resolve(__dirname, "../snapshots");

// ─── Nutrition parsing ──────────────────────────────────────────────

describe("parseProductDetailResponse", () => {
  it("extracts nutrition from a sample product detail JSON", () => {
    const json = JSON.parse(
      fs.readFileSync(path.join(SNAP, "sample-product-detail.json"), "utf-8")
    );
    const nutrition = parseProductDetailResponse(json);

    expect(nutrition).not.toBeNull();
    expect(nutrition!.caloriesPer100).toBe(108);
    expect(nutrition!.proteinPer100g).toBe(23.1);
    expect(nutrition!.fatPer100g).toBe(1.1);
    expect(nutrition!.satFatPer100g).toBe(0.3);
    expect(nutrition!.carbPer100g).toBe(0.0);
    expect(nutrition!.sugarPer100g).toBe(0.0);
    expect(nutrition!.proteinPerServing).toBe(34.7);
  });

  it("computes calorie percentages correctly", () => {
    const json = JSON.parse(
      fs.readFileSync(path.join(SNAP, "sample-product-detail.json"), "utf-8")
    );
    const n = parseProductDetailResponse(json)!;

    // Protein: 23.1 × 4 / 108 × 100 ≈ 85.6%
    expect(n.proteinPercentage).toBeCloseTo(85.56, 1);
    // Fat: 1.1 × 9 / 108 × 100 ≈ 9.17%
    expect(n.fatPercentage).toBeCloseTo(9.17, 1);
    // Carbs: 0 × 4 / 108 × 100 = 0%
    expect(n.carbPercentage).toBe(0);
    // Sat fat: 0.3 × 9 / 108 × 100 = 2.5%
    expect(n.satFatPercentage).toBeCloseTo(2.5, 1);
    // Sugar: 0%
    expect(n.sugarPercentage).toBe(0);
  });

  it("returns null for empty products array", () => {
    expect(parseProductDetailResponse({ products: [] })).toBeNull();
  });
});

describe("parseNutritionFromHtml", () => {
  it("handles inline HTML without base64 encoding", () => {
    const html = `
      <table class="nutritionTable">
        <thead><tr><th></th><th>Per 100g</th></tr></thead>
        <tbody>
          <tr><th>Energy (kJ)</th><td>840kJ</td></tr>
          <tr><td>200kcal</td></tr>
          <tr><th>Fat</th><td>8.0g</td></tr>
          <tr><th>of which saturates</th><td>3.0g</td></tr>
          <tr><th>Carbohydrate</th><td>10.0g</td></tr>
          <tr><th>of which sugars</th><td>5.0g</td></tr>
          <tr><th>Protein</th><td>20.0g</td></tr>
        </tbody>
      </table>`;
    const n = parseNutritionFromHtml(html);
    expect(n).not.toBeNull();
    expect(n!.caloriesPer100).toBe(200);
    expect(n!.proteinPer100g).toBe(20);
    expect(n!.fatPer100g).toBe(8);
    // Protein %: 20×4/200×100 = 40%
    expect(n!.proteinPercentage).toBe(40);
  });

  it("returns null when no nutritionTable is present", () => {
    expect(parseNutritionFromHtml("<div>no table here</div>")).toBeNull();
  });

  it("handles kcal value without 'kcal' suffix", () => {
    const html = `
      <table class="nutritionTable">
        <tbody>
          <tr><th>Energy</th><td>500kJ</td></tr>
          <tr><td>120</td></tr>
          <tr><th>Protein</th><td>10g</td></tr>
        </tbody>
      </table>`;
    const n = parseNutritionFromHtml(html)!;
    expect(n.caloriesPer100).toBe(120);
  });
});

// ─── Category listing parsing ───────────────────────────────────────

describe("parseCategoryListingPage", () => {
  it("extracts product count and products from sample listing", () => {
    const html = fs.readFileSync(
      path.join(SNAP, "sample-category-listing.html"),
      "utf-8"
    );
    const info = parseCategoryListingPage(html);

    expect(info.totalProducts).toBe(1404);
    expect(info.pageCount).toBe(12); // ceil(1404/120)
    expect(info.products).toHaveLength(3);

    expect(info.products[0]).toEqual({
      title: "Sainsbury's British Chicken Breast Fillets 300g",
      designator:
        "breast---fillet-44/sainsburys-chicken-breast-fillets-300g",
      priceText: "£6.50/kg",
    });

    expect(info.products[1]).toEqual({
      title: "Sainsbury's Salmon Fillets x2 240g",
      designator: "salmon-44/sainsburys-salmon-fillets-x2-240g",
      priceText: "£1.25/100g",
    });

    expect(info.products[2]).toEqual({
      title: "Sainsbury's Beef Mince 500g",
      designator: "mince-44/sainsburys-beef-mince-500g",
      priceText: "£3.50 ea",
    });
  });
});

// ─── URL helpers ────────────────────────────────────────────────────

describe("extractDesignator", () => {
  it("extracts from a standard product URL", () => {
    expect(
      extractDesignator(
        "https://www.sainsburys.co.uk/shop/gb/groceries/product/breast---fillet-44/sainsburys-chicken-breast-fillets-300g"
      )
    ).toBe("breast---fillet-44/sainsburys-chicken-breast-fillets-300g");
  });

  it("strips 'details/' prefix", () => {
    expect(
      extractDesignator(
        "https://www.sainsburys.co.uk/shop/gb/groceries/product/details/salmon-44/sainsburys-salmon"
      )
    ).toBe("salmon-44/sainsburys-salmon");
  });

  it("returns empty string for URLs without 'product/'", () => {
    expect(
      extractDesignator("https://www.sainsburys.co.uk/gol-ui/groceries/")
    ).toBe("");
  });
});

describe("extractSlug", () => {
  it("extracts slug from new-style full_url", () => {
    expect(
      extractSlug(
        "https://www.sainsburys.co.uk/shop/gb/groceries/product/details/sainsburys-chicken-breast-fillets-300g"
      )
    ).toBe("sainsburys-chicken-breast-fillets-300g");
  });

  it("extracts slug from old-style URL with category prefix", () => {
    expect(
      extractSlug(
        "https://www.sainsburys.co.uk/shop/gb/groceries/product/breast---fillet-44/sainsburys-chicken-breast-fillets-300g"
      )
    ).toBe("sainsburys-chicken-breast-fillets-300g");
  });

  it("returns empty string for non-product URLs", () => {
    expect(extractSlug("https://www.sainsburys.co.uk/gol-ui/groceries/")).toBe(
      ""
    );
  });
});

describe("productApiUrl", () => {
  it("builds the correct API URL using just the slug", () => {
    const url = productApiUrl("sainsburys-chicken-breast-fillets-300g");
    expect(url).toBe(
      "https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/product?filter[product_seo_url]=sainsburys-chicken-breast-fillets-300g"
    );
  });
});

describe("categoryListingUrl", () => {
  it("builds page 0 URL", () => {
    const url = categoryListingUrl("meat-fish", 0);
    expect(url).toContain("/shop/gb/groceries/meat-fish/seeall");
    expect(url).toContain("beginIndex=0");
    expect(url).toContain("pageSize=120");
  });

  it("builds page 2 URL with correct offset", () => {
    const url = categoryListingUrl("meat-fish", 2);
    expect(url).toContain("beginIndex=240");
  });
});
