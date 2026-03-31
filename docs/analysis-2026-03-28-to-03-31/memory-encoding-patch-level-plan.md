# 编码根因修复：补丁级修改设计（阶段版）

## 目标
把第一阶段修复压到接近真实补丁的粒度，明确：
- 哪个文件改哪一段
- 先后顺序
- 最小验证路径

---

## 补丁 1：`memory/working-memory/cli.mjs` 增加 `ingest-stdin`

### 当前已有分支
- `ingest`
- `recall`
- `reindex`
- `hybrid`
- `replay`

### 建议新增位置
在现有 `if (command === "ingest") { ... }` 之后、`recall` 之前，加入：

```js
if (command === "ingest-stdin") {
  const raw = await new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", reject);
  });

  let payload;
  try {
    payload = JSON.parse(String(raw || ""));
  } catch (error) {
    print({ ok: false, mode: "ingest-stdin", error: `invalid json: ${String(error?.message || error)}` });
    process.exitCode = 1;
    return;
  }

  const sessionId = String(payload?.sessionId || "manual");
  const userText = String(payload?.userText || "");
  const assistantText = String(payload?.assistantText || "");
  const chatType = String(payload?.chatType || "direct");
  const timestamp = payload?.timestamp ? String(payload.timestamp) : undefined;

  if (!userText || !assistantText) {
    print({ ok: false, mode: "ingest-stdin", error: "missing userText or assistantText" });
    process.exitCode = 1;
    return;
  }

  const result = await ingestTurn({ sessionId, userText, assistantText, chatType, timestamp });
  print({ ok: true, mode: "ingest-stdin", result });
  return;
}
```

### 设计说明
- 不替换旧 `ingest`
- 先并存，便于对照验证
- 所有 JSON parse / 空字段异常都要显式报错

---

## 补丁 2：`.openclaw/extensions/working-memory-core/live-ingest.ts` 切协议

### 当前危险代码
```ts
cp.execFileSync(process.execPath, [cliPath, "ingest", sessionId, userText, assistantText, "direct", timestamp], {
  cwd: workspaceDir,
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 1024 * 1024 * 16,
});
```

### 建议替换为
```ts
const payload = {
  sessionId,
  userText,
  assistantText,
  chatType: "direct",
  timestamp,
};

cp.execFileSync(process.execPath, [cliPath, "ingest-stdin"], {
  cwd: workspaceDir,
  input: JSON.stringify(payload),
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 1024 * 1024 * 16,
});
```

### 设计说明
- 保留 `cliPath` 不变
- 保留 `process.execPath` 不变
- 只换传输协议，不换执行入口文件
- 这样最利于快速验证“是不是 argv 导致的”

---

## 补丁 3：`live-ingest.ts` 修 dedupe 放大器

### 当前问题
现在 key 里含 timestamp，导致几乎每次都视为新 turn。

### 当前逻辑（问题点）
```ts
const dedupeKey = `${sessionId}::${timestamp}::${userText}::${assistantText}`;
const seen = buildReplaySeenSet(replayStorePath);
if (seen.has(dedupeKey)) return;
```

### 建议最小修法
```ts
const dedupeKey = `${sessionId}::${userText}::${assistantText}`;
const seen = buildReplaySeenSet(replayStorePath);
if (seen.has(dedupeKey)) return;
```

并同步让 `buildReplaySeenSet()` 统一输出：
```ts
`${item.sessionId}::${item.userText}::${item.assistantText}`
```

### 更稳妥版本（可选）
若担心同会话内合法重复内容被误杀，可改成：
- `sessionId + hash(userText + assistantText)`
- 再叠加一个短时间窗口缓存

### 当前建议
先上**最小统一口径版本**，先止住重复沉积。

---

## 补丁 4：加入轻量写前污染检测（可先不阻断，只告警）

### 加点位置
优先加在 `live-ingest.ts` 侧，stdin payload 送出前或 CLI 读入后。

### 最小版本
先检测：
- `�`
- `����`
- 高频可疑乱码片段

若命中：
- `api.logger.warn(...)`
- 先不直接阻断，先观测

### 为什么先告警不先阻断
因为当前系统已有历史污染，先需要区分：
- 新协议前的遗留污染
- 新协议后的新增污染

阻断可以在第二阶段再上。

---

## 建议实施顺序
### 第一步
先改 `cli.mjs`，新增 `ingest-stdin`

### 第二步
再改 `live-ingest.ts`：
- 切 stdin JSON
- 修 dedupe 口径

### 第三步
做最小验证：
1. 人造中文 payload -> `ingest-stdin`
2. 检查 replay/store/vector 是否新增乱码
3. 连续两次同 payload，确认 dedupe 是否生效

### 第四步
观察一段时间真实新写入，再决定：
- 是否上污染阻断
- 是否开始清洗历史 store
- 是否推进 runtime 并轨

---

## 最小验收样例
### 样例 payload
```json
{
  "sessionId": "test-encoding",
  "userText": "我们继续修复记忆系统编码问题，重点检查 argv、stdin、中文、emoji🙂、路径 C:/Users/1/.openclaw/workspace",
  "assistantText": "收到，先切换到 stdin JSON 协议，再验证 replay-store、vector-store 是否还会新增乱码。",
  "chatType": "direct",
  "timestamp": "2026-03-28T15:20:00.000Z"
}
```

### 通过标准
- CLI 无 JSON parse error
- store 中新增记录不出现 mojibake
- 同 payload 第二次 ingest 不再重复沉积

---

## 当前阶段结论
如果要从“分析”真正走向“修复”，当前最值得先落手的就是：
1. `cli.mjs` 增 `ingest-stdin`
2. `live-ingest.ts` 切 stdin JSON
3. `live-ingest.ts` 修 dedupe 口径

这三刀是现在最接近真实补丁、同时风险最可控的一组改动。