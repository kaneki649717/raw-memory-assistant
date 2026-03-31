# 编码问题修复补充：污染扩散放大器与最小改动清单

## 新增发现
在继续核对 live ingest 代码时，发现除了 argv 文本链这个主风险点之外，还存在一个会放大污染传播的问题：

### live-ingest.ts 的 dedupe 设计与 replay seen set 不一致
当前逻辑：
- `dedupeKey = sessionId::timestamp::userText::assistantText`
- replay seen set 读取的是：`sessionId::(timestamp || createdAt)::userText::assistantText`
- 但 live ingest 中每次 `timestamp = new Date().toISOString()` 都是新的

这意味着：
> **同一对 userText / assistantText，只要发生在新时刻，live-ingest 层几乎都会认为是新 turn。**

结果是：
- 去重效果被显著削弱
- 一旦上游字符串已经被污染，坏文本更容易重复进入 replay/store/vector
- 因而会放大“编码问题反复出现”的体感

---

## 这意味着什么
### 1. argv 文本链仍是主根因候选
它负责“制造/传入可能错码的字符串”。

### 2. dedupe 失配是扩散放大器
它负责让污染更容易多次写入、备份、索引和传播。

也就是说，编码问题反复出现，很可能是：
- **主因**：argv 文本传递高危
- **放大器**：去重失配导致坏文本重复沉积

---

## 最小改动修复清单（当前阶段）
### 必改 1：CLI 新增 `ingest-stdin`
文件：
- `memory/working-memory/cli.mjs`

动作：
- 增加 `ingest-stdin` 命令
- 从 stdin 读取 JSON payload
- 解析并调用 `ingestTurn`
- 保留旧 `ingest` 仅做短期回滚对照

### 必改 2：插件桥从 argv 切到 stdin JSON
文件：
- `.openclaw/extensions/working-memory-core/live-ingest.ts`

动作：
- 不再通过 argv 传 `userText / assistantText`
- 改用 `input: JSON.stringify(payload)`
- 调用 `ingest-stdin`

### 必改 3：修正 live-ingest dedupe 口径
文件：
- `.openclaw/extensions/working-memory-core/live-ingest.ts`

动作建议：
- dedupe 不要再把实时 timestamp 作为主键核心部分
- 改为以：
  - `sessionId`
  - `userText`
  - `assistantText`
  - （可选）短时间窗口
  为主
- 或直接与 replay store 的去重口径统一

目的：
- 避免同一污染 turn 因时间戳变化反复写入

---

## 当前结论
如果只切 stdin 协议，不修 dedupe 放大器：
- 主污染源会下降
- 但相同脏 turn 仍可能过量写入

如果只修 dedupe，不切 stdin 协议：
- 污染制造源还在
- 只是传播变慢

所以当前更完整的第一阶段修法应该是：
1. **切 stdin JSON 协议**（切主根因）
2. **同步修 dedupe 口径**（切传播放大器）

这两刀一起，才像真正“止新增污染”的第一阶段。