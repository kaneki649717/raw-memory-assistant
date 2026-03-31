## 记忆架构深度剖析报告

### 1. 整体架构

**四层记忆结构：**
- **L0（导航索引层）**：短而密的目录钩子，用于快速定位
- **L1（决策层/Decision）**：重要决策、方案、结论
- **L2（原话回放层/Replay）**：完整对话原文
- **向量检索层（Vector Store）**：embedding + hybrid search

**数据流：**
```
用户对话 → ingest.mjs → 生成 L0/L1/L2 → 写入 store → 索引到 vector store
查询 → recall.mjs → hybrid search + lexical match → rerank → bundle → 返回结果
```

---

### 2. 关键问题诊断

#### ⚠️ 问题 1：embedding-model.mjs 会读取损坏的 openclaw.json

**位置：** `embedding-model.mjs` 第 6 行
```javascript
function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}
```

**问题：** 
- 和 light-model.mjs 一样的问题
- openclaw.json 文件格式损坏（PowerShell 格式）
- 会导致 embedding 调用失败，vector search 无法工作

**影响：**
- ✅ hybrid search 会失败
- ✅ 只能依赖 lexical match（词法匹配）
- ✅ 召回质量下降

**严重程度：** 🔴 高（会导致向量检索完全失效）

---

#### ⚠️ 问题 2：ingest.mjs 的重试逻辑有 bug

**位置：** `ingest.mjs` createEventFromTurn 函数

**当前代码：**
```javascript
let isWeak = false;

while (retryCount < maxRetries) {
  try {
    const modelL0 = await generateL0WithModel(...);
    summaryShort = normalizeL0(modelL0, fallbackSummary);
    
    if (!isWeakL0(summaryShort)) {
      isWeak = false;  // ← 这里有问题
      break;
    }
    
    retryCount++;
  } catch {
    retryCount++;
  }
}

if (isWeakL0(summaryShort)) {
  isWeak = true;  // ← 这里也有问题
}
```

**问题：**
- `isWeak` 变量逻辑混乱
- 循环内设置 `isWeak = false` 没意义（因为初始值就是 false）
- 循环外又重新检测一次 `isWeakL0()`，重复判断

**严重程度：** 🟡 中（逻辑冗余，但不影响功能）

---

#### ⚠️ 问题 3：rerank.mjs 的硬编码信号词过时

**位置：** `rerank.mjs` architectureAndPolicyPriority 函数

**硬编码的信号词：**
```javascript
const architectureSignals = [
  "新记忆系统怎么设计",
  "混合架构",
  "working memory和knowledge base分流",
  "knowledge base分流",
  "embedding/hybrid",
  "l0/l1/l2",
  "orchestrator",
];
```

**问题：**
- 这些是特定历史对话的关键词
- 新对话不会包含这些词，导致召回偏差
- 过度拟合历史数据

**影响：**
- 查询"记忆系统架构"时，会优先召回包含这些硬编码词的旧记录
- 新的架构讨论可能被排在后面

**严重程度：** 🟡 中（影响召回排序，但不致命）

---

#### ⚠️ 问题 4：entity-extractor.mjs 的正则表达式不够全面

**位置：** `entity-extractor.mjs`

**当前正则：**
```javascript
const FILE_RE = /(?:[A-Za-z]:\\[^\s]+|[\w./-]+\.(?:ts|tsx|js|jsx|json|md|py|yml|yaml|toml|ini|sql|txt))/g;
const MODEL_RE = /\b(?:custom-1\/gpt-5\.2|duojie\/gpt-5\.4|zai\/glm-4\.7|...)\b/g;
```

**问题：**
- FILE_RE 不匹配 `.mjs` 文件（但代码里大量用 .mjs）
- MODEL_RE 硬编码了具体模型名，新模型不会被识别
- 缺少对 URL、API endpoint 的提取

**影响：**
- 实体提取不完整
- L0/L1 的 entities 字段缺失重要信息
- 召回时缺少关键钩子

**严重程度：** 🟡 中（影响实体提取完整性）

---

#### ⚠️ 问题 5：store.mjs 的 shouldMergeL0 逻辑可能过度合并

**位置：** `store.mjs` shouldMergeL0 函数

**当前逻辑：**
```javascript
const broadMergeTopics = new Set([
  "会话推进",
  "openclaw",
  "身份设定",
  "用户设定",
  "工具偏好",
  "心跳规则",
  "启动流程",
  "模型配置",
  "会话状态",
  "whatsapp",
]);

if (broadMergeTopics.has(String(existing.topicKey || ""))) return true;
```

**问题：**
- 只要 topicKey 在 broadMergeTopics 里，就会合并
- 不管内容是否相关，都会合并成一条 L0
- 导致信息丢失

**例子：**
- 第一条：`会话推进 | OpenClaw | 配置模型`
- 第二条：`会话推进 | OpenClaw | 修复bug`
- 因为都是 "openclaw" topic，会被合并成一条
- 丢失了"配置模型"的信息

**影响：**
- L0 数量减少，但信息密度降低
- 召回时可能找不到具体的记忆

**严重程度：** 🟡 中（可能导致信息丢失）

---

### 3. 性能问题

#### ⚠️ 问题 6：hybrid-recall.mjs 每次都重新计算所有向量相似度

**位置：** `hybrid-recall.mjs` hybridSearch 函数

**当前逻辑：**
```javascript
export async function hybridSearch(query, limit = 6) {
  const queryVec = (await embedTexts([query]))[0];
  const items = readVectorItems();  // ← 读取所有向量
  const ranked = items.map((item) => {
    const vector = cosineSimilarity(queryVec, item.embedding);  // ← 遍历计算
    ...
  });
  ...
}
```

**问题：**
- 每次查询都要遍历所有向量计算相似度
- 当 vector store 有几千条记录时，性能会很差
- 没有使用向量索引（如 HNSW、IVF）

**影响：**
- 召回速度慢
- 随着记忆增长，性能线性下降

**严重程度：** 🟡 中（性能问题，但小规模数据可接受）

---

#### ⚠️ 问题 7：replay-store.mjs 的去重逻辑不够严格

**位置：** `replay-store.mjs` appendReplayItem 函数

**当前逻辑：**
```javascript
const dedupeKey = `${item.sessionId}::${item.userText}::${item.assistantText}`;
const exists = store.items.some((entry) => 
  `${entry.sessionId}::${entry.userText}::${entry.assistantText}` === dedupeKey
);
```

**问题：**
- 只用 sessionId + userText + assistantText 去重
- 如果用户在不同时间问同样的问题，会被认为是重复
- 但实际上可能是不同的上下文

**影响：**
- 可能丢失重要的历史对话
- 例如：用户多次问"怎么配置模型"，只会保留第一次

**严重程度：** 🟢 低（边缘情况，影响不大）

---

### 4. 架构优点

✅ **分层清晰**：L0/L1/L2 分层合理，各司其职
✅ **混合检索**：vector + lexical 结合，提高召回率
✅ **rerank 机制**：多维度打分，提高排序质量
✅ **增量索引**：每次对话后增量写入，不需要全量重建
✅ **原子写入**：使用临时文件 + rename，保证数据一致性

---

### 5. 修复优先级

**🔴 高优先级（必须修复）：**
1. **embedding-model.mjs 配置读取失败** - 导致向量检索完全失效

**🟡 中优先级（建议修复）：**
2. entity-extractor.mjs 正则表达式不全
3. rerank.mjs 硬编码信号词过时
4. store.mjs 过度合并 L0
5. ingest.mjs 重试逻辑冗余

**🟢 低优先级（可选优化）：**
6. hybrid-recall.mjs 性能优化
7. replay-store.mjs 去重逻辑

---

### 6. 总体评价

**架构设计：** ⭐⭐⭐⭐ (4/5)
- 分层清晰，逻辑合理
- 混合检索策略先进

**代码质量：** ⭐⭐⭐ (3/5)
- 有一些硬编码和冗余逻辑
- 配置读取有问题

**性能：** ⭐⭐⭐ (3/5)
- 小规模数据可接受
- 大规模数据需要优化

**可维护性：** ⭐⭐⭐⭐ (4/5)
- 模块划分清晰
- 但硬编码信号词不利于维护
