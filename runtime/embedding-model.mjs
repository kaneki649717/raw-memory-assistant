import { loadProjectConfig } from "./config.mjs";

export function resolveEmbeddingConfig() {
  const config = loadProjectConfig();
  const embedding = config?.models?.embedding;
  if (!embedding?.baseUrl || !embedding?.apiKey || !embedding?.model) {
    throw new Error("embedding model config missing in config.json or AGENT_MEMORY_CONFIG_PATH");
  }
  return {
    baseUrl: String(embedding.baseUrl).replace(/\/$/, ""),
    apiKey: String(embedding.apiKey),
    model: String(embedding.model),
  };
}

export async function embedTexts(texts) {
  const cfg = resolveEmbeddingConfig();
  const response = await fetch(`${cfg.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      input: texts,
      encoding_format: "float",
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`embedding-http-${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const items = data?.data;
  if (!Array.isArray(items)) throw new Error("embedding-invalid-response");
  return items.map((item) => item.embedding);
}
