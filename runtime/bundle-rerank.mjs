import { rerankItems } from "./rerank.mjs";

function decorateL0Items(items) {
  return (items || []).map((item) => ({
    source: `l0:${item.id}`,
    text: [item.summaryShort, item.actionType || "", item.resultTag || "", ...(item.entities || [])].join("\n").trim(),
    createdAt: item.timestamp,
    meta: {
      createdAt: item.timestamp,
      timestamp: item.timestamp,
      entities: item.entities || [],
      summaryShort: item.summaryShort || "",
      title: item.topic || item.actionType || "",
    },
    original: item,
    bucket: "l0",
  }));
}

function decorateTimelineItems(items) {
  return (items || []).map((item) => ({
    source: `event:${item.id}`,
    text: [item.summaryShort, item.actionType, item.resultTag || "", ...(item.entities || [])].join("\n").trim(),
    createdAt: item.timestamp,
    meta: {
      timestamp: item.timestamp,
      entities: item.entities || [],
      summaryShort: item.summaryShort || "",
      title: item.topic || item.actionType || "",
    },
    original: item,
    bucket: "timeline",
  }));
}

function decorateDecisionItems(items) {
  return (items || []).map((item) => ({
    source: `decision:${item.id}`,
    text: [item.title, item.decisionText, item.whyText || "", item.outcomeText || "", ...(item.entities || []), ...(item.files || [])].join("\n").trim(),
    createdAt: item.createdAt,
    meta: {
      createdAt: item.createdAt,
      entities: item.entities || [],
      files: item.files || [],
      configKeys: item.configKeys || [],
      title: item.title || "",
    },
    original: item,
    bucket: "decision",
  }));
}

function decorateSnippetItems(items) {
  return (items || []).map((item) => ({
    source: item.source,
    text: item.text,
    createdAt: item.createdAt,
    finalScore: item.finalScore,
    vectorScore: item.vectorScore,
    lexicalScore: item.lexicalScore,
    meta: item.meta || {},
    original: item,
    bucket: "snippet",
  }));
}

function decorateRawEvidenceItems(items) {
  return (items || []).map((item) => ({
    source: item.source,
    text: item.text,
    createdAt: item.createdAt,
    replayScore: item.replayScore,
    meta: {
      createdAt: item.createdAt,
      entities: item.entities || [],
      files: item.files || [],
      title: item.source || "",
    },
    original: item,
    bucket: "rawEvidence",
  }));
}

function normalizeSource(source = "") {
  return String(source).trim().toLowerCase();
}

function canonicalSourceId(item) {
  const original = item?.original || {};
  if (original.decisionId) return `decision:${original.decisionId}`;
  if (original.id && item.bucket === "decision") return `decision:${original.id}`;
  if (original.id && item.bucket === "timeline") return `event:${original.id}`;
  if (original.id && item.bucket === "l0") return `l0:${original.id}`;
  if (original.eventId) return `event:${original.eventId}`;
  return normalizeSource(item.source);
}

function detectIntent(query, bundle = {}) {
  const q = String(query).toLowerCase();
  if (/(?:原话|原文|完整对话|完整代码|逐字|回放|当时怎么说)/i.test(q)) return "raw_replay";
  if ((bundle.rawEvidenceItems?.length ?? 0) > 0 && (bundle.decisionItems?.length ?? 0) === 0 && (bundle.timelineItems?.length ?? 0) === 0) {
    return "raw_replay";
  }
  return "working_memory";
}

function bucketPriority(bucket) {
  if (bucket === "rawEvidence") return 5;
  if (bucket === "decision") return 4;
  if (bucket === "l0") return 3;
  if (bucket === "timeline") return 2;
  if (bucket === "snippet") return 1;
  return 0;
}

function bucketBiasForIntent(bucket, intent) {
  const rawReplayBias = {
    rawEvidence: 0.35,
    decision: 0.22,
    l0: 0.1,
    timeline: 0.08,
    snippet: 0,
  };
  const workingMemoryBias = {
    decision: 0.34,
    l0: 0.28,
    timeline: 0.18,
    rawEvidence: 0.08,
    snippet: 0,
  };
  const table = intent === "raw_replay" ? rawReplayBias : workingMemoryBias;
  return table[bucket] ?? 0;
}

function effectiveScore(item, intent) {
  return (item.rerankScore ?? 0) + bucketBiasForIntent(item.bucket, intent);
}

function choosePrimaryFromGroup(items, intent) {
  const byBucket = (bucket) => items
    .filter((item) => item.bucket === bucket)
    .sort((a, b) => (b.effectiveScore ?? 0) - (a.effectiveScore ?? 0));

  if (intent === "raw_replay") {
    if (byBucket("rawEvidence").length) return byBucket("rawEvidence")[0];
    if (byBucket("decision").length) return byBucket("decision")[0];
    if (byBucket("l0").length) return byBucket("l0")[0];
    if (byBucket("timeline").length) return byBucket("timeline")[0];
    return byBucket("snippet")[0];
  }

  if (byBucket("decision").length) return byBucket("decision")[0];
  if (byBucket("l0").length) return byBucket("l0")[0];
  if (byBucket("timeline").length) return byBucket("timeline")[0];
  if (byBucket("rawEvidence").length) return byBucket("rawEvidence")[0];
  return byBucket("snippet")[0];
}

function selectPrimaryItems(rankedItems, intent) {
  const grouped = new Map();
  for (const item of rankedItems) {
    const canonical = canonicalSourceId(item);
    const list = grouped.get(canonical) ?? [];
    list.push({ ...item, canonicalSource: canonical, effectiveScore: effectiveScore(item, intent) });
    grouped.set(canonical, list);
  }

  const picked = [];
  for (const [, items] of grouped) picked.push(choosePrimaryFromGroup(items, intent));

  picked.sort((a, b) => {
    const scoreGap = (b.effectiveScore ?? 0) - (a.effectiveScore ?? 0);
    if (Math.abs(scoreGap) > 1e-9) return scoreGap;
    return bucketPriority(b.bucket) - bucketPriority(a.bucket);
  });

  return picked.slice(0, 12);
}

export function unifyRecallBundle(query, bundle) {
  const merged = [
    ...decorateL0Items(bundle.l0Items),
    ...decorateTimelineItems(bundle.timelineItems),
    ...decorateDecisionItems(bundle.decisionItems),
    ...decorateSnippetItems(bundle.snippetItems),
    ...decorateRawEvidenceItems(bundle.rawEvidenceItems),
  ];

  const intent = detectIntent(query, bundle);
  const ranked = rerankItems(query, merged);
  const top = selectPrimaryItems(ranked, intent);

  const out = {
    l0Items: [],
    timelineItems: [],
    decisionItems: [],
    snippetItems: [],
    rawEvidenceItems: [],
    unifiedTop: top.map((item) => ({
      source: item.source,
      canonicalSource: item.canonicalSource,
      bucket: item.bucket,
      rerankScore: item.rerankScore,
      effectiveScore: item.effectiveScore,
      text: item.text.slice(0, 320),
    })),
  };

  for (const item of top) {
    if (item.bucket === "l0") out.l0Items.push(item.original);
    if (item.bucket === "timeline") out.timelineItems.push(item.original);
    if (item.bucket === "decision") out.decisionItems.push(item.original);
    if (item.bucket === "snippet") out.snippetItems.push(item.original);
    if (item.bucket === "rawEvidence") out.rawEvidenceItems.push(item.original);
  }

  return out;
}
