import { ingestTurn } from "./src/ingest.js";
import { buildRecallBundle, classifyRecallIntent } from "./src/recall.js";

function print(obj: unknown): void {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (!command) {
    print({ ok: false, error: "缺少命令", commands: ["ingest", "recall"] });
    process.exitCode = 1;
    return;
  }

  if (command === "ingest") {
    const [sessionId = "manual", userText = "", assistantText = "", chatType = "direct"] = rest;
    const result = ingestTurn({ sessionId, userText, assistantText, chatType: chatType as any });
    print({ ok: true, mode: "ingest", result });
    return;
  }

  if (command === "recall") {
    const query = rest.join(" ").trim();
    const intent = classifyRecallIntent(query);
    const bundle = buildRecallBundle(query);
    print({ ok: true, mode: "recall", intent, bundle });
    return;
  }

  print({ ok: false, error: `未知命令: ${command}` });
  process.exitCode = 1;
}

main().catch((error) => {
  print({ ok: false, error: String((error as any)?.message || error) });
  process.exitCode = 1;
});
