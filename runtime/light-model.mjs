import { loadProjectConfig } from "./config.mjs";

export function resolveLightModelConfig() {
  const config = loadProjectConfig();
  const light = config?.models?.light;
  if (!light?.baseUrl || !light?.apiKey || !light?.model) {
    throw new Error("light model config missing in config.json or AGENT_MEMORY_CONFIG_PATH");
  }
  return {
    baseUrl: String(light.baseUrl).replace(/\/$/, ""),
    apiKey: String(light.apiKey),
    model: String(light.model),
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
