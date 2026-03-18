import fs from "node:fs";
import { L0_STORE_FILE, STORE_DIR, STORE_FILE } from "./paths.mjs";

function ensureDir() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

function safeParseJson(filePath, fallbackValue) {
  try {
    // 【修复】明确使用 UTF-8 BOM 处理
    const raw = fs.readFileSync(filePath, "utf-8");
    // 移除可能的 BOM
    const cleaned = raw.replace(/^\uFEFF/, "");
    return JSON.parse(cleaned);
  } catch {
    return fallbackValue;
  }
}

function writeJsonAtomic(filePath, data) {
  ensureDir();
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  // 【修复】确保 UTF-8 写入，不带 BOM
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, json, { encoding: "utf-8" });
  fs.renameSync(tmpPath, filePath);
}

function ensureStoreFile(filePath, initialValue) {
  ensureDir();
  if (!fs.existsSync(filePath)) {
    writeJsonAtomic(filePath, initialValue);
    return initialValue;
  }
  const parsed = safeParseJson(filePath, null);
  if (!parsed || typeof parsed !== "object") {
    writeJsonAtomic(filePath, initialValue);
    return initialValue;
  }
  return parsed;
}

function ensureStore() {
  ensureStoreFile(STORE_FILE, { version: 2, events: [], decisions: [] });
  ensureStoreFile(L0_STORE_FILE, { version: 2, items: [] });
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

function normalizeStoreShape(store) {
  return {
    version: Number(store?.version) || 2,
    events: Array.isArray(store?.events) ? store.events : [],
    decisions: Array.isArray(store?.decisions) ? store.decisions : [],
  };
}

function normalizeL0Shape(store) {
  return {
    version: Number(store?.version) || 2,
    items: Array.isArray(store?.items) ? store.items : [],
  };
}

export function loadStore() {
  ensureStore();
  return normalizeStoreShape(ensureStoreFile(STORE_FILE, { version: 2, events: [], decisions: [] }));
}

export function saveStore(store) {
  ensureStore();
  writeJsonAtomic(STORE_FILE, normalizeStoreShape(store));
}

export function loadL0Store() {
  ensureStore();
  return normalizeL0Shape(ensureStoreFile(L0_STORE_FILE, { version: 2, items: [] }));
}

export function saveL0Store(store) {
  ensureStore();
  writeJsonAtomic(L0_STORE_FILE, normalizeL0Shape(store));
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

function normalizeCompact(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function similarSummary(a, b) {
  const x = normalizeCompact(a);
  const y = normalizeCompact(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  return false;
}

function shouldMergeL0(existing, item) {
  if (!existing || !item) return false;
  if ((existing.topicKey || "") !== (item.topicKey || "")) return false;
  if ((existing.timelineKey || "") !== (item.timelineKey || "")) return false;

  const broadMergeTopics = new Set([
    "会话推进",
    "openclaw",
    "身份设定",
    "用户设定",
    "工具偏好",
    "心跳规则",
    "启动流程",
    "模型配置",
    "会话状态",
    "whatsapp",
  ]);

  if (broadMergeTopics.has(String(existing.topicKey || ""))) return true;
  if ((existing.actionType || "") !== (item.actionType || "")) return false;
  return similarSummary(existing.summaryShort, item.summaryShort);
}

export function appendL0Item(item) {
  const store = loadL0Store();
  const last = store.items[store.items.length - 1];
  if (shouldMergeL0(last, item)) {
    store.items[store.items.length - 1] = {
      ...last,
      summaryShort: item.summaryShort.length >= last.summaryShort.length ? item.summaryShort : last.summaryShort,
      importance: Math.max(Number(last.importance) || 0, Number(item.importance) || 0),
      entities: Array.from(new Set([...(last.entities || []), ...(item.entities || [])])).slice(0, 12),
      resultTag: item.resultTag || last.resultTag,
      timestamp: item.timestamp || last.timestamp,
      turnKey: item.turnKey || last.turnKey,
    };
    saveL0Store(store);
    return;
  }
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

export function loadAllEvents() {
  return loadStore().events;
}

export function loadAllDecisions() {
  return loadStore().decisions;
}

export function loadAllL0Items() {
  return loadL0Store().items;
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
  
  // 【优化】增强中文匹配，多字段检索
  const matches = [...store.items].reverse()
    .map((item) => {
      const haystack = [
        item.summaryShort, 
        item.topic ?? "", 
        item.actionType ?? "", 
        ...(item.entities ?? []), 
        item.resultTag ?? "",
        item.topicKey ?? "",
        item.timelineKey ?? "",
      ].join("\n");
      
      const score = queryMatchScore(query, haystack);
      
      // 【新增】话题关键词加权
      const q = normalize(query);
      if (q.includes("记忆") && (item.topicKey || "").includes("记忆")) {
        return { item, score: score + 1.5 };
      }
      if (q.includes("架构") && (item.summaryShort || "").toLowerCase().includes("架构")) {
        return { item, score: score + 1.2 };
      }
      if (q.includes("问题") && (item.summaryShort || "").toLowerCase().includes("问题")) {
        return { item, score: score + 1.0 };
      }
      
      return { item, score };
    })
    .filter((entry) => entry.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
  
  // 【修复】如果完全没匹配到，返回最近的几条
  if (matches.length === 0) {
    return store.items.slice(-Math.min(limit, 8)).reverse();
  }
  
  return matches;
}
