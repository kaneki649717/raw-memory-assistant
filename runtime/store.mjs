import fs from "node:fs";
import { STORE_FILE } from "./paths.mjs";

const L0_STORE_FILE = STORE_FILE.replace(/working-memory-store\.json$/, "working-memory-l0.json");

function ensureStoreFile(filePath, initialValue) {
  fs.mkdirSync(filePath.replace(/\/[^/]+$/, ""), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialValue, null, 2), "utf-8");
  }
}

function ensureStore() {
  ensureStoreFile(STORE_FILE, { version: 1, events: [], decisions: [] });
  ensureStoreFile(L0_STORE_FILE, { version: 1, items: [] });
}

function normalize(text) {
  return String(text || "").toLowerCase();
}

function tokenize(text) {
  return normalize(text).split(/[^\p{L}\p{N}._/-]+/u).filter(Boolean);
}

function extractCjkChunks(text) {
  return normalize(text).match(/[\p{Script=Han}]{2,}/gu) ?? [];
}

function cjkNgrams(text, min = 2, max = 4) {
  const grams = new Set();
  for (const chunk of extractCjkChunks(text)) {
    for (let size = min; size <= max; size += 1) {
      if (chunk.length < size) continue;
      for (let i = 0; i <= chunk.length - size; i += 1) {
        grams.add(chunk.slice(i, i + size));
      }
    }
  }
  return [...grams];
}

function queryMatchScore(query, haystack) {
  const q = normalize(query).trim();
  const text = normalize(haystack);
  if (!q || !text) return 0;

  let score = 0;
  if (text.includes(q)) score += 2.5;

  const qTokens = tokenize(q);
  if (qTokens.length) {
    let tokenHits = 0;
    for (const token of qTokens) {
      if (text.includes(token)) tokenHits += 1;
    }
    score += 1.2 * (tokenHits / qTokens.length);
  }

  const qChunks = extractCjkChunks(q);
  if (qChunks.length) {
    let chunkHits = 0;
    for (const chunk of qChunks) {
      if (text.includes(chunk)) chunkHits += 1;
      else if (chunk.length >= 4) {
        const head = chunk.slice(0, Math.min(4, chunk.length));
        const tail = chunk.slice(Math.max(0, chunk.length - 4));
        if ((head && text.includes(head)) || (tail && text.includes(tail))) chunkHits += 0.5;
      }
    }
    score += 1.4 * (chunkHits / qChunks.length);
  }

  const qGrams = cjkNgrams(q, 2, 4);
  if (qGrams.length) {
    let gramHits = 0;
    for (const gram of qGrams) {
      if (text.includes(gram)) gramHits += 1;
    }
    score += 1.0 * (gramHits / qGrams.length);
  }

  return score;
}

function rankMatches(items, buildHaystack, query, limit) {
  return items
    .map((item) => ({ item, score: queryMatchScore(query, buildHaystack(item)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function loadStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
}

export function saveStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function loadL0Store() {
  ensureStore();
  return JSON.parse(fs.readFileSync(L0_STORE_FILE, "utf-8"));
}

export function saveL0Store(store) {
  ensureStore();
  fs.writeFileSync(L0_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function appendEvent(event) {
  const store = loadStore();
  store.events.push(event);
  saveStore(store);
}

export function appendDecision(decision) {
  const store = loadStore();
  store.decisions.push(decision);
  saveStore(store);
}

export function appendL0Item(item) {
  const store = loadL0Store();
  store.items.push(item);
  saveL0Store(store);
}

export function readRecentEvents(limit = 12) {
  const store = loadStore();
  return store.events.slice(-limit).reverse();
}

export function readRecentDecisions(limit = 12) {
  const store = loadStore();
  return store.decisions.slice(-limit).reverse();
}

export function readRecentL0Items(limit = 12) {
  const store = loadL0Store();
  return store.items.slice(-limit).reverse();
}

export function findEventsByEntity(query, limit = 8) {
  const store = loadStore();
  return rankMatches(
    [...store.events].reverse(),
    (item) => [item.summaryShort, item.resultTag ?? "", item.actionType, ...(item.entities ?? [])].join("\n"),
    query,
    limit,
  );
}

export function findDecisionsByEntity(query, limit = 8) {
  const store = loadStore();
  return rankMatches(
    [...store.decisions].reverse(),
    (item) => [item.title, item.decisionText, item.whyText ?? "", item.outcomeText ?? "", ...(item.entities ?? []), ...(item.files ?? []), ...(item.configKeys ?? [])].join("\n"),
    query,
    limit,
  );
}

export function findL0ByQuery(query, limit = 8) {
  const store = loadL0Store();
  return rankMatches(
    [...store.items].reverse(),
    (item) => [item.summaryShort, item.topic ?? "", item.actionType ?? "", ...(item.entities ?? []), item.resultTag ?? ""].join("\n"),
    query,
    limit,
  );
}
