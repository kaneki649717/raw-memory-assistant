# 问题 1 角色判定与并轨方案（阶段结论）

## 结论先说
现在可以做出一个明确判定：

### 应该扶正为唯一主 runtime 的候选
是：
- `C:\Users\1\.openclaw\workspace\runtime\*.mjs`

### 当前被正式接入但更像旧主链 / 旧桥接运行面的
是：
- `C:\Users\1\.openclaw\workspace\memory\working-memory\runtime\*.mjs`

---

## 为什么这样判定
### 1. 同名核心文件几乎全部实质性分叉
已比对的同名核心文件：
- `recall.mjs`
- `ingest.mjs`
- `store.mjs`
- `hybrid-recall.mjs`
- `replay-recall.mjs`
- `rerank.mjs`
- `bundle-rerank.mjs`
- `quality-gate.mjs`

全部 hash 不同。
这说明不是小改动，而是两套已经明显分叉的实现。

### 2. 根部 runtime 具备更多“系统化增强模块”
根部 `runtime/` 独有：
- `config.mjs`
- `distilled-facts.mjs`
- `model-alerts.mjs`
- `drain-model-alerts.mjs`
- `send-model-alerts.mjs`
- `benchmark-stage2.mjs`

这些模块说明根部 runtime 已经不只是“另一份实现”，而是更完整的系统化版本。

### 3. 根部 runtime 的配置感知更成熟
根部 `runtime/paths.mjs` 通过 `config.mjs` 动态读取工作区配置，
而 `memory/working-memory/runtime/paths.mjs` 更偏硬编码静态路径。

这代表：
- 根部 runtime 更适合作为长期唯一主实现
- memory/working-memory/runtime 更像早期已接入版本

---

## 当前工程状态的准确描述
### A. 当前“已生效默认链”
插件桥目前默认调用：
- `memory/working-memory/cli.mjs`
- `memory/working-memory/runtime/*.mjs`

### B. 当前“更先进但未正式接管的链”
根部：
- `runtime/*.mjs`

### C. 当前矛盾
**先进实现没有正式接管默认入口。**

这就是问题 1 当前最明确的工程断层。

---

## 并轨方向（推荐）
### 目标
让插件桥最终调用的唯一 runtime，切换到根部：
- `runtime/*.mjs`

### 原则
不是粗暴删除 `memory/working-memory/runtime/`，而是：
1. 先确认根部 runtime 可被 CLI/插件桥稳定调用
2. 再让桥接层切换入口
3. 最后把旧 runtime 降级为迁移兼容层或备份层

---

## 推荐实施路径
### Phase 1：确立唯一 runtime
- 组织上明确：根部 `runtime/*.mjs` 是目标主实现
- `memory/working-memory/runtime/*.mjs` 视为旧运行面

### Phase 2：改造桥接入口
当前：
- 插件桥 → `memory/working-memory/cli.mjs`
- CLI → `./runtime/*.mjs`

建议改为两种方式之一：

#### 方案 A（更稳）
保留 `memory/working-memory/cli.mjs` 作为外壳，
但把其中 import 改为指向根部 `runtime/*.mjs`。

优点：
- 插件配置几乎不用动
- 侵入小
- 更容易回滚

#### 方案 B（更彻底）
新增或替换为根部统一 CLI，再让插件桥直接调用根部入口。

优点：
- 架构更干净
缺点：
- 改动面更大
- 插件桥配置和路径都要一起调整

### 当前推荐：
**优先方案 A**。

---

## 为什么推荐方案 A
因为现在最需要的是：
> 尽快让“真正更强的 runtime”接管默认执行路径

而不是同时大规模重构目录结构。

所以最优动作是：
- **桥接路径尽量不动**
- **内部实际调用切到根部 runtime**

这样能最快完成问题 1 的核心目标：
- 默认生效链和你真正强化的链，终于变成同一条。

---

## 风险控制
切换前需要验证：
1. 根部 runtime 对现有 store 路径兼容
2. 根部 runtime 对 replay/vector/l0/l1 数据格式兼容
3. 根部 runtime 的 ingest / recall CLI 参数契约与旧 CLI 保持一致
4. 切换后 memory_search / memory_get 工具返回结构不变

---

## 问题 1 当前阶段性结论
目前还不能宣布问题 1 已解决。
但已经完成了两个关键判断：

### 已确定
1. 当前默认生效链 = `memory/working-memory/runtime`
2. 目标唯一主实现 = 根部 `runtime/`

### 接下来真正该动手的点
> **把 CLI / 插件桥的内部调用，从旧 runtime 切到根部 runtime。**

只要这一步成功，问题 1 就会从“认知统一”进入“执行统一”。
