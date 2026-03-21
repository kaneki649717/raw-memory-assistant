# 更新日志 - 2026-03-21

## 🎯 本次更新概述

同步最近几天对记忆架构的重大改进和修复，包括核心运行时模块、文档完善、类型定义优化等。

## ✅ 核心修复与改进

### Runtime 模块修复

1. **embedding-model.mjs** - 修复配置读取失败，恢复向量检索功能
2. **entity-extractor.mjs** - 扩展正则覆盖范围，支持 .mjs 和模型名提取
3. **ingest.mjs** - 优化重试逻辑，移除冗余代码，添加 UTC+8 时间戳支持
4. **light-model.mjs** - 添加 iflow/qwen3-max 模型支持
5. **config.mjs** - 配置读取优化
6. **paths.mjs** - 路径处理改进
7. **quality-gate.mjs** - 质量门规则优化
8. **recall.mjs** - 召回机制增强
9. **replay-recall.mjs** - 重放召回逻辑完善
10. **replay-store.mjs** - 重放存储优化
11. **rerank.mjs** - 重排序算法改进
12. **store.mjs** - 存储层优化
13. **summarize.mjs** - 摘要生成改进
14. **vector-store.mjs** - 向量存储优化

### Schema 更新

- **decision.schema.json** - 决策记录结构优化
- **event.schema.json** - 事件记录结构完善

### TypeScript 源码同步

- **entity-extractor.ts** - 实体提取器类型定义
- **ingest.ts** - 摄入流程类型定义
- **paths.ts** - 路径处理类型定义
- **recall.ts** - 召回机制类型定义
- **store.ts** - 存储层类型定义
- **types.ts** - 核心类型定义更新

### 文档完善

- **architecture.md** - 架构文档更新
- **data-flow.md** - 数据流文档完善
- **decoupling-notes.md** - 解耦说明更新
- **fixes-2026-03-10.md** - 修复记录补充
- **module-map.md** - 模块映射更新
- **release-checklist.md** - 发布检查清单完善
- **roadmap.md** - 路线图更新
- **usage.md** - 使用文档改进
- **validation-round-1/2/3.md** - 验证轮次记录
- **validation-summary.md** - 验证总结

## 🔧 技术改进

1. **向量检索恢复** - 修复 embedding 配置失效问题，恢复混合召回能力
2. **实体提取增强** - 扩展正则匹配范围，提升 L1/L2 关联准确性
3. **时间戳标准化** - 统一使用 UTC+8 时间戳
4. **模型支持扩展** - 新增 iflow/qwen3-max 支持
5. **代码质量提升** - 移除冗余逻辑，优化重试机制

## 📊 影响范围

- **Runtime 模块**: 14 个文件更新
- **Schema 定义**: 2 个文件更新
- **TypeScript 源码**: 6 个文件更新
- **文档**: 12 个文件更新

## 🎉 整体提升

- ✅ 向量检索功能完全恢复
- ✅ 实体提取完整性提升
- ✅ 代码可维护性增强
- ✅ 文档完整性提高
- ✅ 类型定义更加严谨

---

**同步时间**: 2026-03-21 13:43 (UTC+8)  
**同步来源**: C:\Users\1\.openclaw\workspace  
**目标仓库**: https://github.com/kaneki649717/raw-memory-assistant
