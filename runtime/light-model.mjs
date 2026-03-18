import fs from "node:fs";

const CONFIG_PATH = "C:/Users/1/.openclaw/openclaw.json";

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
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
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`light-model-http-${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("light-model-empty-content");
  }
  return content.trim();
}
