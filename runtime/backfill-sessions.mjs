import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ingestTurn } from "../../../memory/working-memory/runtime/ingest.mjs";

function extractTextFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => item && item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function parseJsonlSession(filePath) {
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/).filter(Boolean);
  const turns = [];
  let pendingUser = null;
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== "message" || !entry.message) continue;
    const role = entry.message.role;
    const text = extractTextFromContent(entry.message.content);
    if (!text) continue;
    const timestamp = entry.message.timestamp || entry.timestamp;
    if (role === "user") {
      pendingUser = { text, timestamp };
      continue;
    }
    if (role === "assistant" && pendingUser) {
      turns.push({ userText: pendingUser.text, assistantText: text, timestamp: timestamp || pendingUser.timestamp });
      pendingUser = null;
    }
  }
  return turns;
}

function buildSeenSet(storeDir) {
  const replayPath = path.join(storeDir, "replay-store.json");
  if (!fs.existsSync(replayPath)) return new Set();
  try {
    const replay = JSON.parse(fs.readFileSync(replayPath, "utf-8"));
    return new Set((replay.items || []).map((item) => `${item.sessionId}::${item.timestamp || item.createdAt}::${item.userText}::${item.assistantText}`));
  } catch {
    return new Set();
  }
}

async function main() {
  const workspaceDir = process.argv[2] || "C:/Users/1/.openclaw/workspace";
  const sessionsDir = process.argv[3] || "C:/Users/1/.openclaw/agents/main/sessions";
  const storeDir = path.join(workspaceDir, "memory", "working-memory", "store");
  const seen = buildSeenSet(storeDir);

  const files = fs.readdirSync(sessionsDir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort((a, b) => {
      const aTime = fs.statSync(path.join(sessionsDir, a)).mtimeMs;
      const bTime = fs.statSync(path.join(sessionsDir, b)).mtimeMs;
      return aTime - bTime;
    });

  let ingested = 0;
  let skipped = 0;

  for (const file of files) {
    const sessionId = file.replace(/\.jsonl$/, "");
    const fullPath = path.join(sessionsDir, file);
    const turns = parseJsonlSession(fullPath);
    for (const turn of turns) {
      const key = `${sessionId}::${turn.timestamp || ""}::${turn.userText}::${turn.assistantText}`;
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      await ingestTurn({
        sessionId,
        userText: turn.userText,
        assistantText: turn.assistantText,
        chatType: "direct",
        timestamp: turn.timestamp,
      });
      seen.add(key);
      ingested += 1;
    }
  }

  process.stdout.write(`${JSON.stringify({ ok: true, ingested, skipped, sessions: files.length }, null, 2)}\n`);
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2)}\n`);
  process.exitCode = 1;
});
