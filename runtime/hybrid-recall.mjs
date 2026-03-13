import { readRecentDecisions, readRecentEvents, readRecentL0Items } from "./store.mjs";
import { embedTexts } from "./embedding-model.mjs";
import { upsertVectorItems, readVectorItems } from "./vector-store.mjs";
import { rerankItems } from "./rerank.mjs";

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokenize(text) {
  return String(text).toLowerCase().split(/[^\p{L}\p{N}._/-]+/u).filter(Boolean);
}

function hasCjk(text) {
  return /[\p{Script=Han}]/u.test(String(text));
}

function extractCjkChunks(text) {
  return (String(text).toLowerCase().match(/[\p{Script=Han}]{2,}/gu) ?? []).filter(Boolean);
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

function lexicalScore(query, text, meta = {}) {
  const q = String(query).trim().toLowerCase();
  const t = String(text).toLowerCase();
  if (!q) return 0;

  let score = 0;
  if (t.includes(q)) score += 1.0;

  const qTokens = tokenize(q);
  const textTokens = new Set(tokenize(t));
  if (qTokens.length) {
    let tokenHits = 0;
    for (const token of qTokens) {
      if (textTokens.has(token) || t.includes(token)) tokenHits += 1;
    }
    score += tokenHits / qTokens.length;
  }

  const entityText = [
    ...(meta.entities ?? []),
    ...(meta.files ?? []),
    ...(meta.configKeys ?? []),
    meta.title ?? "",
    meta.summaryShort ?? "",
  ].join("\n").toLowerCase();
  if (entityText && qTokens.length) {
    let entityHits = 0;
    for (const token of qTokens) {
      if (entityText.includes(token)) entityHits += 1;
    }
    score += entityHits / qTokens.length;
  }

  if (hasCjk(q)) {
    const qChunks = extractCjkChunks(q);
    let chunkHits = 0;
    for (const chunk of qChunks) {
      if (t.includes(chunk)) chunkHits += 1;
      else {
        const shortened = chunk.length > 4 ? [chunk.slice(0, 4), chunk.slice(-4)] : [];
        if (shortened.some((part) => part && t.includes(part))) chunkHits += 0.5;
      }
    }
    if (qChunks.length) score += chunkHits / qChunks.length;

    const qGrams = cjkNgrams(q, 2, 4);
    if (qGrams.length) {
      let gramHits = 0;
      for (const gram of qGrams) {
        if (t.includes(gram)) gramHits += 1;
      }
      score += 0.8 * (gramHits / qGrams.length);
    }

    if (entityText) {
      const entityGrams = cjkNgrams(entityText, 2, 4);
      const entityGramSet = new Set(entityGrams);
      if (qGrams.length && entityGramSet.size) {
        let entityGramHits = 0;
        for (const gram of qGrams) {
          if (entityGramSet.has(gram) || entityText.includes(gram)) entityGramHits += 1;
        }
        score += 0.6 * (entityGramHits / qGrams.length);
      }
    }
  }

  return score;
}

function makeL0Doc(item) {
  return {
    id: `l0:${item.id}`,
    sourceType: "l0",
    sourceId: item.id,
    text: [item.summaryShort, item.topic ?? "", item.actionType ?? "", item.resultTag ?? "", ...(item.entities ?? [])].join("\n"),
    meta: item,
    createdAt: item.timestamp,
    source: `l0:${item.id}`,
  };
}

function makeDecisionDoc(item) {
  return {
    id: `decision:${item.id}`,
    sourceType: "decision",
    sourceId: item.id,
    text: [item.title, item.decisionText, item.whyText ?? "", item.outcomeText ?? "", ...(item.entities ?? []), ...(item.files ?? [])].join("\n"),
    meta: item,
    createdAt: item.createdAt,
    source: `decision:${item.id}`,
  };
}

function makeEventDoc(item) {
  return {
    id: `event:${item.id}`,
    sourceType: "event",
    sourceId: item.id,
    text: [item.summaryShort, item.actionType, item.resultTag ?? "", ...(item.entities ?? [])].join("\n"),
    meta: item,
    createdAt: item.timestamp,
    source: `event:${item.id}`,
  };
}

async function indexDocs(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return { indexed: 0, mode: "noop" };
  const vectors = await embedTexts(docs.map((d) => d.text));
  const items = docs.map((doc, i) => ({ ...doc, embedding: vectors[i], updatedAt: new Date().toISOString() }));
  upsertVectorItems(items);
  return { indexed: items.length, mode: "incremental" };
}

export async function indexTurnArtifacts({ event, decision, l0Item }) {
  const docs = [];
  if (l0Item) docs.push(makeL0Doc(l0Item));
  if (event) docs.push(makeEventDoc(event));
  if (decision) docs.push(makeDecisionDoc(decision));
  return indexDocs(docs);
}

export async function rebuildVectorIndex() {
  const l0Items = readRecentL0Items(300);
  const decisions = readRecentDecisions(200);
  const events = readRecentEvents(200);
  const docs = [
    ...l0Items.map(makeL0Doc),
    ...decisions.map(makeDecisionDoc),
    ...events.map(makeEventDoc),
  ];

  if (docs.length === 0) return { indexed: 0 };
  const result = await indexDocs(docs);
  return { indexed: result.indexed };
}

export async function hybridSearch(query, limit = 6) {
  const queryVec = (await embedTexts([query]))[0];
  const items = readVectorItems();
  const ranked = items.map((item) => {
    const vector = cosineSimilarity(queryVec, item.embedding);
    const lexical = lexicalScore(query, item.text, item.meta);
    const finalScore = 0.65 * vector + 0.35 * lexical;
    return { ...item, vectorScore: vector, lexicalScore: lexical, finalScore };
  });
  return rerankItems(query, ranked).slice(0, limit);
}
