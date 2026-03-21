# 分层 Agent 记忆架构（适配 OpenClaw）

> 一套面向智能体长期上下文的分层记忆系统：不仅能记"摘要"，还能记"决策""事件"和"原话"，并在查询时按需召回，再把最相关记忆注入当前对话上下文。

---

## 这是什么

这是一个面向 Agent / OpenClaw 场景设计的**分层记忆架构项目**。

它不是传统那种"把聊天记录全扔进向量库，然后靠 embedding 做相似检索"的简单记忆方案，而是把记忆拆成不同层：

- **L0：短摘要层** —— 快速给模型一个"这一段发生了什么"的导航视图
- **L1：决策层** —— 保存可以复用的决定、原因和结果
- **L2：原话回放层** —— 保存 user / assistant 的原始回合文本，支持回放原话证据
- **事件层（Event）** —— 表达时间线、过程推进和阶段变化
- **混合检索（Hybrid Retrieval）** —— 向量检索 + 词法检索
- **重排（Rerank）** —— 根据查询意图重新排序候选记忆
- **上下文注入（Runtime Injection）** —— 把最相关记忆打包注入当前运行时上下文

这套东西的目标，不是"让模型记更多字"，而是：

> **让模型在需要时拿到"正确类型的记忆"。**

---

## 这个项目解决什么问题

传统 Agent memory 常见问题：

1. **所有记忆都混在一起**
   - 决策、事件、原话、摘要没有区分

2. **只能找相似文本，不能理解记忆角色**
   - 问"上次我们定了什么方案"
   - 和问"当时原话怎么说的"
   - 实际需要的是两种不同的记忆

3. **会话一长就只能靠压缩摘要**
   - 摘要会丢细节
   - 尤其容易丢掉"为什么这么做"和"原话证据"

4. **启动时硬读大记忆文件，污染上下文**
   - 会浪费上下文窗口
   - 也会把不相关的旧信息强塞进当前对话

这个项目的核心思路就是：

- 不在启动时硬读大记忆文件
- 改成**按需 recall**
- 不把所有记忆扁平化
- 改成**按层存储、按层召回、统一重排、统一注入**

---

## 为什么这不是普通 RAG

很多人第一眼看到"向量检索 + 记忆 + 注入上下文"，会觉得这就是普通 RAG。

但这套系统和普通 RAG 的核心区别很明显：

### 普通 RAG 更像什么

普通 RAG 的典型思路通常是：

- 把文档切块
- 做 embedding
- 相似检索
- 把检索结果拼进 prompt

它更适合：
- 知识问答
- 文档问答
- 外部资料检索

### 这套系统更像什么

这套系统更像：

> **面向对话连续性、任务推进和长期协作的"分层工作记忆系统"**

它和普通 RAG 的不同点：

| 维度 | 普通 RAG | 本系统 |
|------|---------|--------|
| 存储结构 | 扁平化向量库 | L0 摘要 / L1 决策 / L2 原话 / Event 时间线，分层存储 |
| 检索方式 | 只看文本相似度 | 按记忆角色召回 + 向量 + 词法 + 重排 |
| 服务场景 | 单次问答 | 长期协作、任务推进、对话连续性 |
| 写入链路 | 通常不关注 | 完整 ingest：实体提取 → 摘要生成 → 结构化写入 → 索引更新 |
| 输出形式 | 检索结果直接拼接 | Context Pack 打包 + 分桶输出 |

所以更准确地说：

> **它可以用到 RAG 的检索能力，但它本身不是"普通 RAG"，而是一套分层的 Agent Working Memory。**

---

## 核心分层设计

### L0：短摘要层

- 快速注入上下文
- 给模型一个"这一段最核心发生了什么"的导航视图
- 适合回答：最近主线是什么？这一段大概在做什么？

**示例**：
```json
{
  "id": "l0_xxx",
  "topic": "记忆系统",
  "actionType": "记忆设计",
  "summaryShort": "记忆设计 | 记忆系统 | 修复 embedding 配置读取失败，恢复向量检索",
  "resultTag": "方案已形成",
  "importance": 0.7
}
```

### L1：决策层

- 保存结构化决策
- 强调：做了什么决定、为什么这么做、结果如何
- 适合回答：上次我们最终决定怎么做？为什么不走旧方案？

**示例**：
```json
{
  "id": "dec_xxx",
  "title": "记忆存储路径重构",
  "decisionText": "将存储根目录从 ./data 改为 workspace 下 memory/working-memory/store",
  "whyText": "与 OpenClaw workspace 结构对齐，避免外部路径依赖",
  "outcomeText": "路径解耦完成，可独立运行",
  "files": ["store.mjs", "paths.mjs"],
  "entities": ["working-memory", "store"]
}
```

### L2：原话回放层

- 保存原始 user / assistant 回合
- 当用户问"原话是什么"时，回放原始文本证据
- 适合回答：你当时原话怎么说的？那段聊天原文是什么？

### Event：事件层

- 表达时间线、推进过程、阶段变化
- 用来补充"不是最终结论，但值得记住"的过程信息
- 适合回答：这几天是怎么一步一步推进到这里的？

**示例**：
```json
{
  "id": "evt_xxx",
  "topic": "OpenClaw",
  "actionType": "配置修改",
  "summaryShort": "配置修改 | OpenClaw | 修复 embedding baseUrl 配置",
  "resultTag": "已调整",
  "entities": ["embedding-model.mjs", "config.json"],
  "timelineKey": "timeline:openclaw:2026-03-21"
}
```

---

## 整体数据流

### 一张图看懂

```text
┌─────────────────────────────────────────────────────┐
│                    写入链路 (Ingest)                   │
│                                                       │
│  用户回合 + 助手回合                                   │
│       ↓                                               │
│  实体提取 (entity-extractor)                           │
│       ↓                                               │
│  L0 摘要生成 (summarize + quality-gate)               │
│       ↓                                               │
│  ┌─────────────────────────────────┐                  │
│  │  写入 Event  → store.json       │                  │
│  │  写入 L0     → working-memory-l0.json              │
│  │  写入 Decision → store.json (按需) │                │
│  │  写入 Replay  → replay-store.json │                │
│  │  更新向量索引 → vector-store.json │                │
│  └─────────────────────────────────┘                  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    读取链路 (Recall)                   │
│                                                       │
│  用户查询                                              │
│       ↓                                               │
│  意图分类                                              │
│       ↓                                               │
│  多源召回                                              │
│    ├─ L0 短摘要召回                                    │
│    ├─ L1 决策召回                                      │
│    ├─ Event 时间线召回                                 │
│    ├─ L2 原话回放召回                                  │
│    └─ Hybrid 混合检索 (向量 + 词法)                    │
│       ↓                                               │
│  结果统一合并 (Bundle)                                 │
│       ↓                                               │
│  Rerank 重排                                          │
│       ↓                                               │
│  Context Pack 上下文打包                               │
│       ↓                                               │
│  注入当前模型上下文                                    │
└─────────────────────────────────────────────────────┘
```

### 写入详细流程

```text
用户回合 + 助手回合
  ↓
sanitizeMemoryText() — 清洗文本
  ↓
extractEntities() + inferActionType() — 提取实体、推断动作类型
  ↓
chooseTopic() — 选择话题 (OpenClaw / 抖音相关 / 记忆系统 / ...)
  ↓
shouldSkipL0Turn() — 跳过无意义回合 (问候 / 纯确认 / 系统消息)
  ↓
generateL0WithModel() — 调用 light model 生成 L0 摘要
  ↓
isWeakL0() + normalizeL0() — 质量门过滤弱摘要
  ↓
maybeCreateDecision() — 按需调用 light model 生成 L1 决策
  ↓
appendEvent() + appendL0Item() + appendDecision() — 写入 store
  ↓
appendReplayItem() — 写入原话回放
  ↓
indexTurnArtifacts() — 增量更新向量索引
```

### 去重与合并机制

写入时，L0 层有自动合并逻辑：

```text
appendL0Item(item)
  ↓
回溯最近 5 条记录
  ↓
shouldMergeL0(existing, item)?
  ├─ topicKey 不同 → 不合并，新建
  ├─ timelineKey 不同 → 不合并，新建
  ├─ topicKey 在宽泛合并集合中 (openclaw / 抖音相关 / ...) → 合并
  └─ actionType 相同 + summary 相似 → 合并
```

### Session 类型过滤

系统会根据 session 类型决定是否写入记忆：

| Session 类型 | 是否写入记忆 | 说明 |
|-------------|-------------|------|
| `agent:main:main` | ✅ 写入 | 主会话，所有对话正常记录 |
| `agent:main:telegram:*` | ✅ 写入 | Telegram 对话正常记录 |
| `agent:main:cron:*` | ❌ 跳过 | cron 定时任务产生的重复性结果不写入 |
| `agent:main:subagent:*` | ❌ 跳过 | 子 agent 临时会话不写入主记忆 |

> **设计原因**：cron 任务（如抖音直播监控）每几分钟执行一次，每次都产生"均未开播"之类的重复结果，如果全部写入记忆会严重污染数据。

---

## OpenClaw 插件接入

### 插件是什么

这个项目通过 OpenClaw 的插件机制（`extensions/working-memory-core`）接入宿主，实现：

- **对话结束后自动 ingest**：通过 `agent_end` hook 自动将每轮对话写入记忆
- **查询时按需 recall**：通过 `memory_search` / `memory_get` 工具让模型主动召回记忆
- **自动去重**：通过 hash 机制防止同一轮对话被重复写入

### 插件文件结构

```text
extensions/working-memory-core/
├── openclaw.plugin.json   # OpenClaw 插件描述文件
├── package.json           # npm 包描述
├── index.mjs              # 主入口（注册 tools + agent_end hook）
├── index.ts               # TypeScript 源码
└── live-ingest.ts         # 备用 ingest 入口
```

### Hook 接入流程

```text
agent_end 事件触发
  ↓
extractLatestTurn(messages) — 提取最后一轮 user/assistant 对话
  ↓
sessionKey 过滤 — 跳过 cron/subagent session
  ↓
persistIncrementalTurn() — 调用 CLI 进行 ingest
  ↓
hash 去重检查 — 同一轮对话不重复写入
  ↓
execFileSync(cliPath, ["ingest", sessionKey, userText, assistantText])
```

### Tool 注册

插件注册了两个工具供模型在对话中主动调用：

**memory_search**：
```json
{
  "name": "memory_search",
  "parameters": {
    "query": "搜索关键词",
    "maxResults": 8,
    "minScore": 0.0
  }
}
```

**memory_get**：
```json
{
  "name": "memory_get",
  "parameters": {
    "path": "working-memory/l0|decision|timeline|rawEvidence",
    "from": 1,
    "lines": 20
  }
}
```

---

## 仓库结构

```text
raw-memory-assistant/
├── runtime/                          # 运行时核心模块
│   ├── ingest.mjs                    # 写入链路（实体提取→摘要→决策→写入→索引）
│   ├── recall.mjs                    # 召回链路（多源召回→合并→重排→打包）
│   ├── hybrid-recall.mjs             # 混合检索（向量 + 词法）
│   ├── rerank.mjs                    # 重排（按意图重新排序候选记忆）
│   ├── replay-recall.mjs             # 原话回放召回
│   ├── replay-store.mjs              # 原话存储读写
│   ├── vector-store.mjs              # 向量存储读写
│   ├── store.mjs                     # 结构化存储（Event / Decision / L0）
│   ├── summarize.mjs                 # L0/L1 摘要/决策生成（调用 light model）
│   ├── quality-gate.mjs              # 质量门（弱L0过滤、文本清洗、fallback生成）
│   ├── entity-extractor.mjs          # 实体提取（文件路径、模型名、配置键、命令、端口号）
│   ├── light-model.mjs               # Light model 适配（摘要/决策生成）
│   ├── embedding-model.mjs           # Embedding 模型适配（向量化）
│   ├── config.mjs                    # 配置加载
│   └── paths.mjs                     # 路径管理
│
├── extensions/                       # OpenClaw 插件
│   └── working-memory-core/
│       ├── openclaw.plugin.json      # 插件描述
│       ├── package.json              # npm 包
│       ├── index.mjs                 # 主入口（tools + agent_end hook）
│       ├── index.ts                  # TypeScript 源码
│       └── live-ingest.ts            # 备用 ingest 入口
│
├── cli.mjs                           # CLI 入口（ingest / recall / replay / reindex）
├── cli.ts                            # CLI TypeScript 源码
│
├── schemas/                          # 数据结构定义
│   ├── decision.schema.json          # Decision 结构
│   └── event.schema.json             # Event 结构
│
├── prompts/                          # L0/L1 生成 Prompt
│
├── docs/                             # 文档
│   ├── architecture.md               # 架构总览
│   ├── module-map.md                 # 模块说明
│   ├── data-flow.md                  # 数据流详解
│   ├── usage.md                      # 使用说明
│   ├── roadmap.md                    # 路线图
│   ├── decoupling-notes.md           # 解耦说明
│   ├── release-checklist.md          # 发布检查清单
│   ├── validation-summary.md         # 验证总结
│   ├── validation-round-1.md         # 验证第1轮
│   ├── validation-round-2.md         # 验证第2轮
│   ├── validation-round-3.md         # 验证第3轮
│   └── fixes-2026-03-10.md           # 2026-03-10 修复记录
│
├── src/                              # TypeScript 源码
├── examples/                         # 脱敏示例数据
└── scripts/                          # 工具脚本
```

---

## 依赖说明

### 运行环境

- Node.js 18+

### 依赖能力

项目依赖两类模型能力（不绑定特定厂商）：

**Embedding 模型** — 用于向量化记忆项，做 hybrid recall 中的向量召回部分

**Light 模型** — 用于：
- 生成 L0 短摘要
- 生成 L1 决策草案
- 轻量提炼任务

### 配置方式

通过 `config.json` 或 `AGENT_MEMORY_CONFIG_PATH` 指定配置：

```json
{
  "storage": {
    "root": "./data"
  },
  "models": {
    "embedding": {
      "baseUrl": "https://你的 embedding 接口地址",
      "apiKey": "你的 API Key",
      "model": "你的 embedding 模型名"
    },
    "light": {
      "baseUrl": "https://你的 chat 接口地址",
      "apiKey": "你的 API Key",
      "model": "你的轻量模型名"
    }
  }
}
```

---

## 如何本地运行

### 1）准备配置文件

```bash
cp config.example.json config.json
# 编辑 config.json，填入你的模型配置
```

### 2）写入一轮对话

```bash
node cli.mjs ingest demo-session "我们决定采用 L0/L1/L2 分层记忆。" "好的，再配合 hybrid retrieval 和 rerank。"
```

### 3）召回记忆

```bash
node cli.mjs recall 分层记忆架构
```

### 4）回放原话

```bash
node cli.mjs replay 原话 分层记忆
```

### 5）重建索引

```bash
node cli.mjs reindex
```

---

## 当前进度

### 已完成

- [x] working-memory runtime 骨架
- [x] event / decision / L0 / replay 基础写入链路
- [x] 混合检索基础链路
- [x] L2 原话回放层
- [x] rerank 原型
- [x] CLI 本地验证
- [x] 路径 / 配置解耦
- [x] 宿主环境公开化清理
- [x] 文档骨架与公开版整理
- [x] OpenClaw 插件接入（extensions/working-memory-core）
- [x] agent_end hook 自动 ingest
- [x] memory_search / memory_get 工具注册
- [x] Session 类型过滤（cron/subagent 自动跳过）
- [x] L0 自动合并机制（回溯5条 + 宽泛 topic 合并）
- [x] **L0 检索召回修复**（2026-03-10）
- [x] **编码问题修复**（2026-03-10）
- [x] **质量门强化**（2026-03-10）
- [x] **实体提取扩展**（2026-03-10）
- [x] **时间戳问题修复（UTC+8）**（2026-03-14）
- [x] **iflow/qwen3-max 模型支持**（2026-03-14）
- [x] **自动记录功能验证**（2026-03-14）
- [x] **embedding 配置修复**（2026-03-21）
- [x] **实体提取器增强**（2026-03-21）
- [x] **Runtime 模块全面优化**（2026-03-21）
- [x] **cron/subagent 错误写入修复**（2026-03-21）
- [x] **L0 合并窗口扩大**（2026-03-21）

### 仍在继续优化

- [ ] 中文检索质量
- [ ] rerank 质量
- [ ] 更强的 replay 覆盖
- [ ] 更完善的插件化接入设计
- [ ] 记忆可视化 UI

---

## 更新日志

### 🚀 2026-03-21 架构全面优化 + cron 写入修复

**核心修复**：

1. **修复 cron/subagent 错误写入记忆** — 根因：抖音监控 cron 每3分钟执行一次，每次 agent_end hook 都把结果写入记忆，导致 173 条 L0 + 201 条 Event + 93 条 Decision 被错误灌入。修复：在 hook 层拦截 cron/subagent session，不再写入。
2. **修复 embedding 配置读取失败** — 恢复向量检索功能，混合召回能力完全恢复
3. **扩展实体提取器** — 支持 .mjs 文件和更多模型名提取
4. **L0 合并窗口扩大** — 从只看最后1条改为回溯最近5条，解决不同 session 交叉写入时合并失效
5. **Runtime 模块全面更新** — 14 个核心模块优化
6. **质量门增强** — 新增 fallback pattern 检测，泛化 actionType + "已记录" 判定为弱 L0

**涉及文件**：
- `extensions/working-memory-core/index.mjs` — 新增 cron/subagent 过滤
- `extensions/working-memory-core/live-ingest.ts` — 新增 cron/subagent 过滤
- `runtime/store.mjs` — shouldMergeL0 回溯窗口扩大 + 抖音相关加入宽泛合并
- `runtime/ingest.mjs` — shouldSkipL0Turn 过滤 cron 重复结果
- `runtime/quality-gate.mjs` — isWeakL0 检测 fallback pattern

### 🎉 2026-03-14 重大更新

1. **修复时间戳问题（UTC+8）** — 解决 Node.js 系统时间慢 8 小时的问题
2. **添加 iflow/qwen3-max 支持** — 新增 light model，支持自动回退
3. **验证自动记录功能** — 确认 agent_end hook 正常工作
4. **增强调试日志** — 添加 hook 触发日志

### 🔧 2026-03-10 生产环境修复

1. **修复 L0 检索召回问题** — 降低检索阈值，增加话题关键词加权
2. **修复编码问题** — 统一 UTF-8 编码，移除 BOM，清除乱码
3. **清理 general 垃圾条目** — 消除目录污染
4. **强化质量门规则** — 禁止模糊表述，强制实体化
5. **扩展实体提取** — 支持端口号、参数、更多模型名和错误类型

---

## 这个项目适合谁

**适合**：
- 想给 Agent 增强长期记忆能力的人
- 想解决"摘要不够用，原话也想找回来"的问题的人
- 想给 OpenClaw 做更强记忆层的人
- 想研究分层记忆，而不是简单 RAG 记忆的人

**不太适合**：
- 只想做最简单聊天记录 embedding 检索的人
- 不需要结构化决策 / 原话回放的人
- 不打算做本地运行和配置的人

---

## 文档索引

### 核心文档
- [架构总览](./docs/architecture.md)
- [模块说明](./docs/module-map.md)
- [数据流](./docs/data-flow.md)
- [使用说明](./docs/usage.md)
- [路线图](./docs/roadmap.md)

### 技术文档
- [解耦说明](./docs/decoupling-notes.md)
- [发布检查清单](./docs/release-checklist.md)
- [验证总结](./docs/validation-summary.md)
- [2026-03-10 修复记录](./docs/fixes-2026-03-10.md)

### 验证记录
- [验证第 1 轮](./docs/validation-round-1.md)
- [验证第 2 轮](./docs/validation-round-2.md)
- [验证第 3 轮](./docs/validation-round-3.md)

### 更新日志
- [2026-03-21 更新日志](./CHANGELOG-2026-03-21.md)
- [2026-03-14 更新日志](./CHANGELOG-2026-03-14.md)

---

## 一句话总结

> **这是一套适配 Agent / OpenClaw 的分层记忆架构：把摘要、决策、事件和原话分层存储，在查询时按需召回，再把最相关记忆注入当前上下文。**
