/**
 * Launch a headless Chromium browser, visit Sainsbury's, wait for
 * Akamai to solve, and return the live cookies as a string
 * ready for an axios `Cookie` header.
 */

import fs from "fs";
import puppeteer, { type Browser } from "puppeteer-core";

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  process.env.CHROME_PATH,
].filter(Boolean) as string[];

function findBrowser(): string {
  for (const p of CHROME_PATHS) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  throw new Error(
    `No Chromium browser found. Set CHROME_PATH env var.\nSearched: ${CHROME_PATHS.join(", ")}`
  );
}

export async function harvestCookies(): Promise<string> {
  const executablePath = findBrowser();
  let browser: Browser | undefined;

  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    // Visit the homepage — Akamai sensor JS runs in the real browser engine.
    // Use domcontentloaded (fast) then wait for the _abck cookie to get a
    // valid value — that's what proves the sensor completed.
    await page.goto("https://www.sainsburys.co.uk/gol-ui/groceries/", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    // Poll until the _abck cookie is solved (no more -1~-1 pattern)
    // or bail after 15 seconds (cookies from the first load often suffice)
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const cookies = await page.cookies("https://www.sainsburys.co.uk");
      const abck = cookies.find((c) => c.name === "_abck");
      if (abck && !abck.value.includes("~-1~-1")) break;
      await new Promise((r) => setTimeout(r, 1_000));
    }

    const cookies = await page.cookies("https://www.sainsburys.co.uk");
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    return cookieString;
  } finally {
    await browser?.close();
  }
}

/**
 * Build an axios config `headers` object with the harvested cookies
 * and browser-like headers for API requests.
 */
export function apiHeaders(cookies: string): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-GB,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    Referer: "https://www.sainsburys.co.uk/gol-ui/groceries/",
    Cookie: cookies,
  };
}
