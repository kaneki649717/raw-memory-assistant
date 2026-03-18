import fs from "node:fs";

const REPLAY_STORE_FILE = "C:/Users/1/.openclaw/workspace/memory/working-memory/store/replay-store.json";

function ensureReplayStore() {
  fs.mkdirSync(REPLAY_STORE_FILE.replace(/\/replay-store\.json$/, ""), { recursive: true });
  if (!fs.existsSync(REPLAY_STORE_FILE)) {
    fs.writeFileSync(REPLAY_STORE_FILE, JSON.stringify({ version: 2, items: [] }, null, 2), "utf-8");
  }
}

function normalize(text) {
  return String(text || "").toLowerCase();
}

function tokenize(text) {
  return normalize(text).split(/[^\p{L}\p{N}._/-]+/u).filter(Boolean);
}

function queryMatchScore(query, haystack) {
  const q = normalize(query).trim();
  const text = normalize(haystack);
  if (!q || !text) return 0;

  let score = 0;
  if (text.includes(q)) score += 3;

  const qTokens = tokenize(q);
  if (qTokens.length) {
    let tokenHits = 0;
    for (const token of qTokens) {
      if (text.includes(token)) tokenHits += 1;
    }
    score += 1.5 * (tokenHits / qTokens.length);
  }

  const cjkParts = q.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  if (cjkParts.length) {
    let hits = 0;
    for (const part of cjkParts) {
      if (text.includes(part)) hits += 1;
    }
    score += 1.2 * (hits / cjkParts.length);
  }

  return score;
}

export function loadReplayStore() {
  ensureReplayStore();
  // 【修复】明确 UTF-8 读取并移除 BOM
  const raw = fs.readFileSync(REPLAY_STORE_FILE, "utf-8");
  const cleaned = raw.replace(/^\uFEFF/, "");
  return JSON.parse(cleaned);
}

function writeJsonAtomic(filePath, data) {
  ensureReplayStore();
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  // 【修复】确保 UTF-8 写入
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, json, { encoding: "utf-8" });
  fs.renameSync(tmpPath, filePath);
}

export function saveReplayStore(store) {
  ensureReplayStore();
  writeJsonAtomic(REPLAY_STORE_FILE, store);
}

export function appendReplayItem(item) {
  const store = loadReplayStore();
  const dedupeKey = `${item.sessionId}::${item.userText}::${item.assistantText}`;
  const exists = store.items.some((entry) => `${entry.sessionId}::${entry.userText}::${entry.assistantText}` === dedupeKey);
  if (exists) return;
  store.items.push(item);
  store.items.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  saveReplayStore(store);
}

export function findReplayByEventId(eventId) {
  return loadReplayStore().items.find((item) => item.eventId === eventId) ?? null;
}

export function findReplayByDecisionId(decisionId) {
  return loadReplayStore().items.find((item) => item.decisionId === decisionId) ?? null;
}

export function searchReplay(query, limit = 5) {
  return loadReplayStore().items
    .map((item) => ({
      ...item,
      _score: queryMatchScore(query, [item.userText, item.assistantText, ...(item.entities ?? []), ...(item.files ?? []), item.createdAt ?? ""].join("\n")),
    }))
    .filter((item) => item._score > 0)
    .sort((a, b) => b._score - a._score || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, limit)
    .map(({ _score, ...item }) => item);
}
