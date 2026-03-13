import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

export function resolveProjectPath(...parts) {
  return path.join(PROJECT_ROOT, ...parts);
}

export function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function loadProjectConfig() {
  const configPath = process.env.AGENT_MEMORY_CONFIG_PATH || resolveProjectPath("config.json");
  return readJsonIfExists(configPath) ?? {};
}
