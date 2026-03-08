export interface Product {
  slug: string;
  kcal: number | null;
  fat: number | null;
  satFat: number | null;
  carbs: number | null;
  sugar: number | null;
  fibre: number | null;
  protein: number | null;
  salt: number | null;
  servingSize: string | null;
  kcalServing: number | null;
  fatServing: number | null;
  satFatServing: number | null;
  carbsServing: number | null;
  sugarServing: number | null;
  fibreServing: number | null;
  proteinServing: number | null;
  saltServing: number | null;
}

export interface ProductData {
  version: number;
  generated: string;
  fields: string[];
  products: (string | number | null)[][];
}

const PRODUCT_KEYS: (keyof Product)[] = [
  "slug",
  "kcal",
  "fat", "satFat", "carbs", "sugar", "fibre", "protein", "salt",
  "servingSize",
  "kcalServing",
  "fatServing", "satFatServing", "carbsServing", "sugarServing",
  "fibreServing", "proteinServing", "saltServing",
];

export function buildProductMap(raw: string): Map<string, Product> {
  const data: ProductData = JSON.parse(raw);
  if (data.version !== 2) throw new Error(`Unsupported data version: ${data.version}`);

  // Build index from data.fields to our known keys
  const fieldIndex = new Map<number, keyof Product>();
  for (let i = 0; i < data.fields.length; i++) {
    const key = data.fields[i] as keyof Product;
    if (PRODUCT_KEYS.includes(key)) {
      fieldIndex.set(i, key);
    }
  }

  const map = new Map<string, Product>();
  for (const tuple of data.products) {
    const product = {} as Record<string, unknown>;
    for (const key of PRODUCT_KEYS) {
      product[key] = null;
    }
    for (const [i, key] of fieldIndex) {
      product[key] = tuple[i] ?? null;
    }
    if (typeof product.slug === "string") {
      map.set(product.slug, product as unknown as Product);
    }
  }
  return map;
}

export async function loadProductData(): Promise<Map<string, Product> | null> {
  // Session override (from file import) takes priority
  const session = await chrome.storage.session.get("productDataOverride");
  if (typeof session.productDataOverride === "string") {
    return buildProductMap(session.productDataOverride);
  }
  const result = await chrome.storage.local.get("productData");
  const raw = result.productData;
  if (typeof raw !== "string") return null;
  return buildProductMap(raw);
}
