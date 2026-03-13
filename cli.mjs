import { ingestTurn } from "./runtime/ingest.mjs";
import { buildRecallBundle } from "./runtime/recall.mjs";
import { rebuildVectorIndex, hybridSearch } from "./runtime/hybrid-recall.mjs";
import { replayLookup } from "./runtime/replay-recall.mjs";

function print(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

async function main() {
  const [, , command, ...rest] = process.argv;

  if (!command) {
    print({ ok: false, error: "缺少命令", commands: ["ingest", "recall", "reindex", "hybrid", "replay"] });
    process.exitCode = 1;
    return;
  }

  if (command === "ingest") {
    const [sessionId = "manual", userText = "", assistantText = "", chatType = "direct"] = rest;
    const result = await ingestTurn({ sessionId, userText, assistantText, chatType });
    print({ ok: true, mode: "ingest", result });
    return;
  }

  if (command === "recall") {
    const query = rest.join(" ").trim();
    const { intent, bundle, contextPack } = await buildRecallBundle(query);
    print({ ok: true, mode: "recall", intent, contextPack, bundle });
    return;
  }

  if (command === "reindex") {
    const result = await rebuildVectorIndex();
    print({ ok: true, mode: "reindex", result });
    return;
  }

  if (command === "hybrid") {
    const query = rest.join(" ").trim();
    const results = await hybridSearch(query, 6);
    print({ ok: true, mode: "hybrid", results });
    return;
  }

  if (command === "replay") {
    const query = rest.join(" ").trim();
    const results = replayLookup(query);
    print({ ok: true, mode: "replay", results });
    return;
  }

  print({ ok: false, error: `未知命令: ${command}` });
  process.exitCode = 1;
}

main().catch((error) => {
  print({ ok: false, error: String(error?.message || error) });
  process.exitCode = 1;
});
