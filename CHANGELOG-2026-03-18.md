# 更新日志 - 2026-03-18

## 🎉 重大更新：架构深度剖析与代码同步

### 更新时间
2026-03-18 10:03 (GMT+8)

---

## 📋 更新内容

### 1. 新增架构深度剖析文档

创建了 **`ARCHITECTURE-DEEP-DIVE.md`**，这是一份全面深度剖析记忆架构的核心文档。

#### 文档亮点

**10 大章节，16,000+ 字**：

1. **架构概览** - 系统定位、核心目标
2. **核心设计理念** - 分层握手、混合记忆、按需召回
3. **三层记忆结构** - L0/L1/L2 详细说明
4. **数据流与生命周期** - 完整流程图、自动写入机制
5. **检索与召回机制** - 意图分类、混合检索、重排序策略
6. **质量门控系统** - L0 质量检查、跳过低价值对话、合并策略
7. **插件集成** - OpenClaw 插件接口、配置示例
8. **存储架构** - 文件结构、存储格式、原子写入
9. **性能优化** - 增量索引、缓存机制、去重优化
10. **未来演进** - 短期/中期/长期计划

#### 核心价值

这份文档解答了所有关键问题：

- ✅ **为什么要分层？** - L0 导航、L1 详情、L2 原话，各司其职
- ✅ **如何自动写入？** - agent_end hook 自动触发 ingest
- ✅ **如何精准召回？** - 混合检索 + 重排序 + 意图分类
- ✅ **如何保证质量？** - 多重质量门，拒绝低质量记忆
- ✅ **如何优化中文？** - CJK N-gram、分词、实体提取
- ✅ **如何集成 OpenClaw？** - 插件接口、配置示例

---

### 2. 代码同步更新

#### 2.1 同步核心运行时文件

从实际运行的 `memory/working-memory/runtime/` 同步了 **16 个核心文件**：

```
✅ backfill-sessions.mjs
✅ bundle-rerank.mjs
✅ embedding-model.mjs
✅ entity-extractor.mjs
✅ hybrid-recall.mjs
✅ ingest.mjs
✅ light-model.mjs
✅ paths.mjs
✅ quality-gate.mjs
✅ recall.mjs
✅ replay-recall.mjs
✅ replay-store.mjs
✅ rerank.mjs
✅ store.mjs
✅ summarize.mjs
✅ vector-store.mjs
```

#### 2.2 同步 Prompt 文件

```
✅ prompts/l0-summarizer.md
✅ prompts/l1-summarizer.md
```

#### 2.3 同步 CLI 入口

```
✅ cli.mjs
```

---

### 3. 文档索引优化

更新了 `README.md` 的文档索引，新增分类：

```markdown
### 核心文档
- **[架构深度剖析](./ARCHITECTURE-DEEP-DIVE.md)** ⭐⭐⭐
- [架构总览](./docs/architecture.md)
- ...

### 技术文档
- [解耦说明](./docs/decoupling-notes.md)
- ...

### 内部开发记录
- [验证第 1 轮](./docs/validation-round-1.md)
- ...
```

---

## 🎯 核心改进

### 1. 架构理解深度提升

**之前**：
- 文档分散，缺乏整体视角
- 设计理念不够清晰
- 实现细节不够深入

**现在**：
- 一份文档看懂整个架构
- 设计理念、实现细节、优化策略全覆盖
- 16,000+ 字深度剖析

### 2. 代码与文档完全同步

**之前**：
- temp-repo 代码可能过时
- 与实际运行版本不一致

**现在**：
- 所有核心文件与实际运行版本完全同步
- 确保代码可用性和准确性

### 3. 文档组织更清晰

**之前**：
- 文档索引扁平化
- 不易找到核心文档

**现在**：
- 分类清晰（核心/技术/开发记录）
- 重点文档标星标注

---

## 📊 架构剖析亮点

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

### 2. 混合检索流程

```
用户查询: "继续做记忆系统"
    ↓
1. classifyRecallIntent() → "working_memory_continuity"
2. hybridSearch(query, 12)
   - 向量检索 (embedding)
   - 词法检索 (token/ngram)
   - 混合打分 (0.65*vec + 0.35*lex)
3. findL0ByQuery()
4. findDecisionsByEntity()
5. findEventsByEntity()
6. unifyRecallBundle()
   - 去重合并
   - 重排序 (rerank)
   - 选择 top 12
```

### 3. 质量门控系统

```javascript
export function isWeakL0(text) {
  // 基础检查
  if (!trimmed || trimmed === "NONE") return true;
  if (trimmed.length < 14) return true;
  if (trimmed.length > 48) return true;
  
  // 模糊表述检测（11种模式）
  const vaguePatterns = [
    /修复了bug/i,
    /修改了配置/i,
    /写了脚本/i,
    ...
  ];
  
  // 禁用词检查
  if (trimmed.toLowerCase().includes("general")) return true;
  
  return false;
}
```

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

## 🚀 技术亮点

### 1. 自动写入机制

```javascript
// working-memory-core/index.mjs
api.on("agent_end", async (event, ctx) => {
  const turn = extractLatestTurn(event?.messages || []);
  if (!turn) return;
  
  persistIncrementalTurn(api, ctx?.sessionKey, turn.userText, turn.assistantText);
});
```

### 2. 重排序策略

```javascript
function rerankItems(query, items) {
  return items.map(item => {
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

### 3. 原子写入

```javascript
function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, json, { encoding: "utf-8" });
  fs.renameSync(tmpPath, filePath);  // 原子操作
}
```

---

## 📈 项目状态

### 已完成功能

- ✅ L0/L1/L2 三层架构
- ✅ 混合检索（向量 + 词法）
- ✅ 重排序优化
- ✅ 质量门控
- ✅ 自动 ingest hook
- ✅ 中文优化
- ✅ 插件集成
- ✅ **架构深度剖析文档**
- ✅ **代码完全同步**

### 进行中

- 🔄 性能监控与指标
- 🔄 更多测试用例
- 🔄 错误处理增强

### 规划中

- 📋 Knowledge Base 分流
- 📋 多模态支持
- 📋 分布式部署

---

## 🎓 学习价值

这份架构深度剖析文档适合：

1. **想深入理解分层记忆架构的开发者**
2. **想集成到自己项目的工程师**
3. **想研究 Agent 记忆系统的研究者**
4. **想优化现有记忆系统的架构师**

---

## 📚 推荐阅读顺序

### 新手入门
1. `README.md` - 了解项目概况
2. `ARCHITECTURE-DEEP-DIVE.md` - 深入理解架构
3. `docs/usage.md` - 学习如何使用

### 深入研究
1. `ARCHITECTURE-DEEP-DIVE.md` - 架构全貌
2. `docs/data-flow.md` - 数据流详解
3. `runtime/*.mjs` - 源码阅读

### 集成开发
1. `ARCHITECTURE-DEEP-DIVE.md` - 第 7 章：插件集成
2. `docs/usage.md` - 使用说明
3. `config.example.json` - 配置示例

---

## 🔗 相关链接

- [架构深度剖析](./ARCHITECTURE-DEEP-DIVE.md) ⭐⭐⭐
- [README](./README.md)
- [2026-03-10 修复记录](./docs/fixes-2026-03-10.md)
- [2026-03-14 更新日志](./CHANGELOG-2026-03-14.md)

---

## 👥 贡献者

- **架构剖析与代码同步**：Kiro (AI Assistant)
- **需求提出与验证**：小锦 (User)
- **项目维护**：小锦

---

**更新完成！项目已全面完善，可以推送到 GitHub。** 🚀
