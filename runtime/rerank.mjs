function recencyBoost(isoTime) {
  if (!isoTime) return 0;
  const t = Date.parse(isoTime);
  if (!Number.isFinite(t)) return 0;
  const ageHours = Math.max(0, (Date.now() - t) / 3600000);
  if (ageHours < 1) return 0.25;
  if (ageHours < 6) return 0.18;
  if (ageHours < 24) return 0.12;
  if (ageHours < 72) return 0.06;
  return 0;
}

function tokenize(text) {
  return String(text).toLowerCase().split(/[^\p{L}\p{N}._/-]+/u).filter(Boolean);
}

function extractCjkChunks(text) {
  return String(text).toLowerCase().match(/[\p{Script=Han}]{2,}/gu) ?? [];
}

function cjkNgrams(text, min = 2, max = 4) {
  const grams = new Set();
  for (const chunk of extractCjkChunks(text)) {
    for (let size = min; size <= max; size += 1) {
      if (chunk.length < size) continue;
      for (let i = 0; i <= chunk.length - size; i += 1) {
        grams.add(chunk.slice(i, i + size));
      }
    }
  }
  return [...grams];
}

function entityHitScore(query, text, extra = []) {
  const q = String(query).toLowerCase();
  const qTokens = tokenize(q);
  const hay = `${text}\n${extra.join("\n")}`.toLowerCase();

  let score = 0;
  if (q && hay.includes(q)) score += 1.2;

  if (qTokens.length) {
    let hits = 0;
    for (const token of qTokens) {
      if (hay.includes(token)) hits += 1;
    }
    score += hits / qTokens.length;
  }

  const qChunks = extractCjkChunks(q);
  if (qChunks.length) {
    let chunkHits = 0;
    for (const chunk of qChunks) {
      if (hay.includes(chunk)) chunkHits += 1;
      else if (chunk.length >= 4) {
        const head = chunk.slice(0, Math.min(4, chunk.length));
        const tail = chunk.slice(Math.max(0, chunk.length - 4));
        if ((head && hay.includes(head)) || (tail && hay.includes(tail))) chunkHits += 0.5;
      }
    }
    score += 1.1 * (chunkHits / qChunks.length);
  }

  const qGrams = cjkNgrams(q, 2, 4);
  if (qGrams.length) {
    let gramHits = 0;
    for (const gram of qGrams) {
      if (hay.includes(gram)) gramHits += 1;
    }
    score += 0.8 * (gramHits / qGrams.length);
  }

  return score;
}

function sourceTypeWeight(source) {
  if (!source) return 0;
  if (source.startsWith("replay:")) return 1.0;
  if (source.startsWith("decision:")) return 0.92;
  if (source.startsWith("event:")) return 0.76;
  return 0.5;
}

function rawReplayPriority(query, source) {
  const q = String(query).toLowerCase();
  const wantsRaw = /(?:原话|原文|完整对话|完整代码|逐字|回放|当时怎么说)/i.test(q);
  if (!wantsRaw) return 0;
  if (String(source).startsWith("replay:")) return 0.35;
  if (String(source).startsWith("decision:")) return -0.05;
  if (String(source).startsWith("event:")) return -0.08;
  return -0.1;
}

function continuityPriority(query, item) {
  const q = String(query).toLowerCase();
  const wantsContinuity = /(?:继续|上次|之前|方案|记忆系统|架构|主线|下一步)/i.test(q);
  if (!wantsContinuity) return 0;
  const source = String(item.source || item.sourceType || "");
  if (source.startsWith("decision:")) return 0.18;
  if (source.startsWith("event:")) return 0.06;
  return 0;
}

function detectQueryMode(query) {
  const q = String(query).toLowerCase();
  if (/(?:总体架构|整体架构|总方案|整体方案|总体设计|系统架构)/i.test(q)) return "overall-architecture";
  if (/(?:按需 recall|按需召回|硬读|启动时读取|memory\.md|启动阶段不再强制读取记忆文件)/i.test(q)) return "system-policy";
  if (/(?:混合记忆方案|记忆系统方案|混合架构|系统方案)/i.test(q)) return "mixed-system";
  if (/(?:继续做什么|下一步|接下来做什么|主线|继续推进|继续往前推)/i.test(q)) return "next-step";
  return "general";
}

function architectureAndPolicyPriority(query, item) {
  const mode = detectQueryMode(query);
  if (!["overall-architecture", "system-policy", "mixed-system"].includes(mode)) return 0;

  const text = String(item.text || "").toLowerCase();
  const meta = item.meta || {};
  const source = String(item.source || item.sourceType || "");
  const hay = [
    text,
    meta.title || "",
    ...(meta.entities || []),
    ...(meta.files || []),
    ...(meta.configKeys || []),
    meta.summaryShort || "",
  ].join("\n").toLowerCase();

  let score = 0;
  if (source.startsWith("decision:")) score += 0.08;
  if (source.startsWith("event:")) score -= 0.03;

  const architectureSignals = [
    "新记忆系统怎么设计",
    "混合架构",
    "working memory和knowledge base分流",
    "knowledge base分流",
    "embedding/hybrid",
    "l0/l1/l2",
    "orchestrator",
  ];
  const policySignals = [
    "按需 recall",
    "按需召回",
    "停止会话启动时硬读",
    "启动阶段不再强制读取记忆文件",
    "memory.md",
    "memory/yyyy-mm-dd.md",
    "开场强制读",
  ];
  const localSignals = [
    "l2/raw replay",
    "原话回放",
    "history-index.ts",
    "导航层",
    "runtime骨架",
    "增量写vector store",
    "手动reindex",
    "uv_handle_closing",
    "windows 退出断言",
  ];

  const architectureHits = architectureSignals.filter((signal) => hay.includes(signal)).length;
  const policyHits = policySignals.filter((signal) => hay.includes(signal)).length;
  const localHits = localSignals.filter((signal) => hay.includes(signal)).length;

  if (mode === "overall-architecture") {
    score += Math.min(0.34, architectureHits * 0.17);
    score += Math.min(0.08, policyHits * 0.04);
    score -= Math.min(0.36, localHits * 0.18);
    if (hay.includes("history-index.ts") || hay.includes("导航层")) score -= 0.18;
  } else if (mode === "system-policy") {
    score += Math.min(0.34, policyHits * 0.17);
    score += Math.min(0.08, architectureHits * 0.04);
    score -= Math.min(0.16, localHits * 0.08);
  } else if (mode === "mixed-system") {
    score += Math.min(0.24, architectureHits * 0.12);
    score += Math.min(0.24, policyHits * 0.12);
    score -= Math.min(0.24, localHits * 0.12);
  }

  return score;
}

function nextStepPriority(query, item) {
  const mode = detectQueryMode(query);
  if (mode !== "next-step") return 0;

  const text = String(item.text || "").toLowerCase();
  const meta = item.meta || {};
  const source = String(item.source || item.sourceType || "");
  const hay = [
    text,
    meta.title || "",
    ...(meta.entities || []),
    ...(meta.files || []),
    ...(meta.configKeys || []),
    meta.summaryShort || "",
  ].join("\n").toLowerCase();

  let score = 0;
  if (source.startsWith("decision:")) score += 0.10;
  if (source.startsWith("event:")) score -= 0.04;

  const mainlineSignals = [
    "下一步继续做rerank和主运行时接入",
    "主运行时接入",
    "插件接入",
    "working-memory-core",
    "hybrid和recall往前推",
    "hybrid",
    "rerank",
    "主记忆入口",
    "继续做rerank",
    "继续做中文召回",
  ];
  const progressSignals = [
    "增量写vector store",
    "减少手动reindex依赖",
    "按需 recall",
    "按需召回",
    "主线",
    "继续推进",
  ];
  const branchNoiseSignals = [
    "history-index.ts",
    "导航层",
    "windows 退出断言",
    "uv_handle_closing",
    "原话回放",
    "l2/raw replay",
    "runtime骨架",
    "误判",
  ];

  const mainlineHits = mainlineSignals.filter((signal) => hay.includes(signal)).length;
  const progressHits = progressSignals.filter((signal) => hay.includes(signal)).length;
  const branchNoiseHits = branchNoiseSignals.filter((signal) => hay.includes(signal)).length;

  score += Math.min(0.34, mainlineHits * 0.17);
  score += Math.min(0.14, progressHits * 0.07);
  score -= Math.min(0.36, branchNoiseHits * 0.18);

  if (hay.includes("history-index.ts")) score -= 0.16;
  if (hay.includes("uv_handle_closing") || hay.includes("windows 退出断言")) score -= 0.18;
  if (hay.includes("l2/raw replay") || hay.includes("原话回放")) score -= 0.12;

  return score;
}

export function rerankItems(query, items) {
  return items
    .map((item) => {
      const text = String(item.text || "");
      const meta = item.meta || {};
      const entityScore = entityHitScore(query, text, [
        ...(meta.entities || []),
        ...(meta.files || []),
        ...(meta.configKeys || []),
        meta.title || "",
        meta.summaryShort || "",
      ]);
      const recency = recencyBoost(meta.createdAt || meta.timestamp || item.createdAt);
      const sourceWeight = sourceTypeWeight(item.source || `${item.sourceType || ""}:${item.sourceId || ""}`);
      const base = item.finalScore ?? item.vectorScore ?? item.replayScore ?? 0;
      const rerankScore = 0.34 * base
        + 0.30 * entityScore
        + 0.14 * sourceWeight
        + 0.08 * recency
        + rawReplayPriority(query, item.source || item.sourceType || "")
        + continuityPriority(query, item)
        + architectureAndPolicyPriority(query, item)
        + nextStepPriority(query, item);
      return { ...item, entityScore, recencyBoost: recency, sourceWeight, rerankScore };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore);
}

export function rerankReplayItems(query, items) {
  return rerankItems(
    query,
    items.map((item) => ({
      ...item,
      finalScore: item.replayScore ?? item.finalScore ?? 0,
      meta: {
        createdAt: item.createdAt,
        entities: item.entities || [],
        files: item.files || [],
        title: item.source || "",
      },
    })),
  );
}
