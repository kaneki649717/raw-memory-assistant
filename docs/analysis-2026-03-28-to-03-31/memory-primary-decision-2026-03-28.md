# 记忆系统主链路决议（2026-03-28）

## 核心决定
从现在开始，**记忆系统以分层记忆体系为绝对主链路**。

主链路定义为：
- `L0`：导航索引层
- `L1`：结构化决策/事实层
- `L2`：原话证据 / replay 层
- `hybrid recall`
- `replay`
- 后续 `rerank / orchestrator`

官方链路：
- `MEMORY.md`
- `memory/YYYY-MM-DD.md`
- `memory_search / memory_get`
- 官方 SQLite / 向量索引

统一降级为：
- **兼容层**
- **回退层**
- **人类可读镜像层**

不再作为主记忆中枢。

---

## 这意味着什么
### 1. 主写入目标变更
以后“记住”“回忆”“检索”“决策沉淀”的第一归属，默认都以分层记忆为准：
- 需要快速定位 → `L0`
- 需要稳定事实/决策 → `L1`
- 需要原话和证据 → `L2`

### 2. 官方 memory 的角色变更
官方 memory 不再承担主中枢角色，而是承担：
- 面向人类维护的可读摘要
- 老工具兼容
- 主链路失效时的 fallback recall

### 3. recall 优先级变更
统一 recall 顺序改为：
1. `L0/L1/L2 structured recall`
2. `hybrid recall + replay`
3. `rerank / orchestrator`（接入后）
4. 官方 `memory_search / memory_get` 作为回退

### 4. 架构判断标准变更
以后判断“记忆有没有修好”，不再看官方 memory 能不能独立工作，
而看：
- 分层记忆是否能独立承担主召回
- 官方 memory 是否已成功退居兼容层

---

## 问题 1 的新目标（在你的决议下重新定义）
原来的问题 1 是：
> 双轨并存，记忆中枢未统一

现在重新定义为：
> **将分层记忆体系正式扶正为唯一主中枢，并把官方记忆链路降级为兼容/回退层。**

这将成为后续修复的总前提。

---

## 问题 1 的具体修复方向
### P1-1. 统一主入口
所有 recall 请求，逻辑上先经过分层记忆 orchestrator。

### P1-2. 统一主写入
“记住这个”“值得沉淀的决策/偏好/事实/踩坑经验”优先写入 L1/L2，而不是先写官方 Markdown。

### P1-3. 官方链路角色重命名
官方 memory 改为：
- readable mirror
- compatibility search
- fallback evidence source

### P1-4. 主从关系明确
分层记忆 = source of operational truth
官方 memory = readable/compatible shadow

### P1-5. 统一成功标准
只要 recall 仍要先问官方 memory，再补查 L1/L2，就说明还没真正统一。
必须做到：
- 默认先查分层记忆
- 官方链路只在需要时补位

---

## 当前 5 个问题（以分层记忆为主重新排序）
1. **把分层记忆正式扶正为唯一主中枢**
2. **让主写入稳定落到分层记忆，而不是被动补写**
3. **把 working-memory 正式接入主运行时并接管主 recall**
4. **把 transcript 提炼成高质量 episode memory，喂给 L2 / replay**
5. **把官方 Markdown memory 重新定位为镜像/兼容/回退层**

---

## 执行原则
后续所有改造，都遵循下面 3 条：
1. **分层记忆优先，不摇摆**
2. **官方 memory 不删，但退居二线**
3. **每修完一个问题，都要能明确说明：主链路又往分层记忆收口了多少**
