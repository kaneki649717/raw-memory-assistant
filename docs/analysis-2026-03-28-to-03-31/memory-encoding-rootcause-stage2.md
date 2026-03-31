# 编码问题深挖（阶段结论 2）

## 新增确认
已经进一步确认：

### 1. 当前 live ingest 主链确实是“纯 argv 文本链”
从代码上已经明确成立：
- `.openclaw/extensions/working-memory-core/live-ingest.ts`
  - `execFileSync(process.execPath, [cliPath, "ingest", sessionId, userText, assistantText, ...])`
- `memory/working-memory/cli.mjs`
  - `const [sessionId = "manual", userText = "", assistantText = "", chatType = "direct"] = rest`

这说明：
- 插件桥没有走 stdin
- 没有走 JSON pipe
- 没有走临时文件缓冲
- 而是直接依赖 **Windows 进程参数 argv** 携带大段中文文本

这使得“argv 文本传输边界”从怀疑点，升级为**已确认存在的高风险结构问题**。

---

## 为什么这很关键
因为这说明当前系统的 live ingest 路径，并不是：
> 插件桥把结构化 payload 安全交给下游

而是：
> 插件桥把原始 userText / assistantText 直接塞进 argv，让 CLI 自己从 `process.argv` 里还原

在 Windows 中文环境下，这正是最容易长期反复制造 mojibake 的结构。

---

## 对“为什么修了很多次还会回来”的新解释
以前的修复大多集中在：
- 统一 UTF-8 写文件
- 清理乱码字符
- 调整 quality gate
- 修 ingest/skip/fallback 逻辑

这些动作都发生在：
- 落盘层
- 质量层
- 召回层

但真正可能反复产出坏文本的：
- **插件桥 -> CLI 文本传输协议层**

一直没有被替换。

所以会出现：
1. 某次清洗后，表面上看好了
2. 但新的 live ingest 继续通过 argv 送中文
3. 坏文本再次写进 replay/vector/store
4. 于是污染又复发

---

## 当前阶段结论
### 我现在认为：
**“插件桥通过 argv 传大段中文文本”已经非常接近编码问题反复复发的第一主因。**

它至少满足：
- 能解释反复复发
- 能解释文件本身 UTF-8 却仍然坏内容
- 能解释为什么症状会扩散到 replay/vector/backup/tmp
- 能解释为什么历史修复 mostly 无法根除

---

## 推荐修复方向（工程上）
### 首选方案：stdin JSON 协议
改造思路：
1. CLI 新增 `ingest-stdin`（或保留 `ingest` 但支持从 stdin 读 JSON）
2. 插件桥不再把 `userText / assistantText` 放进 argv
3. 改为：
   - `execFileSync(process.execPath, [cliPath, "ingest-stdin"], { input: JSON.stringify(payload), encoding: "utf8" ... })`
4. CLI 在进程内读取 stdin，再 parse JSON，进入 ingest pipeline

### 备选方案：临时 JSON 文件协议
1. 插件桥把 turn payload 写到临时 JSON 文件
2. CLI 只通过 argv 传一个短路径参数
3. 下游自行读取 JSON 文件

### 当前倾向
**优先 stdin JSON 协议**：
- 改动集中
- 不需要额外文件清理
- 更适合作为主链长期协议

---

## 后续仍需做的验证
1. 旧污染与新污染要分批识别
2. 在协议切换后，还要继续监控是否有新增 mojibake
3. 如果协议切完仍继续新增，再回头查模型输出链 / 非 live-ingest 写入链

---

## 当前状态
还没正式下手改代码协议，但已经把“最值得先改的地方”钉住了：

> **先把 live ingest 从 argv 文本传输，切到更安全的结构化输入协议。**
