import fs from "node:fs";
import path from "node:path";
import { REPLAY_STORE_FILE } from "./paths.mjs";

function ensureReplayStore() {
  fs.mkdirSync(path.dirname(REPLAY_STORE_FILE), { recursive: true });
  if (!fs.existsSync(REPLAY_STORE_FILE)) {
    fs.writeFileSync(REPLAY_STORE_FILE, JSON.stringify({ version: 1, items: [] }, null, 2), "utf-8");
  }
}

export function loadReplayStore() {
  ensureReplayStore();
  return JSON.parse(fs.readFileSync(REPLAY_STORE_FILE, "utf-8"));
}

export function saveReplayStore(store) {
  ensureReplayStore();
  fs.writeFileSync(REPLAY_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function appendReplayItem(item) {
  const store = loadReplayStore();
  store.items.push(item);
  saveReplayStore(store);
}

export function findReplayByEventId(eventId) {
  return loadReplayStore().items.find((item) => item.eventId === eventId) ?? null;
}

export function findReplayByDecisionId(decisionId) {
  return loadReplayStore().items.find((item) => item.decisionId === decisionId) ?? null;
}

export function searchReplay(query, limit = 5) {
  const q = String(query).toLowerCase();
  return loadReplayStore().items
    .filter((item) => [item.userText, item.assistantText, ...(item.entities ?? []), ...(item.files ?? [])].join("\n").toLowerCase().includes(q))
    .slice(-limit)
    .reverse();
}
