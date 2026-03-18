export function sanitizeMemoryText(value) {
  return String(value ?? "")
    .replace(/\uFFFD/g, "")
    .replace(/�\?/g, "")
    .replace(/�/g, "")
    .replace(/[\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isWeakL0(text) {
  const trimmed = sanitizeMemoryText(text);
  if (!trimmed || trimmed === "NONE") return true;
  if (trimmed.length < 14) return true;
  if (trimmed.length > 48) return true;
  if (!trimmed.includes("|")) return true;
  if (trimmed.toLowerCase().includes("general")) return true;
  const parts = trimmed.split("|").map((v) => sanitizeMemoryText(v));
  if (parts.length < 3) return true;
  if (!parts[1] || parts[1].length < 2) return true;
  if (!parts[2] || parts[2].length < 6) return true;
  
  // 【新增】禁止模糊表述检测
  const vaguePatterns = [
    /修复了bug/i,
    /修改了配置/i,
    /写了脚本/i,
    /改了代码/i,
    /处理了数据/i,
    /调整了参数/i,
    /优化了性能/i,
    /更新了文件/i,
    /研究了/i,
    /分析了/i,
    /继续处理/i,
  ];
  if (vaguePatterns.some((re) => re.test(trimmed))) return true;
  
  const weakPhrases = [
    "已确认方向",
    "已记录",
    "会话推进 | general",
    "继续处理",
    "研究了",
    "改了配置",
    "修了bug",
    "配置修改 | general",
    "会话推进 | general | 已记录",
  ];
  return weakPhrases.some((v) => trimmed.includes(v));
}

export function normalizeL0(text, fallback) {
  const t = sanitizeMemoryText(text).replace(/^[-*]\s*/, "");
  if (!t || t === "NONE") return sanitizeMemoryText(fallback);
  if (t.toLowerCase().includes("general")) return sanitizeMemoryText(fallback);
  return t;
}

export function normalizeDecisionPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  return {
    title: sanitizeMemoryText(payload.title || ""),
    decisionText: sanitizeMemoryText(payload.decisionText || ""),
    whyText: sanitizeMemoryText(payload.whyText || ""),
    outcomeText: sanitizeMemoryText(payload.outcomeText || ""),
    files: Array.isArray(payload.files) ? payload.files.map(sanitizeMemoryText).filter(Boolean) : [],
    entities: Array.isArray(payload.entities) ? payload.entities.map(sanitizeMemoryText).filter(Boolean) : [],
    configKeys: Array.isArray(payload.configKeys) ? payload.configKeys.map(sanitizeMemoryText).filter(Boolean) : [],
    commands: Array.isArray(payload.commands) ? payload.commands.map(sanitizeMemoryText).filter(Boolean) : [],
  };
}

export function pickTimelineHook({ actionType, entities = [], userText = "", assistantText = "", resultTag = "" }) {
  const text = sanitizeMemoryText(`${userText} ${assistantText}`);
  const entity = entities.find(Boolean) || "general";
  const candidates = [
    { re: /(记忆|memory|recall|l0|l1|l2|replay)/i, topic: "记忆系统" },
    { re: /(抖音|douyin|视频|下载)/i, topic: "抖音相关" },
    { re: /(weather|天气)/i, topic: "天气" },
    { re: /(openclaw|gateway|plugin|hook)/i, topic: "OpenClaw" },
    { re: /(模型|model|embedding|rerank)/i, topic: "模型与召回" },
    { re: /(whatsapp)/i, topic: "WhatsApp" },
    { re: /(session|会话|聊天)/i, topic: "会话状态" },
    { re: /(路径|文件|json|md|ts|js)/i, topic: entity },
  ];
  const matched = candidates.find((item) => item.re.test(text));
  const topic = sanitizeMemoryText(matched?.topic || entity || actionType || "记录项");
  return `${sanitizeMemoryText(actionType || "会话推进")} | ${topic} | ${sanitizeMemoryText(resultTag || "已记录")}`;
}
