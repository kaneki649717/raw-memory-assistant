import fs from "node:fs";
import path from "node:path";
import { STORE_DIR, STORE_FILE } from "./paths.js";
import type { WorkingMemoryDecision, WorkingMemoryEvent, WorkingMemoryStore } from "./types.js";

function ensureStore(): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    const initial: WorkingMemoryStore = { version: 1, events: [], decisions: [] };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2), "utf-8");
  }
}

export function loadStore(): WorkingMemoryStore {
  ensureStore();
  const raw = fs.readFileSync(STORE_FILE, "utf-8");
  return JSON.parse(raw) as WorkingMemoryStore;
}

export function saveStore(store: WorkingMemoryStore): void {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function appendEvent(event: WorkingMemoryEvent): void {
  const store = loadStore();
  store.events.push(event);
  saveStore(store);
}

export function appendDecision(decision: WorkingMemoryDecision): void {
  const store = loadStore();
  store.decisions.push(decision);
  saveStore(store);
}

export function readRecentEvents(limit = 12): WorkingMemoryEvent[] {
  const store = loadStore();
  return store.events.slice(-limit).reverse();
}

export function readRecentDecisions(limit = 12): WorkingMemoryDecision[] {
  const store = loadStore();
  return store.decisions.slice(-limit).reverse();
}

export function findDecisionsByEntity(query: string, limit = 8): WorkingMemoryDecision[] {
  const q = query.toLowerCase();
  const store = loadStore();
  return store.decisions
    .filter(item => {
      const hay = [item.title, item.decisionText, item.whyText ?? "", item.outcomeText ?? "", ...item.entities, ...item.files, ...item.configKeys].join("\n").toLowerCase();
      return hay.includes(q);
    })
    .slice(-limit)
    .reverse();
}

export function findEventsByEntity(query: string, limit = 8): WorkingMemoryEvent[] {
  const q = query.toLowerCase();
  const store = loadStore();
  return store.events
    .filter(item => {
      const hay = [item.summaryShort, item.resultTag ?? "", item.actionType, ...(item.entities ?? [])].join("\n").toLowerCase();
      return hay.includes(q);
    })
    .slice(-limit)
    .reverse();
}
