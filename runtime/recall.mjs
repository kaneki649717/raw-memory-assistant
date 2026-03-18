import { findDecisionsByEntity, findEventsByEntity, findL0ByQuery, readRecentDecisions, readRecentEvents, readRecentL0Items } from "./store.mjs";
import { hybridSearch } from "./hybrid-recall.mjs";
import { buildRawEvidenceFromBundle, replayLookup } from "./replay-recall.mjs";
import { unifyRecallBundle } from "./bundle-rerank.mjs";

function looksLikeEntityQuery(q) {
  return /(?:\.md|\.json|\.ts|\.js|\.py|\.yml|\.yaml|\/|gpt-|glm-|qwen|bge-|embedding|recall|rerank|history-index|memory|openclaw|process\.exit|uv_handle_closing|assertion failed|runtime|working-memory)/i.test(q);
}

function looksLikeHistoryQuery(q) {
  return /(?:上次|之前|前几天|还记得|那个方案|继续|启动|记忆|硬读|召回|方案|架构|修复|问题|主线|接着干|继续推进|接下来做什么|继续做什么|下一步|往前推|时间线|目录|原话层|原文层)/i.test(q);
}

function rawReplayHints(q) {
  return /(?:原话|原文|完整对话|完整代码|逐字|回放|当时怎么说|聊天记录|对话原文)/i.test(q);
}

function scoreSnippetAgainstRawQuery(query, item) {
  const q = String(query).toLowerCase();
  const text = String(item.text || "").toLowerCase();
  let penalty = 0;
  if (rawReplayHints(q)) {
    if (!text.includes("原话") && !text.includes("回放") && !text.includes("replay") && !text.includes("原始") && !text.includes("用户:")) {
      penalty += 0.18;
    }
  }
  return (item.finalScore ?? 0) - penalty;
}

function shouldHideSnippetsForRawReplay(query, rawEvidenceItems) {
  if (!rawReplayHints(query)) return false;
  if (!Array.isArray(rawEvidenceItems) || rawEvidenceItems.length === 0) return false;
  const top = rawEvidenceItems[0];
  return (top?.replayScore ?? 0) >= 2.2;
}

function hasStrongSnippetMatch(query, snippetItems = []) {
  if (!Array.isArray(snippetItems) || snippetItems.length === 0) return false;
  const top = snippetItems[0];
  if (!top) return false;
  const strongScore = (top.finalScore ?? 0) >= 0.85 || (top.lexicalScore ?? 0) >= 1.2 || (top.vectorScore ?? 0) >= 0.62;
  if (strongScore) return true;
  if (looksLikeHistoryQuery(query)) {
    return (top.finalScore ?? 0) >= 0.22 || (top.vectorScore ?? 0) >= 0.34;
  }
  return false;
}

function inferIntentFromEvidence(query, { l0Items = [], timelineItems = [], decisionItems = [], snippetItems = [], rawEvidenceItems = [] }) {
  if (rawEvidenceItems.length > 0 && rawReplayHints(query)) return "raw_replay";
  if (l0Items.length > 0 || timelineItems.length > 0 || decisionItems.length > 0) {
    return looksLikeHistoryQuery(query) ? "working_memory_continuity" : "working_memory_detail";
  }
  if (hasStrongSnippetMatch(query, snippetItems)) {
    return looksLikeHistoryQuery(query) ? "working_memory_continuity" : "working_memory_detail";
  }
  return "no_memory";
}

function compactText(text, max = 220) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function buildContextPack(query, intent, bundle) {
  const top = bundle.unifiedTop ?? [];
  const primary = top.slice(0, 12).map((item, index) => ({
    rank: index + 1,
    bucket: item.bucket,
    source: item.source,
    text: compactText(item.text, index === 0 ? 320 : 220),
  }));

  return {
    query,
    intent,
    primary,
    summaryLines: primary.map((item) => `[${item.bucket}] ${item.text}`),
  };
}

export function classifyRecallIntent(query) {
  const q = String(query).toLowerCase();
  if (["原话", "完整对话", "完整代码", "原文", "聊天记录", "对话原文"].some(k => q.includes(k))) return "raw_replay";
  if (["上次", "之前", "前几天", "还记得", "那个方案", "继续", "主线", "接着干", "继续推进", "下一步", "接下来做什么", "继续做什么", "时间线", "目录"].some(k => q.includes(k))) return "working_memory_continuity";
  if (["模型名", "配置", "哪一行", "参数", "端口", "文件名"].some(k => q.includes(k))) return "working_memory_detail";
  if (looksLikeEntityQuery(q)) return "working_memory_detail";
  if (looksLikeHistoryQuery(q)) return "working_memory_continuity";
  if (["api", "文档", "github", "仓库", "pdf"].some(k => q.includes(k))) return "knowledge_lookup";
  return "no_memory";
}

function promoteDecisionSnippets(snippetItems = [], existingDecisionItems = [], limit = 4) {
  const existingIds = new Set((existingDecisionItems || []).map((item) => item?.id).filter(Boolean));
  const promoted = [];
  for (const snippet of snippetItems || []) {
    const meta = snippet?.meta || {};
    if (!String(snippet?.source || "").startsWith("decision:")) continue;
    if (!meta?.id || !meta?.decisionText) continue;
    if (existingIds.has(meta.id)) continue;
    promoted.push(meta);
    existingIds.add(meta.id);
    if (promoted.length >= limit) break;
  }
  return promoted;
}

export async function buildRecallBundle(query) {
  const initialIntent = classifyRecallIntent(query);
  const hybridResults = await hybridSearch(query, 12).catch(() => []);
  let snippetItems = hybridResults.map((item) => ({
    source: item.source || `${item.sourceType || ""}:${item.sourceId || ""}`,
    text: item.text.slice(0, 420),
    finalScore: item.finalScore,
    vectorScore: item.vectorScore,
    lexicalScore: item.lexicalScore,
    createdAt: item.createdAt,
    meta: item.meta,
  }));

  if (initialIntent === "raw_replay") {
    const rawEvidenceItems = replayLookup(query);
    if (shouldHideSnippetsForRawReplay(query, rawEvidenceItems)) {
      snippetItems = [];
    } else {
      snippetItems = snippetItems
        .map((item) => ({ ...item, adjustedScore: scoreSnippetAgainstRawQuery(query, item) }))
        .sort((a, b) => b.adjustedScore - a.adjustedScore)
        .slice(0, rawEvidenceItems.length > 0 ? 2 : 6);
    }

    const intent = inferIntentFromEvidence(query, {
      l0Items: [],
      timelineItems: [],
      decisionItems: [],
      snippetItems,
      rawEvidenceItems,
    });
    const bundle = unifyRecallBundle(query, {
      l0Items: [],
      timelineItems: [],
      decisionItems: [],
      snippetItems,
      rawEvidenceItems,
    });

    return { intent, bundle, contextPack: buildContextPack(query, intent, bundle) };
  }

  let l0Items = findL0ByQuery(query, initialIntent === "working_memory_continuity" ? 12 : 8);
  const timelineItems = findEventsByEntity(query, initialIntent === "working_memory_continuity" ? 10 : 6);
  let decisionItems = findDecisionsByEntity(query, initialIntent === "working_memory_detail" ? 8 : 5);
  if (looksLikeHistoryQuery(query)) {
    decisionItems = [...decisionItems, ...promoteDecisionSnippets(snippetItems, decisionItems, 4)];
  }
  const rawEvidenceItems = buildRawEvidenceFromBundle({ l0Items, timelineItems, decisionItems, snippetItems, rawEvidenceItems: [] });

  if (l0Items.length === 0 && timelineItems.length === 0 && decisionItems.length === 0 && snippetItems.length === 0) {
    const fallback = {
      l0Items: readRecentL0Items(12),
      timelineItems: readRecentEvents(10),
      decisionItems: readRecentDecisions(8),
      snippetItems: [],
      rawEvidenceItems: [],
    };
    const intent = initialIntent === "no_memory" ? "no_memory" : inferIntentFromEvidence(query, fallback);
    const bundle = unifyRecallBundle(query, fallback);
    return { intent, bundle, contextPack: buildContextPack(query, intent, bundle) };
  }

  if (looksLikeHistoryQuery(query) && l0Items.length === 0) {
    l0Items = readRecentL0Items(8);
  }

  const resolvedIntent = initialIntent === "no_memory"
    ? inferIntentFromEvidence(query, { l0Items, timelineItems, decisionItems, snippetItems, rawEvidenceItems })
    : initialIntent;

  const bundle = unifyRecallBundle(query, { l0Items, timelineItems, decisionItems, snippetItems, rawEvidenceItems });
  return { intent: resolvedIntent, bundle, contextPack: buildContextPack(query, resolvedIntent, bundle) };
}
