# stdin JSON 协议改造实施方案（编码根因修复）

## 目标
把 live ingest 从：
- `argv 文本链`

切换到：
- `stdin JSON 协议`

从源头切断 Windows 中文长文本在进程参数边界上发生 mojibake 的风险。

---

## 改造原则
1. **先切协议，不先切 runtime 主链**
2. **尽量保持插件桥路径和 CLI 文件路径不变**
3. **允许短期兼容旧 `ingest` 命令，便于回滚**
4. **新增明确的校验与错误输出，不把坏 payload 直接写入 store**

---

## 需要改的文件（第一阶段）

### 1. `memory/working-memory/cli.mjs`
#### 目的
新增 `ingest-stdin` 命令。

#### 建议改动
增加一个分支：
- `if (command === "ingest-stdin")`

行为：
1. 从 `process.stdin` 读取完整文本
2. `JSON.parse(...)`
3. 校验字段：
   - `sessionId`
   - `userText`
   - `assistantText`
   - `chatType`
   - `timestamp`（可选）
4. 调用：
   - `ingestTurn({ sessionId, userText, assistantText, chatType, timestamp })`
5. 输出标准 JSON result

#### 兼容要求
- 旧 `ingest` 命令先保留
- `recall/reindex/hybrid/replay` 不受影响

---

### 2. `.openclaw/extensions/working-memory-core/live-ingest.ts`
#### 目的
把插件桥的 live ingest 从 argv 文本切到 stdin JSON。

#### 当前危险写法
- `execFileSync(process.execPath, [cliPath, "ingest", sessionId, userText, assistantText, ...], { encoding: "utf8" })`

#### 建议改动
改为：
1. 构造 payload：
```ts
const payload = {
  sessionId,
  userText,
  assistantText,
  chatType: "direct",
  timestamp,
};
```
2. 调用：
```ts
cp.execFileSync(process.execPath, [cliPath, "ingest-stdin"], {
  cwd: workspaceDir,
  input: JSON.stringify(payload),
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 1024 * 1024 * 16,
});
```

#### 额外建议
- 若 stdin 协议失败，可记录 warn，但不要静默降回 argv 文本链，除非显式配置允许 fallback
- 否则会让新旧协议混杂，影响定位

---

### 3. 可选：`.openclaw/extensions/working-memory-core/index.mjs / index.ts`
#### 目的
如果插件桥的 ingest 行为实现在这里也有副本/平行逻辑，需要同步改。

#### 原则
- 以实际生效的 `live-ingest.ts` 为主
- 但如果 `index.mjs / index.ts` 中存在内联 `persistIncrementalTurn()` 或相同 argv 调用逻辑，也必须一起切

---

## CLI `ingest-stdin` 建议契约
### 输入 JSON 结构
```json
{
  "sessionId": "agent:main:main",
  "userText": "...",
  "assistantText": "...",
  "chatType": "direct",
  "timestamp": "2026-03-28T14:00:00.000Z"
}
```

### 最低字段要求
- `sessionId`: string
- `userText`: string
- `assistantText`: string
- `chatType`: string（可默认 `direct`）
- `timestamp`: optional string

### 输出格式
成功：
```json
{ "ok": true, "mode": "ingest-stdin", "result": ... }
```

失败：
```json
{ "ok": false, "mode": "ingest-stdin", "error": "..." }
```

---

## 需要补的安全阀
### 1. JSON parse 失败
- 不写 store
- 明确返回 parse error
- 记录 plugin warn

### 2. 字段缺失/类型错误
- 不写 store
- 明确指出缺哪个字段

### 3. 可疑乱码 payload
建议在 ingest 前加一层轻量检查：
- 若 `userText` / `assistantText` 中出现高比例 mojibake 模式
- 则：
  - 默认拒写
  - 或写入单独的 ingest-alert（不进入主 store）

### 4. 超长 payload
- 仍保留 `maxBuffer`
- 若 stdin 输入过大，明确报错，不 silent fail

---

## 回滚策略
为了安全，第一阶段保留：
- 原 `ingest` 命令

这样如果 `ingest-stdin` 实测有问题，可以快速回退到旧协议做对比验证。  
但回滚只用于调试验证，**不应长期双跑**。

---

## 验收方案（必须做）
### 验收 1：中文 round-trip 验证
构造包含：
- 中文
- 路径
- 标点
- emoji
- 多行文本
- `OpenClaw / 记忆系统 / 会话推进 / 已记录`

确认：
- stdin 进入 CLI 后字符串不变
- 写入 replay/store/vector 后不出现新增 mojibake

### 验收 2：新增污染监控
切协议后，连续观察新写入项：
- `working-memory-store.json`
- `replay-store.json`
- `vector-store.json`

重点不是看历史脏数据，而是：
> **是否还有新增乱码条目。**

### 验收 3：旧链对照验证
同一 payload：
- 用旧 argv ingest 一次
- 用 stdin ingest 一次

比对结果差异，验证协议切换确实改善中文可靠性。

---

## 与问题 1（主链路并轨）的关系
这次协议改造优先级应高于 runtime 并轨。

### 正确顺序
1. **先修编码污染入口（stdin JSON）**
2. **再观察新增污染是否停止**
3. **再推进 CLI 内部切向根部 runtime**

原因：
- 先把数据入口洗干净
- 再让更强 runtime 接管
- 否则只是让更强 runtime 更稳定地吃脏数据

---

## 当前实施建议
### 最小可执行第一步
先改两处：
1. `memory/working-memory/cli.mjs` 增 `ingest-stdin`
2. `.openclaw/extensions/working-memory-core/live-ingest.ts` 改为用 `input: JSON.stringify(payload)` 调用

先不动目录结构，不动 runtime 并轨，不动旧 store。

这是当前最适合“先止住新增污染”的第一落点。