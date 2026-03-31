# 编码问题修复方案对比（工程收口版）

## 目标
解决反复出现的中文编码 / mojibake 污染问题，重点切断：
- 插件桥 -> CLI 的文本传输污染源
- 历史脏数据继续回流造成的假性复发

---

## 候选方案对比

### 方案 A：继续保留 argv 文本传递（不推荐）
#### 做法
- 维持当前：
  - `execFileSync(process.execPath, [cliPath, "ingest", sessionId, userText, assistantText, ...])`
- 继续围绕 UTF-8 / sanitize / 清洗补丁修

#### 优点
- 改动最小

#### 致命问题
- 根因层基本没动
- 无法切断 Windows 中文 argv 风险
- 极易再次复发
- 只能持续“补后果”

#### 结论
**不推荐**。这是过去已经被证明会反复失败的路径。

---

### 方案 B：临时 JSON 文件协议（可行）
#### 做法
1. 插件桥把 turn payload 写到临时 JSON 文件
2. CLI 只通过 argv 传一个短路径：
   - `node cli.mjs ingest-file C:\...\payload.json`
3. CLI 读取 JSON 文件并 ingest

#### 优点
- 避免大段中文走 argv
- CLI 改动相对可控
- 对 Windows 兼容性较好
- 易于调试（payload 文件可复盘）

#### 缺点
- 要处理临时文件清理
- 需要防止残留文件和并发竞争
- 故障面多一个“文件生命周期层”
- 对隐私和磁盘残留略差

#### 结论
**可作为备选方案**，尤其适合快速止血；但长期不如 stdin 干净。

---

### 方案 C：stdin JSON 协议（首选）
#### 做法
1. CLI 新增命令，例如：
   - `ingest-stdin`
2. 插件桥调用：
   - `execFileSync(process.execPath, [cliPath, "ingest-stdin"], { input: JSON.stringify(payload), encoding: "utf8" ... })`
3. CLI 在进程内从 stdin 读取完整 JSON，再 parse 后调用 `ingestTurn(...)`

#### 优点
- 不再让大段中文经过 argv
- 不引入临时文件残留
- 协议清晰，后续可扩展字段（timestamp / chatType / source / subtype）
- 最适合长期作为主链协议
- 最容易与根部 runtime 并轨

#### 风险/注意点
- CLI 需要新增一个 stdin 入口
- 插件桥也要同步切换
- 要处理 stdin 为空 / 非法 JSON / 超长 payload 的错误分支

#### 结论
**首选方案**。这是当前最像“既能切根因，又能保持工程整洁”的路线。

---

## 推荐最终方案
### 结论
**优先采用方案 C：stdin JSON 协议。**

原因：
1. 直接切断 argv 中文长文本风险
2. 不额外引入临时文件生命周期问题
3. 更适合作为后续唯一主链协议
4. 更方便未来接到根部 `runtime/` 正式主实现

---

## 推荐落地路径（最小改动版）
### 第 1 步：保留 CLI 路径不变，只新增命令
先不动插件桥配置路径，不改 `cliRelativePath`。

仍然保留：
- `memory/working-memory/cli.mjs`

但新增：
- `ingest-stdin`

这样可以做到：
- 外层接线几乎不动
- 仅调整协议
- 回滚简单

### 第 2 步：插件桥切到 stdin 协议
把：
- `execFileSync(... [cliPath, "ingest", sessionId, userText, assistantText, ...])`

改为：
- `execFileSync(... [cliPath, "ingest-stdin"], { input: JSON.stringify(payload), encoding: "utf8" ... })`

payload 至少包括：
- `sessionId`
- `userText`
- `assistantText`
- `chatType`
- `timestamp`

### 第 3 步：CLI 侧做结构化校验
在 `ingest-stdin` 中：
- 校验 JSON parse
- 校验字段类型
- 校验空文本
- 记录异常 payload（但不回写污染数据）

### 第 4 步：再考虑并轨到根部 runtime
等协议跑稳后，再把 CLI 内部调用切向根部 `runtime/*.mjs`。

这样顺序更稳：
1. 先切协议
2. 再切 runtime

避免两个高风险改动同一时间发生。

---

## 为什么不建议“现在同时切协议 + 切根部 runtime”
因为当前同时存在两个大变量：
1. 编码污染源
2. runtime 双轨并存

如果一起动：
- 一旦出问题，难以判断是协议问题还是 runtime 并轨问题
- 调试成本翻倍

所以更合理的节奏是：
### 先解决编码污染入口
### 再推进 runtime 主链并轨

---

## 修复后必须增加的防复发机制
### 1. 写前健康检查
在 ingest 前检测：
- `�`
- 异常 mojibake 模式
- CJK 损坏比例
- 可疑乱码高频短语（如 `�Ѽ�¼`、`�Ự�ƽ�`）

### 2. 污染拒写 / 降级策略
如果 payload 呈现强污染特征：
- 不直接写入 store
- 记入 model-alert / ingest alert
- 留待人工或后续自动隔离

### 3. 新增污染监控
切换协议后，持续观测：
- replay-store.json
- vector-store.json
- 新生成 L0 / Decision / Replay

确认是否还有**新增**乱码，而不是只看历史存量。

---

## 当前收口结论
如果目标是：
- 真正修复编码问题
- 不再像以前那样反复复发
- 同时为后续根部 runtime 扶正打基础

那么最优动作顺序应该是：
1. **先把 live ingest 从 argv 文本链切到 stdin JSON 协议**
2. **再做污染监控与 store 清洗/重建策略**
3. **最后再推进 runtime 并轨**

这会比“继续补 UTF-8”靠谱得多。