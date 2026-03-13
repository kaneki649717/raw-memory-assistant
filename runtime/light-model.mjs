import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findConfigPath() {
  // 优先使用环境变量
  if (process.env.AGENT_MEMORY_CONFIG_PATH) {
    return process.env.AGENT_MEMORY_CONFIG_PATH;
  }
  
  // 尝试从当前目录向上查找 openclaw.json
  let currentDir = __dirname;
  for (let i = 0; i < 5; i++) {
    const configPath = path.join(currentDir, "openclaw.json");
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    currentDir = path.dirname(currentDir);
  }
  
  // 回退到用户目录
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    const configPath = path.join(homeDir, ".openclaw", "openclaw.json");
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
  
  throw new Error("openclaw.json not found. Set AGENT_MEMORY_CONFIG_PATH environment variable.");
}

function readConfig() {
  const configPath = findConfigPath();
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

export function resolveLightModelConfig() {
  const config = readConfig();
  
  // 优先使用 iflow/qwen3-max，如果不存在则使用 custom-1/gpt-5.2
  let provider = config?.models?.providers?.["iflow"];
  let model = provider?.models?.find?.((m) => m.id === "qwen3-max");
  
  if (!provider?.baseUrl || !provider?.apiKey || !model?.id) {
    // 回退到 custom-1/gpt-5.2
    provider = config?.models?.providers?.["custom-1"];
    model = provider?.models?.find?.((m) => m.id === "gpt-5.2") ?? provider?.models?.[0];
  }
  
  if (!provider?.baseUrl || !provider?.apiKey || !model?.id) {
    throw new Error("light model config missing: need iflow/qwen3-max or custom-1/gpt-5.2 in openclaw.json");
  }
  
  return {
    baseUrl: String(provider.baseUrl).replace(/\/$/, ""),
    apiKey: String(provider.apiKey),
    model: String(model.id),
  };
}

export async function callLightModel(params) {
  const cfg = resolveLightModelConfig();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
  
  try {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        temperature: params.temperature ?? 0.2,
        max_tokens: params.maxTokens ?? 500,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`light-model-http-${response.status}: Request failed`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("light-model-empty-content");
    }
    return content.trim();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('light-model-timeout: Request timeout after 30s');
    }
    throw error;
  }
}
