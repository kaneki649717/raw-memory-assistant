import { appendDecision, appendEvent, appendL0Item } from "./store.mjs";
import { appendReplayItem } from "./replay-store.mjs";
import { indexTurnArtifacts } from "./hybrid-recall.mjs";
import { extractCommands, extractEntities, inferActionType } from "./entity-extractor.mjs";
import { generateL0WithModel, generateL1WithModel } from "./summarize.mjs";
import { isWeakL0, normalizeDecisionPayload, normalizeL0, pickTimelineHook, sanitizeMemoryText } from "./quality-gate.mjs";

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(value) {
  return sanitizeMemoryText(value)
    .toLowerCase()
    .replace(/[\u4e00-\u9fff]+/g, (m) => m)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "general";
}

function hashText(text) {
  let h = 2166136261;
  for (const ch of String(text || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0).toString(36);
}

function buildResultTag(text) {
  if (text.includes("确认") || text.includes("结论")) return "已确认方向";
  if (text.includes("切") || text.includes("切换") || text.includes("改为")) return "已调整";
  if (text.includes("失败") || text.includes("报错")) return "待继续排查";
  if (text.includes("设计") || text.includes("方案")) return "方案已形成";
  return "已记录";
}

function chooseTopic(actionType, entities, userText, assistantText) {
  const text = sanitizeMemoryText(`${userText} ${assistantText}`);
  const entity = entities.find(Boolean);
  if (entity) {
    const e = sanitizeMemoryText(entity).toLowerCase();
    if (e.includes("identity.md") || e.includes("identity-md")) return "身份设定";
    if (e.includes("user.md") || e.includes("user-md")) return "用户设定";
    if (e.includes("tools.md") || e.includes("tools-md")) return "工具偏好";
    if (e.includes("heartbeat.md") || e.includes("heartbeat-md")) return "心跳规则";
    if (e.includes("bootstrap.md") || e.includes("bootstrap-md")) return "启动流程";
    if (e.includes("models.js") || e.includes("models-js")) return "模型配置";
    if (e.includes("openclaw")) return "OpenClaw";
    if (e.includes("whatsapp")) return "WhatsApp";
    if (e.includes("douyin") || e.includes("抖音")) return "抖音相关";
    return sanitizeMemoryText(entity);
  }
  if (/(记忆|memory|recall|l0|l1|l2|replay)/i.test(text)) return "记忆系统";
  if (/(抖音|douyin|视频|下载)/i.test(text)) return "抖音相关";
  if (/(openclaw|gateway|hook|plugin)/i.test(text)) return "OpenClaw";
  if (/(whatsapp)/i.test(text)) return "WhatsApp";
  if (/(天气|weather)/i.test(text)) return "天气";
  if (/(模型|model|embedding|rerank)/i.test(text)) return "模型与召回";
  if (/(连接|发送|测试消息|状态确认)/i.test(text)) return "会话状态";
  return sanitizeMemoryText(actionType || "会话推进");
}

function buildFallbackSummary(actionType, entities, resultTag, userText, assistantText) {
  return pickTimelineHook({ actionType, entities, userText, assistantText, resultTag });
}

function buildHandshakeMeta({ sessionId, timestamp, topic, userText, assistantText }) {
  const turnKey = `turn:${slugify(sessionId)}:${hashText(`${timestamp}|${userText}|${assistantText}`)}`;
  const timelineKey = `timeline:${slugify(topic)}:${String(timestamp).slice(0, 10)}`;
  return {
    turnKey,
    timelineKey,
    topicKey: slugify(topic),
  };
}

function shouldSkipL0Turn(userText, assistantText, actionType) {
  const combined = sanitizeMemoryText(`${userText} ${assistantText}`).toLowerCase();
  const normalizedUser = sanitizeMemoryText(userText).toLowerCase();
  if (!combined) return true;
  
  // 【优化】只跳过真正无意义的对话
  if (["你好", "hi", "hello", "在吗", "ok"].includes(normalizedUser) && combined.length < 30) return true;
  if (combined.includes("消息已发送") && combined.includes("测试消息") && combined.length < 50) return true;
  if (combined.includes("reply with ok") || combined.includes("仅回复ok") || combined.includes("只回ok")) return true;
  
  // 【移除】不再跳过"会话推进"类型的短对话，因为可能包含重要信息
  return false;
}

export async function createEventFromTurn({ sessionId, userText, assistantText, chatType = "direct", timestamp }) {
  const cleanUserText = sanitizeMemoryText(userText);
  const cleanAssistantText = sanitizeMemoryText(assistantText);
  const combined = `${cleanUserText}\n${cleanAssistantText}`;
  const entities = extractEntities(combined).map(sanitizeMemoryText).filter(Boolean);
  const actionType = sanitizeMemoryText(inferActionType(combined));
  const resultTag = buildResultTag(combined);
  const topic = chooseTopic(actionType, entities, cleanUserText, cleanAssistantText);
  if (shouldSkipL0Turn(cleanUserText, cleanAssistantText, actionType)) {
    return null;
  }
  const fallbackSummary = buildFallbackSummary(actionType, entities, resultTag, cleanUserText, cleanAssistantText);

  let summaryShort = fallbackSummary;
  try {
    const modelL0 = await generateL0WithModel({ userText: cleanUserText, assistantText: cleanAssistantText });
    summaryShort = normalizeL0(modelL0, fallbackSummary);
    if (isWeakL0(summaryShort)) {
      summaryShort = fallbackSummary;
    }
  } catch {
    summaryShort = fallbackSummary;
  }

  summaryShort = normalizeL0(summaryShort, fallbackSummary);

  // 【修复】使用 UTC+8 时区的当前时间
  // Node.js 的系统时间有问题，需要手动计算正确的时间
  const localDate = new Date();
  const utcTime = localDate.getTime();
  const chinaOffset = 8 * 60 * 60 * 1000; // UTC+8
  const correctUtcTime = utcTime + chinaOffset;
  const ts = new Date(correctUtcTime).toISOString();
  const handshake = buildHandshakeMeta({ sessionId, timestamp: ts, topic, userText: cleanUserText, assistantText: cleanAssistantText });

  return {
    id: makeId("evt"),
    timestamp: ts,
    sessionId,
    chatType,
    topic,
    topicKey: handshake.topicKey,
    timelineKey: handshake.timelineKey,
    turnKey: handshake.turnKey,
    actionType,
    entities,
    summaryShort,
    resultTag,
    importance: entities.length > 0 ? 0.7 : 0.4,
    sourceMessageCount: 2,
    sourceRefs: [handshake.turnKey],
  };
}

function shouldCreateDecision(combined, entities) {
  const lower = combined.toLowerCase();
  if (combined.length > 800) return true;
  if (entities.length >= 2) return true;
  return ["决定", "结论", "方案", "改成", "切到", "确认", "不要", "应该", "memory", "embedding", "recall", "l0", "l1", "l2", "修复", "架构", "问题"].some((k) => lower.includes(k));
}

export async function maybeCreateDecision({ eventId, sessionId, userText, assistantText, timestamp, event }) {
  const cleanUserText = sanitizeMemoryText(userText);
  const cleanAssistantText = sanitizeMemoryText(assistantText);
  const combined = `${cleanUserText}\n${cleanAssistantText}`;
  const entities = extractEntities(combined).map(sanitizeMemoryText).filter(Boolean);
  const commands = extractCommands(combined).map(sanitizeMemoryText).filter(Boolean);
  const lower = combined.toLowerCase();
  if (!shouldCreateDecision(combined, entities)) return null;

  const fallback = {
    title: event?.topic ? `${event.topic} 相关决策` : (entities[0] ? `${entities[0]} 相关决策` : "会话决策"),
    decisionText: sanitizeMemoryText(combined.slice(0, 400)),
    whyText: lower.includes("因为") ? sanitizeMemoryText(combined.slice(Math.max(0, lower.indexOf("因为")), Math.min(combined.length, lower.indexOf("因为") + 180))) : "",
    outcomeText: lower.includes("不要") ? "明确排除旧路径" : "形成可复用结论",
    files: entities.filter((v) => /\.(ts|tsx|js|jsx|json|md|py|yml|yaml|toml|ini)$/.test(v)),
    entities,
    configKeys: entities.filter((v) => /(memorySearch|primary|maxTokens|contextWindow|MEMORY\.md|openclaw\.json)/i.test(v)),
    commands,
  };

  try {
    const modelPayload = await generateL1WithModel({ userText: cleanUserText, assistantText: cleanAssistantText });
    const normalized = normalizeDecisionPayload(modelPayload);
    if (normalized && normalized.decisionText) {
      return {
        id: makeId("dec"),
        eventId,
        sessionId,
        topicKey: event?.topicKey,
        timelineKey: event?.timelineKey,
        turnKey: event?.turnKey,
        title: normalized.title || fallback.title,
        decisionText: normalized.decisionText || fallback.decisionText,
        whyText: normalized.whyText || fallback.whyText,
        outcomeText: normalized.outcomeText || fallback.outcomeText,
        files: normalized.files.length ? normalized.files : fallback.files,
        entities: normalized.entities.length ? normalized.entities : fallback.entities,
        configKeys: normalized.configKeys.length ? normalized.configKeys : fallback.configKeys,
        commands: normalized.commands.length ? normalized.commands : fallback.commands,
        confidence: 0.84,
        createdAt: timestamp || new Date().toISOString(),
      };
    }
  } catch {
  }

  return {
    id: makeId("dec"),
    eventId,
    sessionId,
    topicKey: event?.topicKey,
    timelineKey: event?.timelineKey,
    turnKey: event?.turnKey,
    title: fallback.title,
    decisionText: fallback.decisionText,
    whyText: fallback.whyText,
    outcomeText: fallback.outcomeText,
    files: fallback.files,
    entities: fallback.entities,
    configKeys: fallback.configKeys,
    commands: fallback.commands,
    confidence: 0.72,
    createdAt: timestamp || new Date().toISOString(),
  };
}

export async function ingestTurn({ sessionId, userText, assistantText, chatType = "direct", timestamp }) {
  const event = await createEventFromTurn({ sessionId, userText, assistantText, chatType, timestamp });
  if (!event) {
    return { skipped: true, reason: "low_value_turn" };
  }
  appendEvent(event);
  const l0Item = createL0ItemFromEvent(event);
  appendL0Item(l0Item);
  const decision = await maybeCreateDecision({ eventId: event.id, sessionId, userText, assistantText, timestamp: event.timestamp, event });
  if (decision) appendDecision(decision);
  appendReplayItem({
    id: makeId("replay"),
    createdAt: event.timestamp,
    timestamp: event.timestamp,
    sessionId,
    eventId: event.id,
    decisionId: decision?.id ?? null,
    topicKey: event.topicKey,
    timelineKey: event.timelineKey,
    turnKey: event.turnKey,
    userText: sanitizeMemoryText(userText),
    assistantText: sanitizeMemoryText(assistantText),
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

export function createL0ItemFromEvent(event) {
  return {
    id: makeId("l0"),
    eventId: event.id,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    topic: event.topic,
    topicKey: event.topicKey,
    timelineKey: event.timelineKey,
    turnKey: event.turnKey,
    actionType: event.actionType,
    entities: event.entities,
    summaryShort: event.summaryShort,
    resultTag: event.resultTag,
    importance: event.importance,
  };
}
