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
    // 【安全机制】解析失败时先备份再重置，防止数据丢失
    const backupPath = `${filePath}.backup-${Date.now()}`;
    try {
      fs.copyFileSync(filePath, backupPath);
      console.warn(`[store] JSON parse failed for ${filePath}, backed up to ${backupPath} before reset`);
    } catch (backupErr) {
      console.error(`[store] Failed to backup ${filePath}:`, backupErr?.message);
    }
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

/**
 * 宽泛合并 topicKey 集合（slugify 后的小写值）
 * 这些 topic 下的同日记录应该合并，避免 cron/heartbeat 反复写入
 */
const BROAD_MERGE_TOPIC_KEYS = new Set([
  "openclaw",         // slugify("OpenClaw")
  "会话推进",
  "身份设定",
  "用户设定",
  "工具偏好",
  "心跳规则",
  "启动流程",
  "模型配置",
  "会话状态",
  "whatsapp",
  "抖音相关",
]);

/**
 * 判断两条 L0 是否应合并。
 * 现在会回溯最近 N 条（而非仅最后一条），解决不同 session 交叉写入导致合并失效的问题。
 */
function shouldMergeL0(existing, item) {
  if (!existing || !item) return false;
  if ((existing.topicKey || "") !== (item.topicKey || "")) return false;
  if ((existing.timelineKey || "") !== (item.timelineKey || "")) return false;

  if (BROAD_MERGE_TOPIC_KEYS.has(String(existing.topicKey || ""))) return true;

  if ((existing.actionType || "") !== (item.actionType || "")) return false;
  return similarSummary(existing.summaryShort, item.summaryShort);
}

/**
 * 查找 store 中最近 windowSize 条记录里是否有可以合并的。
 * 解决：cron 和 main session 交叉写入时，新 item 只和最后一条比较导致合并失败。
 */
const MERGE_WINDOW = 5;

export function appendL0Item(item) {
  const store = loadL0Store();
  const items = store.items;
  const len = items.length;

  // 回溯最近 MERGE_WINDOW 条，找到可合并的就合并
  let merged = false;
  for (let i = len - 1; i >= Math.max(0, len - MERGE_WINDOW); i--) {
    if (shouldMergeL0(items[i], item)) {
      items[i] = {
        ...items[i],
        summaryShort: item.summaryShort.length >= items[i].summaryShort.length ? item.summaryShort : items[i].summaryShort,
        importance: Math.max(Number(items[i].importance) || 0, Number(item.importance) || 0),
        entities: Array.from(new Set([...(items[i].entities || []), ...(item.entities || [])])).slice(0, 12),
        resultTag: item.resultTag || items[i].resultTag,
        timestamp: item.timestamp || items[i].timestamp,
        turnKey: item.turnKey || items[i].turnKey,
      };
      merged = true;
      break;
    }
  }

  if (!merged) {
    items.push(item);
  }

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
      
      let score = queryMatchScore(query, haystack);
      
      // 【新增】话题关键词加权
      const q = normalize(query);
      if (q.includes("记忆") && (item.topicKey || "").includes("记忆")) {
        score += 1.5;
      }
      if (q.includes("架构") && (item.summaryShort || "").toLowerCase().includes("架构")) {
        score += 1.2;
      }
      if (q.includes("问题") && (item.summaryShort || "").toLowerCase().includes("问题")) {
        score += 1.0;
      }
      
      // 【关键】弱 L0 降权：importance 低的排在后面
      const importance = Number(item.importance) || 0.4;
      if (importance <= 0.25) {
        score *= 0.3; // 弱 L0 得分打 3 折
      }
      
      return { item, score };
    })
    .filter((entry) => entry.score > 0.05)
    .sort((a, b) => {
      // 【优化】先按 score 排序，score 相同时按 importance 排序
      if (Math.abs(a.score - b.score) > 0.01) {
        return b.score - a.score;
      }
      return (b.item.importance || 0) - (a.item.importance || 0);
    })
    .slice(0, limit)
    .map((entry) => entry.item);
  
  // 【修复】如果完全没匹配到，返回最近的几条（但排除弱 L0）
  if (matches.length === 0) {
    const recent = store.items.slice(-Math.min(limit * 2, 16)).reverse();
    // 优先返回非弱 L0
    const strong = recent.filter(item => (item.importance || 0) > 0.25);
    if (strong.length >= limit) {
      return strong.slice(0, limit);
    }
    // 如果非弱 L0 不够，补充一些弱 L0
    return [...strong, ...recent.filter(item => (item.importance || 0) <= 0.25)].slice(0, limit);
  }
  
  return matches;
}
