import { findDecisionsByEntity, findEventsByEntity, readRecentDecisions, readRecentEvents } from "./store.js";
import type { RecallBundle } from "./types.js";

export type RecallIntent =
  | "no_memory"
  | "working_memory_continuity"
  | "working_memory_detail"
  | "raw_replay"
  | "knowledge_lookup"
  | "mixed";

function looksLikeEntityQuery(q: string): boolean {
  return /(?:\.md|\.json|\.ts|\.js|\.py|\.yml|\.yaml|\/|gpt-|glm-|qwen|bge-|embedding|recall|rerank|history-index|memory)/i.test(q);
}

export function classifyRecallIntent(query: string): RecallIntent {
  const q = query.toLowerCase();
  if (["原话", "完整对话", "完整代码", "原文"].some(k => q.includes(k))) return "raw_replay";
  if (["上次", "之前", "前几天", "还记得", "那个方案", "继续"].some(k => q.includes(k))) return "working_memory_continuity";
  if (["模型名", "配置", "哪一行", "参数", "端口", "文件名"].some(k => q.includes(k))) return "working_memory_detail";
  if (looksLikeEntityQuery(q)) return "working_memory_detail";
  if (["api", "文档", "github", "仓库", "pdf"].some(k => q.includes(k))) return "knowledge_lookup";
  return "no_memory";
}

export function buildRecallBundle(query: string): RecallBundle {
  const intent = classifyRecallIntent(query);
  if (intent === "no_memory") {
    return { timelineItems: [], decisionItems: [], snippetItems: [], rawEvidenceItems: [] };
  }

  const timelineItems = findEventsByEntity(query, intent === "working_memory_continuity" ? 6 : 4);
  const decisionItems = findDecisionsByEntity(query, intent === "working_memory_detail" ? 6 : 3);

  if (timelineItems.length === 0 && decisionItems.length === 0) {
    return {
      timelineItems: readRecentEvents(4),
      decisionItems: readRecentDecisions(3),
      snippetItems: [],
      rawEvidenceItems: [],
    };
  }

  return {
    timelineItems,
    decisionItems,
    snippetItems: [],
    rawEvidenceItems: [],
  };
}
