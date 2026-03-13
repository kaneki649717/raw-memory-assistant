# 模块说明

这份文档解释项目中主要文件分别负责什么。

## 顶层文件

### `config.mjs`
项目配置加载入口，负责项目内相对路径与配置读取。

导出内容：
- `resolveProjectPath()`：生成项目根目录下的相对路径
- `loadProjectConfig()`：读取 `config.json` 或 `AGENT_MEMORY_CONFIG_PATH` 指向的配置

### `config.example.json`
`config.json` 模板。

主要结构：
- `storage.root`：运行时数据存放根目录
- `models.embedding`：embedding 模型配置
- `models.light`：轻量模型配置

---

## `runtime/`

这里放的是运行时可执行模块。

### `runtime/config.mjs`
统一配置模块。

负责：
- 项目内相对路径解析
- 读取 `config.json`
- 配置读取辅助函数

### `runtime/paths.mjs`
路径常量模块。

负责：
- 定义 `WORKING_MEMORY_ROOT`
- 定义各类 store 文件路径
- 定义 `PROMPTS_DIR`
- 统一项目内路径

### `runtime/ingest.mjs`
主写入链路。

负责：
- 接收一轮 user / assistant 文本
- 提取实体
- 生成摘要信号
- 写入 event / decision / L0 / replay
- 触发后续索引逻辑

### `runtime/recall.mjs`
主召回编排入口。

负责：
- 判断 recall 意图
- 调用不同召回来源
- 组装 recall bundle
- 判断是否优先原话证据

### `runtime/hybrid-recall.mjs`
混合检索层。

负责：
- 向量召回
- 词法召回
- 分数合并
- 把候选项交给 rerank

### `runtime/rerank.mjs`
重排层。

负责：
- 时间新近性加权
- 来源类型加权
- 实体命中打分
- 原话回放优先级处理

### `runtime/bundle-rerank.mjs`
统一合并与重排层。

负责：
- 规范化不同来源结果
- 构建统一候选列表
- 去重
- 选出最终输出项

### `runtime/replay-recall.mjs`
原话回放检索层。

负责：
- 定位相关原始对话片段
- 返回原话级证据项

### `runtime/replay-store.mjs`
原话回放存储层。

负责：
- `loadReplayStore()` / `saveReplayStore()`
- `appendReplayItem()`
- `findReplayByEventId()` / `findReplayByDecisionId()`
- `searchReplay()`

### `runtime/store.mjs`
结构化存储层。

负责：
- `loadEvents()` / `saveEvents()`
- `loadDecisions()` / `saveDecisions()`
- `loadL0Items()` / `saveL0Items()`
- 按 token 做基础检索

### `runtime/vector-store.mjs`
向量索引存储层。

负责：
- `loadVectorStore()` / `saveVectorStore()`
- `upsertVectorItems()`
- `readVectorItems()`

### `runtime/entity-extractor.mjs`
实体提取模块。

负责：
- `extractEntities()`：识别文件、路径、模型、配置键、检索钩子
- `extractCommands()`：识别命令行命令
- `inferActionType()`：判断本轮动作类型

### `runtime/embedding-model.mjs`
Embedding 适配层。

负责：
- `resolveEmbeddingConfig()`：读取 embedding 配置
- `embedTexts(texts)`：调用 embedding 接口

### `runtime/light-model.mjs`
轻量模型适配层。

负责：
- `resolveLightModelConfig()`：读取轻量模型配置
- `callLightModel(params)`：调用 chat 接口

### `runtime/summarize.mjs`
摘要生成支持层。

负责：
- `generateL0WithModel()`：生成 L0 短摘要
- `generateL1WithModel()`：生成 L1 结构化决策 JSON
- 从 `PROMPTS_DIR` 读取 prompt

---

## `src/`

这里放 TypeScript 源文件，对应 runtime 逻辑。

### `src/ingest.ts`
TypeScript 版 ingest 源码。

### `src/recall.ts`
TypeScript 版 recall 源码。

### `src/store.ts`
TypeScript 版存储层源码。

### `src/entity-extractor.ts`
TypeScript 版实体提取源码。

### `src/paths.ts`
TypeScript 版路径模块源码。

### `src/types.ts`
项目级类型定义。

---

## `schemas/`

### `schemas/event.schema.json`
事件层 schema。

### `schemas/decision.schema.json`
决策层 schema。

---

## `prompts/`

### `prompts/l0-summarizer.md`
L0 摘要生成 prompt。

### `prompts/l1-summarizer.md`
L1 决策提炼 prompt。

---

## `docs/`

### `docs/architecture.md`
架构总览。

### `docs/module-map.md`
也就是本文件：模块职责说明。

### `docs/data-flow.md`
写入 / 读取数据流说明。

### `docs/usage.md`
独立使用说明。

### `docs/roadmap.md`
路线图。

### `docs/validation-summary.md`
公开版验证总结。

### `docs/release-checklist.md`
发布检查清单。

---

## `examples/`

放的是脱敏后的示例记忆数据，用于公开演示。

这些示例是安全样本，不是真实私有运行数据。
