import fs from "node:fs";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { jsonResult } from "openclaw/plugin-sdk";

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item: any) => item && item.type === "text" && typeof item.text === "string")
    .map((item: any) => item.text)
    .join("\n")
    .trim();
}

function getPluginConfig(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig ?? {}) as {
    workspaceDir?: string;
    cliRelativePath?: string;
  };
  const workspaceDir = cfg.workspaceDir || process.env.OPENCLAW_WORKSPACE_DIR || "C:\\Users\\1\\.openclaw\\workspace";
  return {
    workspaceDir,
    cliRelativePath: cfg.cliRelativePath || "memory/working-memory/cli.mjs",
    sessionsDir: "C:\\Users\\1\\.openclaw\\agents\\main\\sessions",
    replayStorePath: path.join(workspaceDir, "memory", "working-memory", "store", "replay-store.json"),
  };
}

function buildReplaySeenSet(replayStorePath: string): Set<string> {
  if (!fs.existsSync(replayStorePath)) return new Set();
  try {
    const replay = JSON.parse(fs.readFileSync(replayStorePath, "utf8"));
    return new Set((replay.items || []).map((item: any) => `${item.sessionId}::${item.timestamp || item.createdAt}::${item.userText}::${item.assistantText}`));
  } catch {
    return new Set();
  }
}

function parseAssistantText(messages: unknown[]): string {
  const assistantMessages = (messages || []).filter((msg: any) => msg?.role === "assistant");
  const lastAssistant = assistantMessages[assistantMessages.length - 1] as any;
  if (!lastAssistant) return "";
  return extractTextFromContent(lastAssistant.content);
}

const plugin = {
  id: "working-memory-core",
  name: "Working Memory (Core)",
  kind: "memory",
  register(api: OpenClawPluginApi) {
    api.registerTool(
      () => {
        const memorySearchTool = {
          name: "memory_search",
          label: "Memory Search",
          description: "Search structured working memory for recent decisions, timeline facts, and raw replay evidence.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              query: { type: "string", description: "Recall query for prior work, decisions, or raw replay." },
              maxResults: { type: "number", minimum: 1, maximum: 20 },
              minScore: { type: "number", minimum: 0, maximum: 1 }
            },
            required: ["query"]
          },
          execute: async () => jsonResult({ disabled: true, error: "tool registration shadowed by runtime reload needed", provider: "working-memory" }),
        };

        const memoryGetTool = {
          name: "memory_get",
          label: "Memory Get",
          description: "Read a compact working-memory path returned by memory_search, such as working-memory/decision.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              path: { type: "string", description: "Path returned by memory_search, e.g. working-memory/decision." },
              from: { type: "number", minimum: 1 },
              lines: { type: "number", minimum: 1 }
            },
            required: ["path"]
          },
          execute: async () => jsonResult({ disabled: true, error: "tool registration shadowed by runtime reload needed", provider: "working-memory" }),
        };

        return [memorySearchTool, memoryGetTool];
      },
      { names: ["memory_search", "memory_get"], optional: true },
    );

    api.on("agent_end", async (event, ctx) => {
      try {
        // 【关键修复】cron/subagent 产生的会话不写入记忆
        const sk = ctx?.sessionId || ctx?.sessionKey || "";
        if (/cron/.test(sk) || /subagent/.test(sk)) return;

        const cfg = getPluginConfig(api);
        const { workspaceDir, cliRelativePath, replayStorePath } = cfg;
        const cliPath = path.resolve(workspaceDir, cliRelativePath);
        if (!fs.existsSync(cliPath)) return;

        const messages = Array.isArray(event?.messages) ? event.messages : [];
        const userMessages = messages.filter((msg: any) => msg?.role === "user");
        const lastUser = userMessages[userMessages.length - 1] as any;
        const userText = extractTextFromContent(lastUser?.content);
        const assistantText = parseAssistantText(messages);
        if (!userText || !assistantText) return;

        const timestamp = new Date().toISOString();
        const sessionId = ctx?.sessionId || ctx?.sessionKey || "main";
        const dedupeKey = `${sessionId}::${timestamp}::${userText}::${assistantText}`;
        const seen = buildReplaySeenSet(replayStorePath);
        if (seen.has(dedupeKey)) return;

        const cp = await import("node:child_process");
        cp.execFileSync(process.execPath, [cliPath, "ingest", sessionId, userText, assistantText, "direct", timestamp], {
          cwd: workspaceDir,
          encoding: "utf8",
          windowsHide: true,
          maxBuffer: 1024 * 1024 * 16,
        });
      } catch (error) {
        api.logger.warn(`working-memory ingest hook failed: ${String((error as Error)?.message || error)}`);
      }
    });
  },
};

export default plugin;
