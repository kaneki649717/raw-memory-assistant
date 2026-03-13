import path from "node:path";
import { loadProjectConfig, resolveProjectPath } from "./config.mjs";

const config = loadProjectConfig();
const storageRoot = config?.storage?.root || "./data";

export const WORKING_MEMORY_ROOT = path.resolve(resolveProjectPath(storageRoot));
export const STORE_FILE = path.join(WORKING_MEMORY_ROOT, "store", "working-memory-store.json");
export const L0_STORE_FILE = path.join(WORKING_MEMORY_ROOT, "store", "working-memory-l0.json");
export const REPLAY_STORE_FILE = path.join(WORKING_MEMORY_ROOT, "store", "replay-store.json");
export const VECTOR_STORE_FILE = path.join(WORKING_MEMORY_ROOT, "store", "vector-store.json");
export const PROMPTS_DIR = resolveProjectPath("prompts");
