import fs from "node:fs";

const CONFIG_PATH = "C:/Users/1/.openclaw/openclaw.json";

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

export function resolveEmbeddingConfig() {
  const config = readConfig();
  const ms = config?.agents?.defaults?.memorySearch;
  const remote = ms?.remote;
  if (!remote?.baseUrl || !remote?.apiKey || !ms?.model) {
    throw new Error("memorySearch remote embedding config missing in openclaw.json");
  }
  return {
    baseUrl: String(remote.baseUrl).replace(/\/$/, ""),
    apiKey: String(remote.apiKey),
    model: String(ms.model),
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
