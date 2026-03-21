import { appendDecision, appendEvent, appendL0Item } from "./store.mjs";
import { appendReplayItem } from "./replay-store.mjs";
import { indexTurnArtifacts } from "./hybrid-recall.mjs";
import { extractCommands, extractEntities, inferActionType } from "./entity-extractor.mjs";
import { generateL0WithModel, generateL1WithModel } from "./summarize.mjs";
import { isWeakL0, normalizeDecisionPayload, normalizeL0 } from "./quality-gate.mjs";

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildResultTag(text) {
  if (text.includes("确认") || text.includes("结论")) return "已确认方向";
  if (text.includes("切") || text.includes("切换") || text.includes("改为")) return "已调整";
  if (text.includes("失败") || text.includes("报错")) return "待继续排查";
  if (text.includes("设计") || text.includes("方案")) return "方案已形成";
  return "已记录";
}

function buildFallbackSummary(actionType, entities, resultTag) {
  const coreEntity = entities[0] ?? "general";
  return `${actionType} | ${coreEntity} | ${resultTag}`;
}

function inferConfigKeys(entities) {
  return entities.filter(v => /(config\.json|embedding|model|maxTokens|contextWindow|apiKey|baseUrl)/i.test(v));
}

export async function createEventFromTurn({ sessionId, userText, assistantText, chatType = "direct" }) {
  const combined = `${userText}\n${assistantText}`;
  const entities = extractEntities(combined);
  const actionType = inferActionType(combined);
  const resultTag = buildResultTag(combined);
  const fallbackSummary = buildFallbackSummary(actionType, entities, resultTag);

  let summaryShort = fallbackSummary;
  try {
    const modelL0 = await generateL0WithModel({ userText, assistantText });
    summaryShort = normalizeL0(modelL0, fallbackSummary);
    if (isWeakL0(summaryShort)) {
      summaryShort = fallbackSummary;
    }
  } catch {
    summaryShort = fallbackSummary;
  }

  return {
    id: makeId("evt"),
    timestamp: new Date().toISOString(),
    sessionId,
    chatType,
    topic: entities[0] ?? actionType,
    actionType,
    entities,
    summaryShort,
    resultTag,
    importance: entities.length > 0 ? 0.7 : 0.4,
    sourceMessageCount: 2,
    sourceRefs: [],
  };
}

export function createL0ItemFromEvent(event) {
  return {
    id: makeId("l0"),
    eventId: event.id,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    topic: event.topic,
    actionType: event.actionType,
    entities: event.entities,
    summaryShort: event.summaryShort,
    resultTag: event.resultTag,
    importance: event.importance,
  };
}

export async function maybeCreateDecision({ eventId, sessionId, userText, assistantText }) {
  const combined = `${userText}\n${assistantText}`;
  const entities = extractEntities(combined);
  const commands = extractCommands(combined);
  const lower = combined.toLowerCase();
  const shouldWrite = ["决定", "结论", "方案", "改成", "切到", "确认", "不要", "应该", "memory", "embedding", "recall", "l0", "l1", "l2"].some(k => lower.includes(k));
  if (!shouldWrite) return null;

  const fallback = {
    title: entities[0] ? `${entities[0]} 相关决策` : "会话决策",
    decisionText: combined.slice(0, 240),
    whyText: lower.includes("因为") ? combined.slice(Math.max(0, lower.indexOf("因为")), Math.min(combined.length, lower.indexOf("因为") + 120)) : "",
    outcomeText: lower.includes("不要") ? "明确排除旧路径" : "形成可复用结论",
    files: entities.filter(v => /\.(ts|tsx|js|jsx|json|md|py|yml|yaml|toml|ini)$/.test(v)),
    entities,
    configKeys: inferConfigKeys(entities),
    commands,
  };

  try {
    const modelPayload = await generateL1WithModel({ userText, assistantText });
    const normalized = normalizeDecisionPayload(modelPayload);
    if (normalized && normalized.decisionText) {
      return {
        id: makeId("dec"),
        eventId,
        sessionId,
        title: normalized.title || fallback.title,
        decisionText: normalized.decisionText || fallback.decisionText,
        whyText: normalized.whyText || fallback.whyText,
        outcomeText: normalized.outcomeText || fallback.outcomeText,
        files: normalized.files.length ? normalized.files : fallback.files,
        entities: normalized.entities.length ? normalized.entities : fallback.entities,
        configKeys: normalized.configKeys.length ? normalized.configKeys : fallback.configKeys,
        commands: normalized.commands.length ? normalized.commands : fallback.commands,
        confidence: 0.84,
        createdAt: new Date().toISOString(),
      };
    }
  } catch {
  }

  return {
    id: makeId("dec"),
    eventId,
    sessionId,
    title: fallback.title,
    decisionText: fallback.decisionText,
    whyText: fallback.whyText,
    outcomeText: fallback.outcomeText,
    files: fallback.files,
    entities: fallback.entities,
    configKeys: fallback.configKeys,
    commands: fallback.commands,
    confidence: 0.72,
    createdAt: new Date().toISOString(),
  };
}

export async function ingestTurn({ sessionId, userText, assistantText, chatType = "direct" }) {
  const event = await createEventFromTurn({ sessionId, userText, assistantText, chatType });
  appendEvent(event);
  const l0Item = createL0ItemFromEvent(event);
  appendL0Item(l0Item);
  const decision = await maybeCreateDecision({ eventId: event.id, sessionId, userText, assistantText });
  if (decision) appendDecision(decision);
  appendReplayItem({
    id: makeId("replay"),
    createdAt: new Date().toISOString(),
    sessionId,
    eventId: event.id,
    decisionId: decision?.id ?? null,
    userText,
    assistantText,
    entities: event.entities,
    files: decision?.files ?? [],
  });

  let vectorIndex = { indexed: 0, mode: "skipped" };
  try {
    vectorIndex = await indexTurnArtifacts({ event, decision, l0Item });
  } catch (error) {
    vectorIndex = {
      indexed: 0,
      mode: "error",
      error: String(error?.message || error),
    };
  }

  return { event, l0Item, decision, vectorIndex };
}
