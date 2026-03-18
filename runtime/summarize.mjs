import fs from "node:fs";
import { callLightModel } from "./light-model.mjs";

const L0_PROMPT_PATH = "C:/Users/1/.openclaw/workspace/memory/working-memory/prompts/l0-summarizer.md";
const L1_PROMPT_PATH = "C:/Users/1/.openclaw/workspace/memory/working-memory/prompts/l1-summarizer.md";

function readPrompt(path) {
  return fs.readFileSync(path, "utf-8");
}

function extractJsonBlock(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

export async function generateL0WithModel({ userText, assistantText }) {
  const system = readPrompt(L0_PROMPT_PATH);
  const user = `用户消息：\n${userText}\n\n助手回复：\n${assistantText}\n\n请输出 L0。`;
  const raw = await callLightModel({ system, user, maxTokens: 120, temperature: 0.1 });
  return raw.split(/\r?\n/).map(v => v.trim()).find(Boolean) ?? "NONE";
}

export async function generateL1WithModel({ userText, assistantText }) {
  const system = readPrompt(L1_PROMPT_PATH);
  const user = `用户消息：\n${userText}\n\n助手回复：\n${assistantText}\n\n请按要求输出 JSON 或 NONE。`;
  const raw = await callLightModel({ system, user, maxTokens: 350, temperature: 0.1 });
  if (raw.trim() === "NONE") return null;
  const jsonBlock = extractJsonBlock(raw);
  if (!jsonBlock) return null;
  return JSON.parse(jsonBlock);
}
