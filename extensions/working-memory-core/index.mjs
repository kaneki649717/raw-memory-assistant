import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

const SEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    query: { type: "string", description: "Recall query for prior work, decisions, or raw replay." },
    maxResults: { type: "number", minimum: 1, maximum: 20 },
    minScore: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["query"]
};

const GET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    path: { type: "string", description: "Path returned by memory_search, e.g. working-memory/decision." },
    from: { type: "number", minimum: 1 },
    lines: { type: "number", minimum: 1 }
  },
  required: ["path"]
};

function getPluginConfig(api) {
  const cfg = api.pluginConfig ?? {};
  return {
    workspaceDir: cfg.workspaceDir || process.env.OPENCLAW_WORKSPACE_DIR || "C:\\Users\\1\\.openclaw\\workspace",
    cliRelativePath: cfg.cliRelativePath || "memory/working-memory/cli.mjs",
    cacheRelativePath: cfg.cacheRelativePath || "memory/working-memory/runtime-cache/last-recall.json",
    maxResults: Math.max(1, Math.min(Number(cfg.maxResults) || 8, 20)),
  };
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      if (item.type === "text") return item.text || "";
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildBucketLines(bucket, items) {
  return items.map((item, index) => {
    const timestamp = item?.timestamp || item?.createdAt || item?.meta?.timestamp || item?.meta?.createdAt || "";
    const source = item?.source || item?.id || `${bucket}-${index + 1}`;
    if (bucket === "l0") {
      return `${index + 1}. [${timestamp}] ${normalizeText(item?.summaryShort)} | topic=${normalizeText(item?.topic)} | action=${normalizeText(item?.actionType)} | id=${source}`;
    }
    if (bucket === "timeline") {
      return `${index + 1}. [${timestamp}] ${normalizeText(item?.summaryShort)} | topic=${normalizeText(item?.topic)} | action=${normalizeText(item?.actionType)} | id=${source}`;
    }
    if (bucket === "decision") {
      return `${index + 1}. [${timestamp}] ${normalizeText(item?.title)} | ${normalizeText(item?.decisionText)} | id=${source}`;
    }
    if (bucket === "rawEvidence") {
      return `${index + 1}. [${timestamp}] ${normalizeText(item?.text || `用户: ${item?.userText || ""} 助手: ${item?.assistantText || ""}`)} | id=${source}`;
    }
    return `${index + 1}. [${timestamp}] ${normalizeText(item?.text)} | source=${source}`;
  });
}

function readWorkingMemoryStores(api) {
  const cfg = getPluginConfig(api);
  const base = path.resolve(cfg.workspaceDir, "memory/working-memory/store");
  const readJson = (name, fallback) => {
    const filePath = path.join(base, name);
    if (!fs.existsSync(filePath)) return fallback;
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return fallback;
    }
  };
  return {
    working: readJson("working-memory-store.json", { version: 1, events: [], decisions: [] }),
    l0: readJson("working-memory-l0.json", { version: 1, items: [] }),
    replay: readJson("replay-store.json", { version: 1, items: [] }),
    vector: readJson("vector-store.json", { version: 1, items: [] }),
  };
}

function runRecall(api, query, maxResults) {
  const cfg = getPluginConfig(api);
  const cliPath = path.resolve(cfg.workspaceDir, cfg.cliRelativePath);
  if (!fs.existsSync(cliPath)) {
    return null;
  }

  const stdout = execFileSync(process.execPath, [cliPath, "recall", query], {
    cwd: cfg.workspaceDir,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 16,
  });
  const parsed = JSON.parse(stdout);
  if (!parsed?.ok || !parsed?.contextPack) {
    return null;
  }

  const cachePath = path.resolve(cfg.workspaceDir, cfg.cacheRelativePath);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(
    cachePath,
    JSON.stringify(
      {
        query,
        cachedAt: new Date().toISOString(),
        intent: parsed.intent,
        contextPack: parsed.contextPack,
        bundle: parsed.bundle,
      },
      null,
      2,
    ),
    "utf8",
  );

  const top = Array.isArray(parsed?.bundle?.unifiedTop) ? parsed.bundle.unifiedTop : [];
  const primary = Array.isArray(parsed.contextPack.primary) ? parsed.contextPack.primary : [];
  const merged = top.length > 0 ? top : primary;
  const limit = Math.max(1, Math.min(Number(maxResults) || cfg.maxResults, 20));
  const results = merged.slice(0, limit).map((item, index) => ({
    path: `working-memory/${item.bucket || "snippet"}`,
    startLine: index + 1,
    endLine: index + 1,
    score: Math.max(0.1, Number(item?.effectiveScore ?? item?.rerankScore ?? (0.99 - index * 0.05)) || 0.1),
    snippet: `[${parsed.intent}] ${item.text}`,
    citation: `working-memory/${item.bucket || "snippet"}#L${index + 1}`,
  }));

  return {
    results,
    provider: "working-memory",
    model: "iflow/qwen3-max",
    fallback: false,
    citations: "off",
    mode: parsed.intent,
    contextPack: parsed.contextPack,
    bundle: parsed.bundle,
  };
}

function readFromCache(api, relPath, from, lines) {
  if (!String(relPath).startsWith("working-memory/")) {
    return null;
  }

  const cfg = getPluginConfig(api);
  const cachePath = path.resolve(cfg.workspaceDir, cfg.cacheRelativePath);
  const stores = readWorkingMemoryStores(api);

  const bucket = String(relPath).replace(/^working-memory\//, "").trim();
  const rawBucketItems = (() => {
    if (bucket === "l0") return stores.l0.items || [];
    if (bucket === "timeline") return stores.working.events || [];
    if (bucket === "decision") return stores.working.decisions || [];
    if (bucket === "rawEvidence") return stores.replay.items || [];
    if (bucket === "snippet") return stores.vector.items || [];
    return [];
  })();

  if (bucket === "all") {
    const textLines = [
      ...buildBucketLines("l0", stores.l0.items || []),
      ...buildBucketLines("timeline", stores.working.events || []),
      ...buildBucketLines("decision", stores.working.decisions || []),
      ...buildBucketLines("rawEvidence", stores.replay.items || []),
    ];
    const start = Math.max(1, Number(from) || 1);
    const count = Math.max(1, Number(lines) || textLines.length || 1);
    const slice = textLines.slice(start - 1, start - 1 + count);
    return {
      path: relPath,
      text: slice.join("\n"),
      from: start,
      lines: slice.length,
      provider: "working-memory",
      disabled: false,
      source: "store-direct",
    };
  }

  const textLines = [];
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      const bucketKey = `${bucket}Items`;
      const bucketItems = Array.isArray(cached?.bundle?.[bucketKey]) ? cached.bundle[bucketKey] : [];
      const primaryItems = Array.isArray(cached?.contextPack?.primary)
        ? cached.contextPack.primary.filter((item) => item.bucket === bucket)
        : [];
      for (const item of primaryItems) {
        textLines.push(`[${item.bucket}] ${item.text}`);
      }
      textLines.push(...buildBucketLines(bucket, bucketItems));
    } catch {
      // fall through to direct store read
    }
  }

  if (textLines.length === 0) {
    textLines.push(...buildBucketLines(bucket, rawBucketItems));
  }

  const start = Math.max(1, Number(from) || 1);
  const count = Math.max(1, Number(lines) || textLines.length || 1);
  const slice = textLines.slice(start - 1, start - 1 + count);

  return {
    path: relPath,
    text: slice.join("\n"),
    from: start,
    lines: slice.length,
    provider: "working-memory",
    disabled: false,
    source: textLines.length > 0 ? "store-direct" : "cache",
  };
}

function persistIncrementalTurn(api, sessionKey, userText, assistantText) {
  const cfg = getPluginConfig(api);
  const cliPath = path.resolve(cfg.workspaceDir, cfg.cliRelativePath);
  if (!fs.existsSync(cliPath)) return;

  // 【关键修复】cron/subagent 产生的会话不写入记忆
  if (sessionKey && /cron/.test(sessionKey)) return;
  if (sessionKey && /subagent/.test(sessionKey)) return;

  const normalizedUser = normalizeText(userText);
  const normalizedAssistant = normalizeText(assistantText);
  const lowerUser = normalizedUser.toLowerCase();
  if (!normalizedUser || !normalizedAssistant) return;
  if (normalizedUser === "HEARTBEAT_OK" || normalizedUser === "NO_REPLY") return;
  if (lowerUser.includes("a new session was started via /new or /reset")) return;
  if (lowerUser.includes("execute your session startup sequence now")) return;
  if (lowerUser === "你好" || lowerUser === "hi" || lowerUser === "hello") return;

  const cacheDir = path.resolve(cfg.workspaceDir, "memory/working-memory/runtime-cache");
  const statePath = path.join(cacheDir, "ingest-state.json");
  fs.mkdirSync(cacheDir, { recursive: true });
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8"))
    : { version: 1, pairs: {} };

  const key = sessionKey || "unknown-session";
  const hash = crypto.createHash("sha1").update(`${key}\n${normalizedUser}\n${normalizedAssistant}`).digest("hex");
  if (state.pairs[key] === hash) return;

  execFileSync(
    process.execPath,
    [cliPath, "ingest", key, normalizedUser, normalizedAssistant, "direct"],
    {
      cwd: cfg.workspaceDir,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16,
    },
  );

  state.pairs[key] = hash;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

function extractLatestTurn(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  let lastAssistant = "";
  let lastUser = "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const entry = messages[i];
    const role = entry?.role;
    const text = normalizeText(textFromContent(entry?.content));
    if (!text) continue;
    if (!lastAssistant && role === "assistant") {
      lastAssistant = text;
      continue;
    }
    if (lastAssistant && role === "user") {
      lastUser = text;
      break;
    }
  }
  if (!lastUser || !lastAssistant) return null;
  return { userText: lastUser, assistantText: lastAssistant };
}

const plugin = {
  id: "working-memory-core",
  name: "Working Memory (Core)",
  kind: "memory",
  register(api) {
    api.registerTool(
      () => {
        const memorySearchTool = {
          name: "memory_search",
          label: "Memory Search",
          description:
            "Search structured working memory for recent decisions, timeline facts, and raw replay evidence.",
          parameters: SEARCH_SCHEMA,
          execute: async (_toolCallId, params) => {
            const query = String(params?.query || "").trim();
            if (!query) {
              const payload = { results: [], disabled: true, error: "missing query", provider: "working-memory" };
              return {
                content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
                details: payload,
              };
            }
            const result = runRecall(api, query, params?.maxResults);
            const payload = result || {
              results: [],
              disabled: true,
              error: "working-memory recall unavailable",
              provider: "working-memory",
            };
            return {
              content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
              details: payload,
            };
          },
        };

        const memoryGetTool = {
          name: "memory_get",
          label: "Memory Get",
          description:
            "Read a compact working-memory path returned by memory_search, such as working-memory/decision.",
          parameters: GET_SCHEMA,
          execute: async (_toolCallId, params) => {
            const relPath = String(params?.path || "").trim();
            if (!relPath) {
              const payload = { path: relPath, text: "", disabled: true, error: "missing path", provider: "working-memory" };
              return {
                content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
                details: payload,
              };
            }
            const result = readFromCache(api, relPath, params?.from, params?.lines);
            const payload = result || {
              path: relPath,
              text: "",
              disabled: true,
              error: "unsupported working-memory path",
              provider: "working-memory",
            };
            return {
              content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
              details: payload,
            };
          },
        };

        return [memorySearchTool, memoryGetTool];
      },
      { names: ["memory_search", "memory_get"] },
    );

    api.on("agent_end", async (event, ctx) => {
      try {
        api.logger.info(`[working-memory] agent_end triggered, sessionKey=${ctx?.sessionKey}`);
        const turn = extractLatestTurn(event?.messages || []);
        if (!turn) {
          api.logger.info(`[working-memory] no turn extracted, skipping`);
          return;
        }
        api.logger.info(`[working-memory] calling persistIncrementalTurn`);
        persistIncrementalTurn(api, ctx?.sessionKey, turn.userText, turn.assistantText);
        api.logger.info(`[working-memory] persistIncrementalTurn completed`);
      } catch (error) {
        api.logger.warn(`working-memory ingest hook failed: ${String(error?.message || error)}`);
      }
    });
  },
};

export default plugin;
