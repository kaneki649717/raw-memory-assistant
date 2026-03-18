const FILE_RE = /(?:[A-Za-z]:\\[^\s]+|[\w./-]+\.(?:ts|tsx|js|jsx|json|md|py|yml|yaml|toml|ini|sql|txt))/g;
const MODEL_RE = /\b(?:custom-1\/gpt-5\.2|duojie\/gpt-5\.4|zai\/glm-4\.7|bailian\/qwen3\.5-plus|BAAI\/bge-m3|gemini-3\.1-pro|gpt-5\.3-codex|qwen3\.5-plus|glm-4\.7)\b/g;
const CONFIG_RE = /\b(?:openclaw\.json|MEMORY\.md|AGENTS\.md|SOUL\.md|USER\.md|IDENTITY\.md|TOOLS\.md|HEARTBEAT\.md|BOOTSTRAP\.md|memorySearch|primary|maxTokens|contextWindow)\b/g;
const COMMAND_RE = /\b(?:openclaw status|openclaw doctor|openclaw gateway restart|git clone|pnpm install|npm install|python\s+[^\n]+|node\s+[^\n]+)\b/g;
const ERROR_RE = /\b(?:ENOENT|ECONNREFUSED|timeout|embedding|fallback|recall|rerank|L0|L1|L2|503|HTTP 400|API rate limit|FailoverError)\b/gi;
// 【新增】端口号、参数、具体数值提取
const PORT_RE = /\b(?:port|端口)[:\s]*(\d{2,5})\b/gi;
const PARAM_RE = /\b(?:maxResults|minScore|temperature|top_p|max_tokens)[:\s=]*([0-9.]+)\b/gi;

function uniq(values) {
  return [...new Set(values.map(v => String(v).trim()).filter(Boolean))];
}

export function extractEntities(text) {
  const hits = [
    ...(text.match(FILE_RE) ?? []),
    ...(text.match(MODEL_RE) ?? []),
    ...(text.match(CONFIG_RE) ?? []),
    ...(text.match(ERROR_RE) ?? []),
  ];
  
  // 【新增】提取端口号和参数
  let match;
  const portMatches = [];
  const portRe = /\b(?:port|端口)[:\s]*(\d{2,5})\b/gi;
  while ((match = portRe.exec(text)) !== null) {
    portMatches.push(`port:${match[1]}`);
  }
  
  const paramMatches = [];
  const paramRe = /\b(?:maxResults|minScore|temperature|top_p|max_tokens)[:\s=]*([0-9.]+)\b/gi;
  while ((match = paramRe.exec(text)) !== null) {
    paramMatches.push(match[0]);
  }
  
  return uniq([...hits, ...portMatches, ...paramMatches]).slice(0, 20);
}

export function extractCommands(text) {
  return uniq(text.match(COMMAND_RE) ?? []).slice(0, 10);
}

export function inferActionType(text) {
  const lower = text.toLowerCase();
  if (lower.includes("分析") || lower.includes("剖析") || lower.includes("analysis")) return "源码分析";
  if (lower.includes("配置") || lower.includes("model") || lower.includes("openclaw.json")) return "配置修改";
  if (lower.includes("记忆") || lower.includes("memory") || lower.includes("recall")) return "记忆设计";
  if (lower.includes("报错") || lower.includes("error") || lower.includes("enoent")) return "报错排查";
  if (lower.includes("下载") || lower.includes("clone") || lower.includes("仓库")) return "资源处理";
  return "会话推进";
}
