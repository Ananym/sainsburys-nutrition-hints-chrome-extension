const DATA_URL = "https://pub-fa2a704870f742b3b1d491795b713799.r2.dev/sainsburys-hints-products.json";
const ALARM_NAME = "refresh-data";

async function fetchAndStore(): Promise<void> {
  try {
    const headers: Record<string, string> = {};

    // Use stored Last-Modified to avoid re-downloading unchanged data
    const stored = await chrome.storage.local.get("dataLastModified");
    if (stored.dataLastModified) {
      headers["If-Modified-Since"] = stored.dataLastModified as string;
    }

    const res = await fetch(DATA_URL, { headers });

    // Record that we checked, regardless of outcome
    await chrome.storage.local.set({ lastCheckTime: new Date().toISOString() });

    if (res.status === 304) {
      console.log("[SH] Data not modified, skipping update");
      return;
    }

    if (!res.ok) {
      console.error(`[SH] Fetch failed: ${res.status}`);
      return;
    }

    const raw = await res.text();
    const data = JSON.parse(raw);
    if (data.version !== 2) {
      console.error(`[SH] Unsupported data version: ${data.version}`);
      return;
    }

    const lastModified = res.headers.get("Last-Modified") ?? new Date().toUTCString();
    const now = new Date().toISOString();
    await chrome.storage.local.set({
      productData: raw,
      dataLastModified: lastModified,
      lastNewDataTime: now,
    });
    console.log(`[SH] Stored ${data.products.length} products (generated: ${data.generated})`);
  } catch (e) {
    console.error("[SH] Fetch error:", e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
  fetchAndStore();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 24 * 60 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    fetchAndStore();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  const type = (message as { type: string }).type;

  if (type === "getDataStatus") {
    chrome.storage.local.get(["productData", "lastCheckTime", "lastNewDataTime"]).then((result) => {
      const raw = result.productData;
      if (typeof raw !== "string") {
        sendResponse({ loaded: false, lastCheckTime: result.lastCheckTime ?? null, lastNewDataTime: result.lastNewDataTime ?? null });
        return;
      }
      try {
        const data = JSON.parse(raw);
        sendResponse({
          loaded: true,
          count: data.products?.length ?? 0,
          generated: data.generated ?? null,
          lastCheckTime: result.lastCheckTime ?? null,
          lastNewDataTime: result.lastNewDataTime ?? null,
        });
      } catch {
        sendResponse({ loaded: false, lastCheckTime: result.lastCheckTime ?? null, lastNewDataTime: result.lastNewDataTime ?? null });
      }
    });
    return true;
  }

  if (type === "reloadRemoteData") {
    fetchAndStore().then(() => sendResponse({ ok: true }));
    return true;
  }
});
