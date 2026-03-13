# 验证总结

这份文档用对外可读的方式，总结项目目前已经验证过的关键阶段。

## 第 1 轮 —— 分层记忆方向成立

已验证的方向：
- 不再依赖启动时硬读大记忆文件
- 改为按需 recall
- 采用 L0 / L1 / L2 分层结构
- 用 embedding、hybrid retrieval、rerank、orchestrator 作为整体方向

已验证通过：
- event 写入可用
- decision 写入可用
- timeline / decision 能支持最近记忆召回
- 文件和架构实体可以作为 recall 目标命中

当时暴露的问题：
- L0 仍偏模板化
- `whyText` 抽取偏弱
- replay 和 rerank 当时还未接完整

## 第 2 轮 —— 质量和稳定性提升

已验证的提升：
- L0 质量更强
- L1 决策结构更完整
- ingest 的 fallback / 质量门控更稳
- CLI 运行稳定性更好
- 更适合处理工程类查询

这轮带来的结果：
- `decisionText` / `whyText` / `outcomeText` 更像可复用条目
- 运行时边缘问题处理更自然
- 工程问题类召回能力变强

## 第 3 轮 —— L2 原话回放加入

已验证的提升：
- 可以保存原始 user / assistant 回合
- 可以直接从 replay 存储中回放原话
- replay 可以和 event / decision 建立关联
- recall 可以返回原话级证据项

这意味着：
- 系统不再只是摘要 + 决策记忆
- 而是已经具备真正的 L2 原话回放层

## 当前整体状态

项目已经验证过这些核心能力：
- L0 短摘要记忆
- L1 结构化决策记忆
- L2 原话回放记忆
- 事件 / 时间线追踪
- 混合检索基础能力
- rerank 基础能力
- CLI 本地实验链路

## 仍待继续优化

- 更大范围历史上的 replay 覆盖
- 更成熟的 rerank 表现
- 更适合公开发布的 prompt 文案
- 继续减少对原实验环境的耦合
