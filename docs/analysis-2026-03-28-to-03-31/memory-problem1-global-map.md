# 问题 1 深剖补充：分层记忆不是单目录系统，而是分布式主链路

## 结论
用户的担心是正确的。

当前分层记忆架构 **不是只存在于 `memory/working-memory/` 目录里**，而是至少分布在 3 个关键区域：

1. **OpenClaw 插件接入层**
   - `C:\Users\1\.openclaw\workspace\.openclaw\extensions\working-memory-core\index.mjs`
   - 作用：把 working-memory 暴露成真正的 `memory_search / memory_get` 能力入口
   - 这是“系统接入口”

2. **记忆运行时核心层**
   - `C:\Users\1\.openclaw\workspace\runtime\*.mjs`
   - 包含：`recall.mjs` / `ingest.mjs` / `hybrid-recall.mjs` / `replay-recall.mjs` / `rerank.mjs` / `store.mjs` 等
   - 这是“主逻辑层”

3. **记忆数据、schema、诊断、脚本层**
   - `C:\Users\1\.openclaw\workspace\memory\working-memory\*`
   - 包含：
     - `store/*.json`
     - `schemas/*.json`
     - `src/*.ts`
     - `runtime/*.mjs`
     - `scripts/*.mjs`
     - `diagnostics/*`
   - 这是“数据与实现资产层”

此外，配置中还有一个关键声明：
- `plugins.slots.memory = working-memory-core`

这说明从 OpenClaw 配置层面，working-memory 已经被声明为 memory slot 的承接者。

---

## 风险（如果不全局看）
如果只盯 `memory/working-memory/`：
- 会漏掉真正的插件入口
- 会漏掉 `runtime/` 下的并行/镜像实现
- 会误判哪些文件是真主链路，哪些只是脚本或数据副本
- 可能错误清理掉对 recall/ingest 真正生效的文件

---

## 当前初步架构判断
### A. 插件桥接层
`.openclaw/extensions/working-memory-core/index.mjs`
- 真正接住 OpenClaw memory slot
- 对外伪装成 memory_search / memory_get 兼容接口
- 内部调用 `memory/working-memory/cli.mjs` 做 recall

### B. 运行时主逻辑层
`runtime/*.mjs`
- 决定 ingest、recall、hybrid、replay、rerank 等主逻辑
- 更像“当前实际算法中心”

### C. 数据/资产层
`memory/working-memory/*`
- store/schema/diagnostics/scripts
- 是长期沉淀和调试资产中心

### D. 配置主控层
`C:\Users\1\.openclaw\openclaw.json`
- `plugins.slots.memory = working-memory-core`
- 这是主链路归属的最高配置声明之一

---

## 对问题 1 的修复启示
“扶正分层记忆为唯一主中枢”不能只改一个目录，而必须按 **全局触点** 修：

1. **入口统一**：插件桥接层
2. **逻辑统一**：runtime 主逻辑层
3. **数据统一**：working-memory store/schema
4. **配置统一**：memory slot 与 fallback 策略

也就是说，问题 1 不是文件夹整理问题，而是 **分布式主链路收口问题**。

---

## 下一步必做
1. 继续列出“哪些文件是真主链路，哪些是镜像/历史副本/辅助脚本”
2. 画出当前 recall 与 ingest 的真实调用链
3. 基于调用链决定：
   - 哪些保留为主实现
   - 哪些降级为辅助资产
   - 哪些可能存在重复实现，需要后续收口
