# 2026-03-28 至 2026-03-31 记忆系统修复总结

## 这几天主要修了什么

这轮修复的重点不是继续堆 recall 技巧，而是回到长期记忆系统真正的主干：**写入质量、L0 状态机、主线字段纯度、真实链路可验证性**。

核心变化可以概括为四条：

1. **重心从 recall 微调切回 ingest 前段治理**
   - 识别到问题根源不在“怎么搜”，而在“写进去的内容一开始就不够干净、不够结构化”。
   - 围绕 `runtime/ingest.mjs` 与配套流程，重新强化主线字段抽取与事件落库质量。

2. **修正 L0 / NONE / weak / fallback 语义边界**
   - 过去弱摘要、NONE、连接失败与 fallback 容易被混淆，导致 L0 退化、错误 fallback、污染记忆库。
   - 本轮对 `quality-gate` 与 ingest 消费逻辑做了对齐，使“生成质量差”和“模型链路失败”分层处理。

3. **新增主线字段短句化与噪声清洗**
   - 重点解决 `currentStage` / `currentBlocker` / `nextStep` 等字段被整段 markdown、汇报话术、验证段落污染的问题。
   - 将写入内容从“长段落说明”压缩为“可检索、可连续化的短句主线信号”。

4. **打通真实 ingest-stdin 验证链路**
   - 之前 Windows / PowerShell 中文 stdin 注入会污染真实验证。
   - 本轮通过新的 stdin 路径与配套验证脚本，开始用真实链路验证 ingest，而不是只做静态推理式验证。

---

## 已同步到仓库的核心代码

- `runtime/ingest.mjs`
- `runtime/quality-gate.mjs`
- `runtime/recall.mjs`
- `runtime/hybrid-recall.mjs`
- `runtime/replay-recall.mjs`
- `extensions/working-memory-core/live-ingest.ts`

这些文件共同体现了三类升级：

### 1) 写入端升级
- 更严格的 L0 消费规则
- 更明确的 fallback 语义
- 更干净的 replay / ingest 接入方式

### 2) 召回端升级
- 更强的细节查询识别
- 更强的 source-of-truth / precise fact 路由
- 更好的 replay 原文回放能力
- 对低质量记忆条目进行更多过滤与降权

### 3) 去污染升级
- 过滤控制台噪声、系统元信息、污染性长文本
- 避免“看起来有内容，实际上不可复用”的伪记忆污染索引

---

## 本次新增入仓的分析文档

本目录下新增了一批 3/28 当天集中产出的分析材料，包括：

- root cause 分阶段分析
- patch-level 修复计划
- stdin 实施方案
- dedupe / amplifier 说明
- 问题 1 的兼容性检查、全局图谱、工程结论与合并方案
- 新版 roadmap 与主线决策记录

这些文档用于保留这轮修复的工程上下文，便于后续回看“为什么这么改”。

---

## 这轮修复的工程价值

这几天的工作，本质上是把记忆系统从“能产出一些记录”的阶段，推进到“能稳定产出可连续化、可召回、可解释的结构化长期记忆”的阶段。

换句话说，修的不只是 bug，而是在给长期记忆系统补真正的地基。
