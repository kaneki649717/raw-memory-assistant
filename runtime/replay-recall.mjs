import { findReplayByDecisionId, findReplayByEventId, searchReplay } from "./replay-store.mjs";
import { rerankReplayItems } from "./rerank.mjs";

function replayScore(query, item) {
  const q = String(query).toLowerCase();
  const text = `${item.userText}\n${item.assistantText}`.toLowerCase();
  let score = 0;
  if (text.includes(q)) score += 3;
  const keywords = q.split(/\s+/).filter(Boolean);
  for (const kw of keywords) {
    if (text.includes(kw)) score += 0.5;
  }
  if (/[\u4e00-\u9fff]{2,}/.test(q)) {
    for (let i = 0; i < q.length - 1; i += 1) {
      const bg = q.slice(i, i + 2);
      if (text.includes(bg)) score += 0.2;
    }
  }
  return score;
}

function formatReplayText(hit) {
  const time = hit.timestamp || hit.createdAt || "";
  return [`时间: ${time}`, `用户: ${hit.userText}`, `助手: ${hit.assistantText}`].filter(Boolean).join("\n").slice(0, 2400);
}

export function buildRawEvidenceFromBundle(bundle) {
  const rawEvidenceItems = [];

  for (const decision of bundle.decisionItems ?? []) {
    const hit = findReplayByDecisionId(decision.id);
    if (hit) {
      rawEvidenceItems.push({
        source: `decision:${decision.id}`,
        text: formatReplayText(hit),
        sessionId: hit.sessionId,
        eventId: hit.eventId,
        decisionId: hit.decisionId,
        createdAt: hit.createdAt,
        timestamp: hit.timestamp || hit.createdAt,
        entities: hit.entities,
        files: hit.files,
      });
    }
  }

  for (const event of bundle.timelineItems ?? []) {
    const hit = findReplayByEventId(event.id);
    if (hit) {
      rawEvidenceItems.push({
        source: `event:${event.id}`,
        text: formatReplayText(hit),
        sessionId: hit.sessionId,
        eventId: hit.eventId,
        decisionId: hit.decisionId,
        createdAt: hit.createdAt,
        timestamp: hit.timestamp || hit.createdAt,
        entities: hit.entities,
        files: hit.files,
      });
    }
  }

  const dedup = new Map(rawEvidenceItems.map((item) => [`${item.sessionId}:${item.eventId}:${item.decisionId ?? "-"}`, item]));
  return [...dedup.values()].slice(0, 8);
}

export function replayLookup(query) {
  const ranked = searchReplay(query, 18)
    .map((item) => ({
      source: `replay:${item.eventId}`,
      text: formatReplayText(item),
      sessionId: item.sessionId,
      eventId: item.eventId,
      decisionId: item.decisionId,
      replayScore: replayScore(query, item),
      createdAt: item.createdAt,
      timestamp: item.timestamp || item.createdAt,
      entities: item.entities,
      files: item.files,
    }));

  return rerankReplayItems(query, ranked).slice(0, 10);
}
