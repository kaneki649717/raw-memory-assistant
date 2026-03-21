import fs from "node:fs";
import path from "node:path";
import { VECTOR_STORE_FILE } from "./paths.mjs";

function ensureVectorStore() {
  fs.mkdirSync(path.dirname(VECTOR_STORE_FILE), { recursive: true });
  if (!fs.existsSync(VECTOR_STORE_FILE)) {
    fs.writeFileSync(VECTOR_STORE_FILE, JSON.stringify({ version: 1, items: [] }, null, 2), "utf-8");
  }
}

export function loadVectorStore() {
  ensureVectorStore();
  return JSON.parse(fs.readFileSync(VECTOR_STORE_FILE, "utf-8"));
}

export function saveVectorStore(store) {
  ensureVectorStore();
  fs.writeFileSync(VECTOR_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
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
