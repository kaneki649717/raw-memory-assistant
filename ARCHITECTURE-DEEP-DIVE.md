# 分层 Agent 记忆架构 - 深度剖析

## 📋 目录
1. [架构概览](#架构概览)
2. [核心设计理念](#核心设计理念)
3. [三层记忆结构](#三层记忆结构)
4. [数据流与生命周期](#数据流与生命周期)
5. [检索与召回机制](#检索与召回机制)
6. [质量门控系统](#质量门控系统)
7. [插件集成](#插件集成)
8. [存储架构](#存储架构)
9. [性能优化](#性能优化)
10. [未来演进](#未来演进)

---

## 架构概览

### 系统定位
这是一个为 AI Agent 设计的**分层工作记忆系统**，解决长期对话中的记忆管理问题：
- **L0 层**：高密度导航索引（目录层）
- **L1 层**：详细决策与推理（详情层）
- **L2 层**：原始对话回放（原话层）

### 核心目标
1. **按需召回**：不再启动时硬读所有记忆文件
2. **精准检索**：混合检索（向量 + 词法 + 重排序）
3. **自动写入**：agent_end hook 自动增量写入
4. **质量保证**：多重质量门控，拒绝低质量记忆
5. **中文优化**：针对中文分词、N-gram、实体提取优化

---

## 核心设计理念

### 1. 分层握手机制
```
用户查询 "继续做记忆系统"
    ↓
L0 召回: "记忆修复 | L0过短 | 用户要求增密防召回丢失"
    ↓
L1 下钻: { title: "L0质量门强化", decisionText: "...", whyText: "..." }
    ↓
L2 原话: "用户: 我们的L0太短了\n助手: 好的，我来加强质量门..."
```

**握手规则**：
- L0 必须包含可检索关键词（主题/对象/动作/结果）
- L1 的 title 必须和 L0 的主题对应
- L2 保留完整原话，供需要时回放

### 2. 混合记忆方案
```
┌─────────────────────────────────────┐
│   Working Memory (工作记忆)         │
│   - L0/L1/L2 分层                   │
│   - 自动 ingest                     │
│   - 混合检索                        │
│   - 短期高频访问                    │
└─────────────────────────────────────┘
              ↓ 未来扩展
┌─────────────────────────────────────┐
│   Knowledge Base (知识库)           │
│   - 文档/API/代码库                 │
│   - 手动导入                        │
│   - 向量检索                        │
│   - 长期低频访问                    │
└─────────────────────────────────────┘
```

### 3. 按需召回策略
**旧方案（已废弃）**：
- 启动时强制读取 `memory/yyyy-mm-dd.md`
- 每次启动都要加载大量历史
- 上下文窗口浪费

**新方案（当前）**：
- 启动时不读任何记忆文件
- 用户提问时通过 `memory_search` 按需召回
- 只加载相关的 L0/L1/L2 片段

---

## 三层记忆结构

### L0 层：导航索引
**作用**：高密度目录，快速定位记忆

**格式**：
```
[主线/动作] | [主题钩子] | [发生了什么/结果/偏差]
```

**示例**：
```
记忆修复 | L0过短 | 用户要求增密防召回丢失
抖音相关 | 客户端误判 | 把桌面端错做成网页打开
OpenClaw排障 | WhatsApp模型错 | Unknown model 需改配置
```

**质量要求**：
- 长度：14-48 字符
- 必须包含 `|` 分隔符
- 至少 3 个部分
- 禁止 `general` 等模糊词
- 禁止"修复了bug"、"改了配置"等空泛表述

**生成流程**：
```javascript
// 1. 提取实体和动作
const entities = extractEntities(userText + assistantText);
const actionType = inferActionType(combined);

// 2. 调用 light model 生成 L0
const modelL0 = await generateL0WithModel({ userText, assistantText });

// 3. 质量门检查
if (isWeakL0(modelL0)) {
  summaryShort = buildFallbackSummary(actionType, entities, resultTag);
} else {
  summaryShort = normalizeL0(modelL0, fallbackSummary);
}
```

### L1 层：详细决策
**作用**：保存推理过程、决策依据、状态变化

**格式**：
```json
{
  "title": "L0质量门强化",
  "decisionText": "增加模糊表述检测，禁止'修复了bug'等空泛词",
  "whyText": "L0过短导致召回失败，用户明确要求增密",
  "outcomeText": "质量门已更新，下一步测试召回效果",
  "files": ["runtime/quality-gate.mjs"],
  "entities": ["L0", "质量门", "召回"],
  "configKeys": [],
  "commands": []
}
```

**触发条件**：
```javascript
function shouldCreateDecision(combined, entities) {
  if (combined.length > 800) return true;
  if (entities.length >= 2) return true;
  const keywords = ["决定", "结论", "方案", "改成", "切到", "确认", 
                    "memory", "embedding", "recall", "修复", "架构"];
  return keywords.some(k => combined.toLowerCase().includes(k));
}
```

### L2 层：原话回放
**作用**：完整保留用户和助手的原始对话

**格式**：
```json
{
  "id": "replay_1773790192403_abc123",
  "timestamp": "2026-03-18T01:30:00.000Z",
  "sessionId": "agent:main:telegram:direct:7421621946",
  "eventId": "evt_1773790192403_xyz789",
  "decisionId": "dec_1773790192500_def456",
  "userText": "我们的L0太短了，召回不到",
  "assistantText": "好的，我来加强质量门，增加长度和密度检查...",
  "entities": ["L0", "质量门", "召回"],
  "files": ["runtime/quality-gate.mjs"]
}
```

**检索场景**：
- 用户问"当时怎么说的"
- 需要查看完整代码片段
- 需要回溯推理过程

---

## 数据流与生命周期

### 完整流程图
```
用户消息 → Agent 回复
    ↓
agent_end hook 触发
    ↓
extractLatestTurn(messages)
    ↓
┌─────────────────────────────────────┐
│  ingestTurn()                       │
│  1. createEventFromTurn()           │
│     - 提取实体/动作                 │
│     - 生成 L0 (light model)         │
│     - 质量门检查                    │
│  2. appendEvent() → timeline        │
│  3. appendL0Item() → L0 store       │
│  4. maybeCreateDecision()           │
│     - 判断是否需要 L1               │
│     - 生成 L1 (light model)         │
│  5. appendDecision() → decision     │
│  6. appendReplayItem() → L2 store   │
│  7. indexTurnArtifacts()            │
│     - 向量化 L0/L1/timeline          │
│     - 写入 vector store             │
└─────────────────────────────────────┘
    ↓
存储到 4 个 JSON 文件：
- working-memory-store.json (timeline + decision)
- working-memory-l0.json (L0 items)
- replay-store.json (L2 原话)
- vector-store.json (向量索引)
```

### 自动写入机制
```javascript
// working-memory-core/index.mjs
api.on("agent_end", async (event, ctx) => {
  const turn = extractLatestTurn(event?.messages || []);
  if (!turn) return;
  
  persistIncrementalTurn(api, ctx?.sessionKey, turn.userText, turn.assistantText);
});
```

**去重机制**：
```javascript
// 使用 SHA1 hash 防止重复写入
const hash = crypto.createHash("sha1")
  .update(`${sessionKey}\n${userText}\n${assistantText}`)
  .digest("hex");
  
if (state.pairs[sessionKey] === hash) return; // 跳过重复
```

---

## 检索与召回机制

### 1. 意图分类
```javascript
function classifyRecallIntent(query) {
  // 原话回放
  if (query.includes("原话") || query.includes("完整对话")) 
    return "raw_replay";
  
  // 主线推进
  if (query.includes("继续") || query.includes("下一步")) 
    return "working_memory_continuity";
  
  // 详细查询
  if (query.includes("配置") || query.includes("哪一行")) 
    return "working_memory_detail";
  
  return "no_memory";
}
```

### 2. 混合检索流程
```
用户查询: "继续做记忆系统"
    ↓
┌─────────────────────────────────────┐
│  buildRecallBundle(query)           │
│  1. classifyRecallIntent()          │
│     → "working_memory_continuity"   │
│  2. hybridSearch(query, 12)         │
│     - 向量检索 (embedding)          │
│     - 词法检索 (token/ngram)        │
│     - 混合打分 (0.65*vec + 0.35*lex)│
│  3. findL0ByQuery()                 │
│     - 中文分词匹配                  │
│     - CJK N-gram 匹配               │
│  4. findDecisionsByEntity()         │
│  5. findEventsByEntity()            │
│  6. replayLookup() (如果需要)       │
│  7. unifyRecallBundle()             │
│     - 去重合并                      │
│     - 重排序 (rerank)               │
│     - 选择 top 12                   │
└─────────────────────────────────────┘
    ↓
返回 contextPack:
{
  intent: "working_memory_continuity",
  primary: [
    { rank: 1, bucket: "decision", text: "..." },
    { rank: 2, bucket: "l0", text: "..." },
    ...
  ]
}
```

### 3. 重排序策略
```javascript
function rerankItems(query, items) {
  return items.map(item => {
    const base = item.finalScore ?? 0;
    const entityScore = entityHitScore(query, item.text, item.meta);
    const recency = recencyBoost(item.createdAt);
    const sourceWeight = sourceTypeWeight(item.source);
    
    const rerankScore = 
      0.34 * base +
      0.30 * entityScore +
      0.14 * sourceWeight +
      0.08 * recency +
      rawReplayPriority(query, item.source) +
      continuityPriority(query, item) +
      architectureAndPolicyPriority(query, item) +
      nextStepPriority(query, item);
    
    return { ...item, rerankScore };
  }).sort((a, b) => b.rerankScore - a.rerankScore);
}
```

**特殊策略**：
- **原话回放优先**：查询包含"原话"时，replay 项 +0.35 分
- **主线推进优先**：查询包含"继续"时，decision 项 +0.18 分
- **架构查询降噪**：查询"总体架构"时，局部实现细节 -0.36 分
- **时效性加权**：1小时内 +0.25，6小时内 +0.18，24小时内 +0.12

### 4. 中文优化
```javascript
// CJK N-gram 提取
function cjkNgrams(text, min = 2, max = 4) {
  const grams = new Set();
  for (const chunk of extractCjkChunks(text)) {
    for (let size = min; size <= max; size++) {
      for (let i = 0; i <= chunk.length - size; i++) {
        grams.add(chunk.slice(i, i + size));
      }
    }
  }
  return [...grams];
}

// 示例：
// "记忆系统" → ["记忆", "忆系", "系统", "记忆系", "忆系统", "记忆系统"]
```

---

## 质量门控系统

### 1. L0 质量检查
```javascript
export function isWeakL0(text) {
  const trimmed = sanitizeMemoryText(text);
  
  // 基础检查
  if (!trimmed || trimmed === "NONE") return true;
  if (trimmed.length < 14) return true;
  if (trimmed.length > 48) return true;
  if (!trimmed.includes("|")) return true;
  
  // 结构检查
  const parts = trimmed.split("|").map(v => sanitizeMemoryText(v));
  if (parts.length < 3) return true;
  if (!parts[1] || parts[1].length < 2) return true;
  if (!parts[2] || parts[2].length < 6) return true;
  
  // 模糊表述检测
  const vaguePatterns = [
    /修复了bug/i,
    /修改了配置/i,
    /写了脚本/i,
    /改了代码/i,
    /处理了数据/i,
    /调整了参数/i,
    /优化了性能/i,
    /更新了文件/i,
    /研究了/i,
    /分析了/i,
    /继续处理/i,
  ];
  if (vaguePatterns.some(re => re.test(trimmed))) return true;
  
  // 禁用词检查
  if (trimmed.toLowerCase().includes("general")) return true;
  
  return false;
}
```

### 2. 跳过低价值对话
```javascript
function shouldSkipL0Turn(userText, assistantText, actionType) {
  const combined = sanitizeMemoryText(`${userText} ${assistantText}`).toLowerCase();
  const normalizedUser = sanitizeMemoryText(userText).toLowerCase();
  
  // 只跳过真正无意义的对话
  if (["你好", "hi", "hello", "在吗", "ok"].includes(normalizedUser) 
      && combined.length < 30) return true;
  
  if (combined.includes("消息已发送") && combined.includes("测试消息") 
      && combined.length < 50) return true;
  
  if (combined.includes("reply with ok") 
      || combined.includes("仅回复ok")) return true;
  
  return false;
}
```

### 3. L0 合并策略
```javascript
function shouldMergeL0(existing, item) {
  if (!existing || !item) return false;
  
  // 必须同一主题和时间线
  if (existing.topicKey !== item.topicKey) return false;
  if (existing.timelineKey !== item.timelineKey) return false;
  
  // 广泛合并的主题
  const broadMergeTopics = new Set([
    "会话推进", "openclaw", "身份设定", "用户设定",
    "工具偏好", "心跳规则", "启动流程", "模型配置",
    "会话状态", "whatsapp"
  ]);
  
  if (broadMergeTopics.has(existing.topicKey)) return true;
  
  // 动作类型和摘要相似
  if (existing.actionType !== item.actionType) return false;
  return similarSummary(existing.summaryShort, item.summaryShort);
}
```

---

## 插件集成

### OpenClaw 插件接口
```javascript
// working-memory-core/index.mjs
const plugin = {
  id: "working-memory-core",
  name: "Working Memory (Core)",
  kind: "memory",
  
  register(api) {
    // 1. 注册工具
    api.registerTool(() => {
      return [
        {
          name: "memory_search",
          description: "Search structured working memory...",
          parameters: SEARCH_SCHEMA,
          execute: async (toolCallId, params) => {
            const result = runRecall(api, params.query, params.maxResults);
            return {
              content: [{ type: "text", text: JSON.stringify(result) }],
              details: result
            };
          }
        },
        {
          name: "memory_get",
          description: "Read a compact working-memory path...",
          parameters: GET_SCHEMA,
          execute: async (toolCallId, params) => {
            const result = readFromCache(api, params.path, params.from, params.lines);
            return {
              content: [{ type: "text", text: JSON.stringify(result) }],
              details: result
            };
          }
        }
      ];
    }, { names: ["memory_search", "memory_get"] });
    
    // 2. 注册 hook
    api.on("agent_end", async (event, ctx) => {
      const turn = extractLatestTurn(event?.messages || []);
      if (!turn) return;
      persistIncrementalTurn(api, ctx?.sessionKey, turn.userText, turn.assistantText);
    });
  }
};
```

### 配置示例
```json
{
  "plugins": {
    "slots": {
      "memory": "working-memory-core"
    },
    "entries": {
      "working-memory-core": {
        "enabled": true,
        "config": {
          "workspaceDir": "C:\\Users\\1\\.openclaw\\workspace",
          "cliRelativePath": "memory/working-memory/cli.mjs",
          "cacheRelativePath": "memory/working-memory/runtime-cache/last-recall.json",
          "maxResults": 5
        }
      }
    }
  }
}
```

---

## 存储架构

### 文件结构
```
memory/working-memory/
├── store/
│   ├── working-memory-store.json      # timeline + decision
│   ├── working-memory-l0.json         # L0 items
│   ├── replay-store.json              # L2 原话
│   └── vector-store.json              # 向量索引
├── runtime-cache/
│   ├── last-recall.json               # 最后一次召回缓存
│   └── ingest-state.json              # 去重状态
├── runtime/
│   ├── ingest.mjs                     # 写入逻辑
│   ├── recall.mjs                     # 召回逻辑
│   ├── store.mjs                      # 存储操作
│   ├── hybrid-recall.mjs              # 混合检索
│   ├── bundle-rerank.mjs              # 重排序
│   ├── quality-gate.mjs               # 质量门
│   └── ...
├── prompts/
│   ├── l0-summarizer.md               # L0 生成 prompt
│   └── l1-summarizer.md               # L1 生成 prompt
└── cli.mjs                            # 命令行入口
```

### 存储格式

**working-memory-store.json**:
```json
{
  "version": 2,
  "events": [
    {
      "id": "evt_1773790192403_xyz789",
      "timestamp": "2026-03-18T01:30:00.000Z",
      "sessionId": "agent:main:main",
      "chatType": "direct",
      "topic": "记忆系统",
      "topicKey": "记忆系统",
      "timelineKey": "timeline:记忆系统:2026-03-18",
      "turnKey": "turn:agent-main-main:abc123",
      "actionType": "架构设计",
      "entities": ["L0", "质量门", "召回"],
      "summaryShort": "记忆修复 | L0过短 | 用户要求增密防召回丢失",
      "resultTag": "已记录",
      "importance": 0.7
    }
  ],
  "decisions": [
    {
      "id": "dec_1773790192500_def456",
      "eventId": "evt_1773790192403_xyz789",
      "title": "L0质量门强化",
      "decisionText": "增加模糊表述检测...",
      "whyText": "L0过短导致召回失败...",
      "outcomeText": "质量门已更新...",
      "files": ["runtime/quality-gate.mjs"],
      "entities": ["L0", "质量门"],
      "confidence": 0.84,
      "createdAt": "2026-03-18T01:30:00.000Z"
    }
  ]
}
```

**vector-store.json**:
```json
{
  "version": 1,
  "items": [
    {
      "id": "l0:l0_1773790192403_abc123",
      "sourceType": "l0",
      "sourceId": "l0_1773790192403_abc123",
      "text": "记忆修复 | L0过短 | 用户要求增密防召回丢失\n记忆系统\n架构设计\n已记录\nL0\n质量门\n召回",
      "embedding": [0.123, -0.456, 0.789, ...],  // 1024维向量
      "meta": { ... },
      "createdAt": "2026-03-18T01:30:00.000Z",
      "updatedAt": "2026-03-18T01:30:05.000Z"
    }
  ]
}
```

### 原子写入
```javascript
function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, json, { encoding: "utf-8" });
  fs.renameSync(tmpPath, filePath);  // 原子操作
}
```

---

## 性能优化

### 1. 增量索引
```javascript
// 每次只索引新增的 turn
export async function indexTurnArtifacts({ event, decision, l0Item }) {
  const docs = [];
  if (l0Item) docs.push(makeL0Doc(l0Item));
  if (event) docs.push(makeEventDoc(event));
  if (decision) docs.push(makeDecisionDoc(decision));
  
  const vectors = await embedTexts(docs.map(d => d.text));
  const items = docs.map((doc, i) => ({ 
    ...doc, 
    embedding: vectors[i],
    updatedAt: new Date().toISOString() 
  }));
  
  upsertVectorItems(items);  // 增量写入
  return { indexed: items.length, mode: "incremental" };
}
```

### 2. 缓存机制
```javascript
// 缓存最后一次召回结果
const cachePath = path.resolve(cfg.workspaceDir, cfg.cacheRelativePath);
fs.writeFileSync(
  cachePath,
  JSON.stringify({
    query,
    cachedAt: new Date().toISOString(),
    intent,
    contextPack,
    bundle
  }, null, 2)
);
```

### 3. 去重优化
```javascript
// 使用 Map 去重，避免重复处理
function selectPrimaryItems(rankedItems, intent) {
  const grouped = new Map();
  for (const item of rankedItems) {
    const canonical = canonicalSourceId(item);
    const list = grouped.get(canonical) ?? [];
    list.push({ ...item, canonicalSource: canonical });
    grouped.set(canonical, list);
  }
  
  const picked = [];
  for (const [, items] of grouped) {
    picked.push(choosePrimaryFromGroup(items, intent));
  }
  
  return picked.slice(0, 12);
}
```

### 4. 批量向量化
```javascript
// 一次性向量化多个文本
const vectors = await embedTexts(docs.map(d => d.text));
```

---

## 未来演进

### 短期计划（已完成）
- ✅ L0/L1/L2 三层架构
- ✅ 混合检索（向量 + 词法）
- ✅ 重排序优化
- ✅ 质量门控
- ✅ 自动 ingest hook
- ✅ 中文优化
- ✅ 插件集成

### 中期计划（进行中）
- 🔄 性能监控与指标
- 🔄 更多测试用例
- 🔄 文档完善
- 🔄 错误处理增强

### 长期计划（规划中）
- 📋 Knowledge Base 分流
  - 文档/API/代码库独立索引
  - 手动导入机制
  - 长期存储优化
- 📋 多模态支持
  - 图片/代码/表格记忆
  - 结构化数据提取
- 📋 分布式部署
  - 向量数据库（Qdrant/Milvus）
  - 分布式存储
  - 多 Agent 共享记忆

---

## 总结

这个分层记忆架构的核心优势：

1. **按需召回**：不再启动时硬读，节省上下文
2. **精准检索**：混合检索 + 重排序，召回准确率高
3. **自动化**：agent_end hook 自动写入，无需手动维护
4. **质量保证**：多重质量门，拒绝低质量记忆
5. **中文优化**：针对中文分词、N-gram 优化
6. **可扩展**：插件化设计，易于集成和扩展

这是一个**生产级**的 Agent 记忆系统，已在实际项目中验证有效。
