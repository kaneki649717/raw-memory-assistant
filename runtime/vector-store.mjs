import fs from "node:fs";
import { STORE_DIR, VECTOR_STORE_FILE } from "./paths.mjs";

function ensureDir() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

function writeJsonAtomic(filePath, data) {
  ensureDir();
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function ensureVectorStore() {
  ensureDir();
  if (!fs.existsSync(VECTOR_STORE_FILE)) {
    writeJsonAtomic(VECTOR_STORE_FILE, { version: 2, items: [] });
  }
}

function normalizeStore(store) {
  return {
    version: Number(store?.version) || 2,
    items: Array.isArray(store?.items) ? store.items : [],
  };
}

export function loadVectorStore() {
  ensureVectorStore();
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(VECTOR_STORE_FILE, "utf-8")));
  } catch {
    return { version: 2, items: [] };
  }
}

export function saveVectorStore(store) {
  ensureVectorStore();
  writeJsonAtomic(VECTOR_STORE_FILE, normalizeStore(store));
}

export function upsertVectorItems(items) {
  const store = loadVectorStore();
  const byId = new Map(store.items.map((item) => [item.id, item]));
  for (const item of items) byId.set(item.id, item);
  store.items = [...byId.values()];
  saveVectorStore(store);
}

export function readVectorItems() {
  return loadVectorStore().items;
}
