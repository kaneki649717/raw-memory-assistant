# 编码问题深挖（阶段结论 1）

## 结论先说
编码问题不能再被当成“UTF-8 写文件没配好”这么简单。

当前证据已经说明：

1. **污染不是只在显示层**
2. **污染已经进入持久层数据本体**
3. **过去的修法更多是在清症状，而不是切断污染源**

---

## 已确认的硬证据
### 1. 污染已经进入持久 store 本体
以下文件中都能看到中文被污染后的内容：
- `memory/working-memory/store/replay-store.json`
- `memory/working-memory/store/vector-store.json`
- 以及对应的 `.backup` / `.pre-cron-clean` / `.tmp` 文件

这说明：
- 不是单纯 PowerShell 显示错
- 不是只读的时候错
- 而是错误文本已经被写入并被二次备份、二次索引、二次传播

### 2. 当前 sanitize 只是在“擦症状”
`quality-gate.mjs` 里存在：
- 删除 `\uFFFD`
- 删除 `�`

这类处理只能去掉 replacement char，
但对 `����` / `�Ѽ�¼` / `�Ự�ƽ�` 这种 **mojibake 形式** 基本无能为力。

说明过去修法并没有切断真正污染源。

### 3. 文件级 UTF-8 并不能证明链路没问题
当前 store 文件：
- 没有 UTF-8 BOM
- Node 读写代码里大量显式使用 `utf-8` / `utf8`

但污染仍然存在。

这说明一个关键结论：
> **很可能不是“文件编码错”，而是“写入前字符串就已经错了”。**

---

## 当前最强根因候选
### 候选 A（高优先级）：插件桥用 argv 传大段中文文本
在 `.openclaw/extensions/working-memory-core/live-ingest.ts` 中：
- `cp.execFileSync(process.execPath, [cliPath, "ingest", sessionId, userText, assistantText, ...], { encoding: "utf8" })`

也就是：
- userText / assistantText 直接作为命令行参数传给 Node CLI

这是 Windows 上非常高危的做法，因为：
1. argv 本来就不适合承载长中文文本
2. Windows 进程参数边界/本地 code page/字符串转换路径很容易出问题
3. 即使最终落盘时仍写成 UTF-8，**进入 CLI 时字符串可能早就坏了**

这与当前现象高度吻合：
- 文件本身 UTF-8 没问题
- 但落盘内容仍是乱码
- 修多少次 `writeJsonAtomic(..., "utf-8")` 都会复发

### 候选 B：历史脏数据被继续传播
当前已经污染的 replay/vector/store 数据，会继续：
- 参与 recall
- 参与 vector 索引
- 进入 bundle
- 进入 backup / tmp / pre-clean

这会造成：
- 老污染不断回流
- 看起来像“新写入又坏了”

所以就算修了写入协议，如果不做数据隔离/清洗，也会造成假性复发。

### 候选 C：模型输出链可能放大污染，但不像第一根因
`summarize.mjs -> light-model.mjs` 当前看都是 fetch/json 路径，理论上 UTF-8 风险低于 argv。
它更可能是：
- 接收到已经污染的输入，再生成污染输出
- 或把污染文本带入 L0/L1

因此目前更像“放大器”，不像第一污染源。

---

## 当前阶段判断
### 我认为“插件桥通过 argv 传大段中文文本”非常可能是主因之一，甚至是第一主因。
而且它比“写文件没指定 utf8”更能解释：
- 为什么你修了 6 次还会回来
- 为什么文件是 UTF-8 但内容仍然坏
- 为什么污染会跨 replay / vector / backup 同步扩散

---

## 后续要验证的关键点
1. 是否所有 live ingest 都经过 argv 文本传递
2. 是否还有其他 `execFileSync/spawnSync + argv 传 userText/assistantText` 的入口
3. 当前污染数据中，哪些是历史遗留，哪些是最近仍在新增
4. 在改协议前，是否需要先做 store 隔离/只读快照，防止继续扩散

---

## 初步修复方向（还未动手）
如果后续验证成立，修法就不再是“继续补 UTF-8”，而是：

### 第一层：切断污染源
- **禁止通过 argv 传 userText / assistantText 大段文本**
- 改为：
  - stdin JSON
  - 或临时 JSON 文件
  - 或 pipe

### 第二层：建立写前健康校验
在 ingest 前检测：
- mojibake 特征
- replacement char
- 非法截断
- 异常比例 CJK 损坏

### 第三层：隔离旧污染
- 对现有 replay/vector/store 做只读快照
- 标记污染批次
- 决定清洗/重建策略

---

## 当前结论状态
还不能说“编码问题根因已最终确认”。
但已经明确：

> **它不是简单文件编码问题，而是整条文本输入链的问题；其中“插件桥通过 argv 传大段中文”是目前最强的主因候选。**
