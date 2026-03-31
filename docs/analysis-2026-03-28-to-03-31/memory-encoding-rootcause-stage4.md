# 编码问题深挖（阶段结论 4）：L1 第二污染源中的核心根因

## 关键突破
这一步已经把 L1 / summarize / light-model 链中的一个核心根因钉死了：

> **`light-model-empty-content` 的真正原因不是编码，而是 iflow API key 无效。**

通过在 `light-model.mjs` 中加入原始响应调试日志，实际拿到的响应为：

```json
{"status":"434","msg":"Invalid apiKey，get your apiKey: https://iflow.cn/","body":null}
```

随后：
- `choices[0].message.content` 不存在
- `callLightModel()` 抛出 `light-model-empty-content`
- L1 生成失败

---

## 这意味着什么
### 1. `light-model-empty-content` 不是编码错误
而是：
- 凭证/配置错误
- 模型服务没有返回预期 chat completion 结构

### 2. L1 decisionText 中的大量脏内容，很可能不是模型“产乱码”
更可能是下面这条链：
1. light-model 因无效 apiKey 失败
2. `generateL1WithModel()` 失败
3. `maybeCreateDecision()` 走 fallback decision 路径
4. fallback 直接把原始 user/assistant 大段文本塞进 `decisionText`
5. 原始文本中本来就混有历史 `�? / ???? / 长段污染`
6. 再经过 sanitize，形成今天看到的脏 L1

也就是说，第二污染源里的核心问题，并不是“模型把中文变问号”，而更像：
- **模型链失效**
- **fallback 决策写入过于激进**
- **把脏原文直接抬升进 L1**

---

## 当前第二污染源的更精确拆解
### A. 模型链核心故障
- `light-model.mjs` 硬编码使用 iflow/qwen3-max
- 当前 apiKey 无效
- 因而 L1/L0 模型提炼不稳定或直接失效

### B. fallback 写入策略过于宽松
- light-model 失败后，系统仍会创建 fallback decision
- fallback decision 直接截取原始 `combined` 文本写入 `decisionText`
- 这会把历史污染文本、超长原话、控制 UI 元数据一起带进 L1

### C. sanitize 过去还会放大残片问号
- 这部分已开始修复（`sanitizeMemoryText()` 已修掉一个会制造孤儿 `?` 的 bug）

---

## 这对修复优先级的影响
当前第二污染源的修复优先级应调整为：

1. **先处理 light-model 配置/凭证失效**
2. **再收紧 fallback decision 策略**
3. **再继续观察 decisionText 是否还会新增脏内容**

否则就算 sanitize 修好，fallback 仍会继续把大段脏原文注入 L1。

---

## 下一步建议
### 第一优先
检查并修正：
- `memory/working-memory/runtime/light-model.mjs`
- 当前硬编码 iflow apiKey 是否已失效
- 是否应切回可用 provider / 有效 key / 或统一读配置

### 第二优先
在 `ingest.mjs -> maybeCreateDecision()` 里收紧 fallback：
- 当 light-model 失败时，不要默认把整段 `combined.slice(...)` 写成 decisionText
- 至少要加低质量门控，避免把 control-ui 元数据和脏原话抬升进 L1

---

## 当前阶段结论
现在已经可以明确：

> **第二污染源中，light-model 链的首要问题不是编码，而是模型凭证失效；这会触发 fallback decision，而 fallback decision 又在把脏原文持续注入 L1。**

这是当前必须继续打掉的下一核心病灶。