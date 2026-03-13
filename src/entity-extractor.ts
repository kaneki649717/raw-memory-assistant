const FILE_RE = /(?:[A-Za-z]:\\[^\s]+|[\w./-]+\.(?:ts|tsx|js|jsx|json|md|py|yml|yaml|toml|ini|sql|txt))/g;
const MODEL_RE = /\b(?:gpt-[\w.-]+|glm-[\w.-]+|qwen[\w.-]*|bge-[\w.-]+|embedding-[\w.-]+)\b/gi;
const CONFIG_RE = /\b(?:config\.json|MEMORY\.md|AGENTS\.md|SOUL\.md|USER\.md|embedding|model|maxTokens|contextWindow|apiKey|baseUrl)\b/g;
const COMMAND_RE = /\b(?:git clone|pnpm install|npm install|python\s+[^\n]+|node\s+[^\n]+)\b/g;
const ERROR_RE = /\b(?:ENOENT|ECONNREFUSED|timeout|embedding|fallback|recall|rerank|L0|L1|L2)\b/gi;

function uniq(values: string[]): string[] {
  return [...new Set(values.map(v => v.trim()).filter(Boolean))];
}

export function extractEntities(text: string): string[] {
  const hits = [
    ...(text.match(FILE_RE) ?? []),
    ...(text.match(MODEL_RE) ?? []),
    ...(text.match(CONFIG_RE) ?? []),
    ...(text.match(ERROR_RE) ?? []),
  ];
  return uniq(hits).slice(0, 16);
}

export function extractCommands(text: string): string[] {
  return uniq(text.match(COMMAND_RE) ?? []).slice(0, 10);
}

export function inferActionType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("分析") || lower.includes("剖析") || lower.includes("analysis")) return "源码分析";
  if (lower.includes("配置") || lower.includes("model") || lower.includes("config.json")) return "配置修改";
  if (lower.includes("记忆") || lower.includes("memory") || lower.includes("recall")) return "记忆设计";
  if (lower.includes("报错") || lower.includes("error") || lower.includes("enoent")) return "报错排查";
  if (lower.includes("下载") || lower.includes("clone") || lower.includes("仓库")) return "资源处理";
  return "会话推进";
}
