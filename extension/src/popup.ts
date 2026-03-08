const productCountEl = document.getElementById("productCount")!;
const lastCheckEl = document.getElementById("lastCheck")!;
const lastNewDataEl = document.getElementById("lastNewData")!;
const feedbackEl = document.getElementById("feedback")!;
const reloadBtn = document.getElementById("reloadBtn") as HTMLButtonElement;
const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
const importBtn = document.getElementById("importBtn") as HTMLButtonElement;
const fileInput = document.getElementById("file") as HTMLInputElement;

function formatTime(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString();
}

async function refreshStatus(): Promise<void> {
  const result = await chrome.storage.local.get(["productData", "lastCheckTime", "lastNewDataTime"]);
  const session = await chrome.storage.session.get("productDataOverride");

  lastCheckEl.textContent = `Last update check: ${formatTime(result.lastCheckTime as string ?? null)}`;
  lastNewDataEl.textContent = `Last new data: ${formatTime(result.lastNewDataTime as string ?? null)}`;

  const override = session.productDataOverride;
  const raw = typeof override === "string" ? override : result.productData;
  if (typeof raw !== "string") {
    productCountEl.innerHTML = '<span class="error">No data loaded</span>';
    return;
  }
  try {
    const data = JSON.parse(raw);
    const count = data.products?.length ?? 0;
    const suffix = typeof override === "string" ? " (file override)" : "";
    productCountEl.innerHTML = `Products loaded: <strong>${count.toLocaleString()}</strong>${suffix}`;
  } catch {
    productCountEl.innerHTML = '<span class="error">Data corrupted</span>';
  }
}

reloadBtn.addEventListener("click", async () => {
  reloadBtn.disabled = true;
  feedbackEl.textContent = "Checking...";
  try {
    // Clear any file override so content script reverts to stored remote data
    await chrome.storage.session.remove("productDataOverride");
    await chrome.runtime.sendMessage({ type: "reloadRemoteData" });
    feedbackEl.innerHTML = '<span class="success">Done</span>';
    await refreshStatus();
  } catch (e) {
    feedbackEl.innerHTML = `<span class="error">Error: ${e}</span>`;
  } finally {
    reloadBtn.disabled = false;
  }
});

clearBtn.addEventListener("click", async () => {
  await chrome.storage.session.remove("productDataOverride");
  await chrome.storage.local.remove(["productData", "dataLastModified", "lastCheckTime", "lastNewDataTime"]);
  feedbackEl.innerHTML = '<span class="success">Data cleared</span>';
  await refreshStatus();
});

importBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    const text = reader.result as string;
    try {
      const data = JSON.parse(text);
      if (data.version !== 2) {
        feedbackEl.innerHTML = `<span class="error">Invalid version: ${data.version} (expected 2)</span>`;
        return;
      }
      if (!Array.isArray(data.products)) {
        feedbackEl.innerHTML = '<span class="error">Missing products array</span>';
        return;
      }
      await chrome.storage.session.set({ productDataOverride: text });
      feedbackEl.innerHTML = `<span class="success">Imported ${data.products.length.toLocaleString()} products</span>`;
      await refreshStatus();
    } catch (e) {
      feedbackEl.innerHTML = `<span class="error">Invalid JSON: ${e}</span>`;
    }
  };
  reader.readAsText(file);
  fileInput.value = "";
});

refreshStatus();
