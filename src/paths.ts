import path from "node:path";

const PROJECT_ROOT = path.resolve(__dirname ?? ".", "..");

export const WORKING_MEMORY_ROOT = path.join(PROJECT_ROOT, "data");
export const STORE_DIR = path.join(WORKING_MEMORY_ROOT, "store");
export const STORE_FILE = path.join(STORE_DIR, "working-memory-store.json");
export const PROMPTS_DIR = path.join(PROJECT_ROOT, "prompts");
