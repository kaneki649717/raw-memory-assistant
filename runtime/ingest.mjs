import { appendDecision, appendEvent, appendL0Item } from "./store.mjs";
import { appendReplayItem } from "./replay-store.mjs";
import { indexTurnArtifacts } from "./hybrid-recall.mjs";
import { extractCommands, extractEntities, inferActionType } from "./entity-extractor.mjs";
import { generateL0WithModel, generateL1WithModel } from "./summarize.mjs";
import { normalizeDecisionPayload, normalizeL0 } from "./quality-gate.mjs";
import { reportModelIssue } from "./model-alerts.mjs";

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildResultTag(text) {
  if (text.includes("确认") || text.includes("结论")) return "已确认方案";
  if (text.includes("修改") || text.includes("切换") || text.includes("改为")) return "已调整";
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

function inferEventSubtype({ userText, assistantText, actionType, entities = [], summaryShort = "", resultTag = "" }) {
  const text = [userText, assistantText, actionType, summaryShort, resultTag, ...entities].join("\n").toLowerCase();

  const hasVersionSignals = ['升级', '版本', '切换', '恢复', '改为', '默认模型', 'gpt-5.4', 'glm-4.7', 'qwen3', 'openai-codex', 'sub2api'].some((token) => text.includes(token));
  const hasConfigSignals = ['config', 'baseurl', 'apikey', 'model', 'openclaw.json', 'auth-profiles.json', 'gateway'].some((token) => text.includes(token));
  const hasCleanupSignals = ['清理', '删除', '封禁', '解绑', 'group 绑定', '旧账号'].some((token) => text.includes(token));
  const hasReminderSignals = ['heartbeat', 'reminder', '提醒', '定时'].some((token) => text.includes(token));
  const genericProgressSignals = ['会话推进', '已记录', '继续修', '排查', '跟进', '处理'].some((token) => text.includes(token));

  if (hasVersionSignals) return 'version_change';
  if (hasConfigSignals) return 'config_change';
  if (hasCleanupSignals) return 'account_cleanup';
  if (hasReminderSignals) return 'reminder';
  if (genericProgressSignals) return 'generic_progress';
  return 'general';
}

function resolveL0Consumption({ l0Result, fallbackSummary }) {
  const normalized = normalizeL0(l0Result);

  if (normalized.status === "good" || normalized.status === "weak") {
    return {
      l0Result: normalized,
      summaryShort: normalized.text,
      shouldWriteL0: true,
      usedFallbackSummary: false,
    };
  }

  if (normalized.status === "none") {
    return {
      l0Result: normalized,
      summaryShort: fallbackSummary,
      shouldWriteL0: false,
      usedFallbackSummary: false,
    };
  }

  if (normalized.status === "fallback") {
    return {
      l0Result: normalized,
      summaryShort: fallbackSummary,
      shouldWriteL0: true,
      usedFallbackSummary: true,
    };
  }

  return {
    l0Result: normalized,
    summaryShort: fallbackSummary,
    shouldWriteL0: false,
    usedFallbackSummary: false,
  };
}

export async function createEventFromTurn({ sessionId, userText, assistantText, chatType = "direct", l0Generator = generateL0WithModel }) {
  const combined = `${userText}\n${assistantText}`;
  const entities = extractEntities(combined);
  const actionType = inferActionType(combined);
  const resultTag = buildResultTag(combined);
  const fallbackSummary = buildFallbackSummary(actionType, entities, resultTag);

  let l0Resolution = {
    l0Result: { status: "none", text: null, model: null, attempts: 0, source: "primary" },
    summaryShort: fallbackSummary,
    shouldWriteL0: false,
    usedFallbackSummary: false,
  };

  try {
    const modelL0 = await l0Generator({ userText, assistantText });
    l0Resolution = resolveL0Consumption({ l0Result: modelL0, fallbackSummary });
  } catch (error) {
    reportModelIssue("light-l0", error, { source: "createEventFromTurn", note: "L0 摘要生成异常，且未进入合法 fallback 状态" });
  }

  const subtype = inferEventSubtype({ userText, assistantText, actionType, entities, summaryShort: l0Resolution.summaryShort, resultTag });

  return {
    id: makeId("evt"),
    timestamp: new Date().toISOString(),
    sessionId,
    chatType,
    topic: entities[0] ?? actionType,
    actionType,
    subtype,
    entities,
    summaryShort: l0Resolution.summaryShort,
    resultTag,
    importance: entities.length > 0 ? 0.7 : 0.4,
    sourceMessageCount: 2,
    sourceRefs: [],
    l0State: l0Resolution.l0Result,
    shouldWriteL0: l0Resolution.shouldWriteL0,
    usedFallbackSummary: l0Resolution.usedFallbackSummary,
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
    subtype: event.subtype || 'general',
    entities: event.entities,
    summaryShort: event.summaryShort,
    resultTag: event.resultTag,
    importance: event.importance,
    l0Status: event.l0State?.status || 'good',
    l0Model: event.l0State?.model || null,
    l0Source: event.l0State?.source || 'primary',
    l0Attempts: event.l0State?.attempts || 0,
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
    outcomeText: lower.includes("不要") ? "明确排除旧路线" : "形成可复用结论",
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
  } catch (error) {
    reportModelIssue("light-l1", error, { source: "maybeCreateDecision", note: "L1 决策提炼失败，已回退 fallback decision" });
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

  const l0Item = event.shouldWriteL0 ? createL0ItemFromEvent(event) : null;
  if (l0Item) appendL0Item(l0Item);

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
    reportModelIssue("embedding-index", error, { source: "ingestTurn", note: "向量索引失败，当前 turn 未完成 embedding 索引" });
    vectorIndex = {
      indexed: 0,
      mode: "error",
      error: String(error?.message || error),
    };
  }

  return { event, l0Item, decision, vectorIndex };
}

export { resolveL0Consumption };
