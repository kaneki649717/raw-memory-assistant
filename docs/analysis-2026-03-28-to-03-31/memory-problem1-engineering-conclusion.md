# 问题 1 工程结论（阶段版）：当前主链路与分叉实现的真实关系

## 结论先说
当前系统已经可以做出一个比较明确的工程判断：

### 真正被插件桥和配置接住的主执行链
是这条：

`OpenClaw memory slot`
→ `.openclaw/extensions/working-memory-core/index.mjs`
→ `memory/working-memory/cli.mjs`
→ `memory/working-memory/runtime/*.mjs`
→ `memory/working-memory/store/*.json`

这条链是 **当前被正式接入 OpenClaw 的有效主链路**。

---

## 为什么这么判断
### 1. 配置层已明确指向 working-memory-core
在 `openclaw.json` 中：
- `plugins.slots.memory = working-memory-core`

说明 OpenClaw 的 memory slot 已经绑定到该插件。

### 2. 插件桥层实际调用的是 `memory/working-memory/cli.mjs`
在 `.openclaw/extensions/working-memory-core/index.mjs` 里，插件配置默认：
- `cliRelativePath = memory/working-memory/cli.mjs`

说明插件桥不是调用根部 `runtime/`，而是调用 `memory/working-memory` 下的 CLI。

### 3. CLI 再调用 `memory/working-memory/runtime/*.mjs`
`memory/working-memory/cli.mjs` 中实际 import 的是：
- `./runtime/ingest.mjs`
- `./runtime/recall.mjs`
- `./runtime/hybrid-recall.mjs`
- `./runtime/replay-recall.mjs`

所以从插件桥进入后的真正 recall / ingest 逻辑，当前落在 `memory/working-memory/runtime/`。

---

## 那根部 `runtime/*.mjs` 是什么？
从已读文件看，根部 `runtime/*.mjs`：
- 功能更强
- 判断更细
- 召回/过滤/诊断逻辑更成熟
- 包含更多工程化修复痕迹

因此更像：
- **演化中的增强版实现**
- **新主逻辑候选**
- 或者说 **尚未正式接管插件桥的上位版本**

但关键问题是：
### 它现在还没有被正式接进插件桥的默认调用路径
所以它虽然更强，**却不是当前系统真正默认使用的主执行面**。

---

## 这就是问题 1 当前最核心的病灶
不是“主链路不存在”，而是：

### 已接入主链路
- `memory/working-memory/...`

### 更强的新实现
- `runtime/...`

### 这两套还没正式并轨
于是出现：
1. 配置和插件层认的是一套
2. 你持续强化的是另一套
3. 主系统未必在跑你最强的那套逻辑
4. 后续修复容易出现“改对了文件但没改到生效链路”的问题

---

## 对“主实现 / 分叉实现 / 辅助层”的初步分类
### A. 当前正式主实现（被接入）
- `.openclaw/extensions/working-memory-core/index.mjs`
- `memory/working-memory/cli.mjs`
- `memory/working-memory/runtime/*.mjs`
- `memory/working-memory/store/*.json`

### B. 演化中的增强实现（尚未正式接管）
- `runtime/*.mjs`

### C. 资产/源码/脚本/诊断层
- `memory/working-memory/src/*.ts`
- `memory/working-memory/scripts/*.mjs`
- `memory/working-memory/diagnostics/*`
- `memory/working-memory/schemas/*`

---

## 问题 1 的真正修复目标，进一步收紧为：
> **让“你最强、最新、想作为唯一主中枢的那套分层记忆实现”正式接管插件桥的默认执行路径。**

也就是说，不只是“理念上以分层记忆为主”，而是要做到：
- 插件桥真正调用主实现
- recall/ingest 真正跑在唯一版本上
- 根部 `runtime/` 和 `memory/working-memory/runtime/` 不再长期分叉

---

## 推荐修复顺序（问题 1 内部）
### P1-A：先画清“唯一生效链”
确认当前默认 recall / ingest 的精确调用路径，并固化成文档。

### P1-B：决定谁升格为唯一 runtime
二选一：
1. 让根部 `runtime/` 正式接管
2. 或把根部增强逻辑合并回 `memory/working-memory/runtime/`

但不能长期双跑。

### P1-C：让插件桥只指向唯一 runtime
把桥接调用改成唯一目标，不再存在“默认走旧链、增强写在新链”的情况。

### P1-D：把另一套降级为镜像/备份/迁移中间层
而不是继续模糊共存。

---

## 当前阶段结论
问题 1 仍未解决，但已经确认了最核心的工程病灶：

> **主链路已接入，但接入的是 `memory/working-memory` 这条；而更强的新实现长在根部 `runtime/`，两者尚未正式并轨。**

这就是接下来必须修掉的第一工程断层。
