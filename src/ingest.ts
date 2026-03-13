import { extractCommands, extractEntities, inferActionType } from "./entity-extractor.js";
import { appendDecision, appendEvent } from "./store.js";
import type { ChatType, WorkingMemoryDecision, WorkingMemoryEvent } from "./types.js";

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function buildResultTag(text: string): string {
  if (text.includes("确认") || text.includes("结论")) return "已确认方向";
  if (text.includes("切") || text.includes("切换") || text.includes("改为")) return "已调整";
  if (text.includes("失败") || text.includes("报错")) return "待继续排查";
  if (text.includes("设计") || text.includes("方案")) return "方案已形成";
  return "已记录";
}

function inferConfigKeys(entities: string[]): string[] {
  return entities.filter(v => /(config\.json|embedding|model|maxTokens|contextWindow|apiKey|baseUrl)/i.test(v));
}

export function createEventFromTurn(params: {
  sessionId: string;
  userText: string;
  assistantText: string;
  chatType?: ChatType;
}): WorkingMemoryEvent {
  const combined = `${params.userText}\n${params.assistantText}`;
  const entities = extractEntities(combined);
  const actionType = inferActionType(combined);
  const resultTag = buildResultTag(combined);
  const coreEntity = entities[0] ?? "general";
  const summaryShort = `${actionType} | ${coreEntity} | ${resultTag}`;
  return {
    id: makeId("evt"),
    timestamp: new Date().toISOString(),
    sessionId: params.sessionId,
    chatType: params.chatType ?? "direct",
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

export function maybeCreateDecision(params: {
  eventId: string;
  sessionId: string;
  userText: string;
  assistantText: string;
}): WorkingMemoryDecision | null {
  const combined = `${params.userText}\n${params.assistantText}`;
  const entities = extractEntities(combined);
  const commands = extractCommands(combined);
  const lower = combined.toLowerCase();
  const shouldWrite = ["决定", "结论", "方案", "改成", "切到", "确认", "不要", "应该", "memory", "embedding", "recall", "l0", "l1", "l2"].some(k => lower.includes(k.toLowerCase()));
  if (!shouldWrite) return null;

  return {
    id: makeId("dec"),
    eventId: params.eventId,
    sessionId: params.sessionId,
    title: entities[0] ? `${entities[0]} 相关决策` : "会话决策",
    decisionText: combined.slice(0, 240),
    whyText: lower.includes("因为") ? combined.slice(Math.max(0, lower.indexOf("因为")), Math.min(combined.length, lower.indexOf("因为") + 120)) : "",
    outcomeText: lower.includes("不要") ? "明确排除旧路径" : "形成可复用结论",
    files: entities.filter(v => /\.(ts|tsx|js|jsx|json|md|py|yml|yaml|toml|ini)$/.test(v)),
    entities,
    configKeys: inferConfigKeys(entities),
    commands,
    confidence: 0.72,
    createdAt: new Date().toISOString(),
  };
}

export function ingestTurn(params: {
  sessionId: string;
  userText: string;
  assistantText: string;
  chatType?: ChatType;
}): { event: WorkingMemoryEvent; decision: WorkingMemoryDecision | null } {
  const event = createEventFromTurn(params);
  appendEvent(event);
  const decision = maybeCreateDecision({
    eventId: event.id,
    sessionId: params.sessionId,
    userText: params.userText,
    assistantText: params.assistantText,
  });
  if (decision) appendDecision(decision);
  return { event, decision };
}
