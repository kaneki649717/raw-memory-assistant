# 编码问题深挖（阶段结论 3）：第二污染源开始浮出

## 新确认的关键事实
在第一阶段实改（stdin JSON + dedupe 收紧）之后，继续追 L1 / summarize / light-model 链，已经出现两个非常硬的新线索：

### 线索 1：`callLightModel()` 本身并不稳定
直接对 `memory/working-memory/runtime/light-model.mjs` 做 probe 时，出现：
- `light-model-empty-content`

这说明：
- L1 摘要链不只是“可能编码坏”
- 它本身还存在“模型响应为空/不稳定”的问题

也就是说，decisionText 里的异常，不一定全是编码层单因，也可能包含：
- 模型返回异常
- 响应内容为空
- 后续 fallback / normalize 介入

### 线索 2：`quality-gate.mjs` 的 sanitize 规则本身出现受损迹象
在 runtime 搜索输出里，`quality-gate.mjs` 里原本应负责清理乱码字符的正则，已经出现被错误显示/转坏的迹象，例如：
- `.replace(/?\?/g, "")`
- `.replace(/?/g, "")`

这非常不正常。

正常语义应该是清理：
- `\uFFFD`
- `�?`
- `�`

如果源码文本本身已经在某个环节被污染或错误转写，就意味着：
- sanitize 可能并没有按预期工作
- 它甚至可能错误吞掉正常字符或制造 `?` 链

---

## 这意味着什么
当前“第二污染源”不能再简单描述成：
> 模型链也有问题

而应该更准确地表述为：

> **L1 / summarize / light-model 链本身不稳定，同时 quality-gate / sanitize 这层也可能已经出现源码级编码受损或错误清洗问题。**

这会共同导致：
- `decisionText` 出现 `????`
- `whyText / outcomeText` 出现 `结�? / 设�? / 污�?`
- fallback / normalize 的结果持续不可信

---

## 当前结构判断（更新版）
### 第一污染源（已开始修）
- 插件桥 live ingest 的 argv 文本链

### 第二污染源（已开始浮出）
- `light-model.mjs` 响应不稳定 / 空响应
- `summarize.mjs` 的 L1 提取链依赖这条不稳定输出
- `quality-gate.mjs` 自身可能已有编码受损或错误 sanitize 问题

也就是说，当前系统不是单污染源，而更接近：
- **输入链污染**
- **模型摘要链异常**
- **质量门清洗链可疑**

三者叠加。

---

## 下一步应该怎么打
当前优先级建议：
1. 先把 `quality-gate.mjs` 当作可疑污染文件重点审查
2. 确认文件原文到底是不是已经损坏（不仅是终端显示）
3. 若确认受损，优先修复 sanitize 规则，避免继续错误清洗 decisionText
4. 再继续拆分：
   - `light-model-empty-content` 是 provider 问题、请求体问题，还是响应解析问题

---

## 当前结论状态
还不能说第二污染源已经彻底定案。
但已经可以明确：

> **stdin JSON 改造验证了 argv 是第一污染源之一；而现在正在浮出的第二污染源，是 L1 模型摘要链不稳定，加上 quality-gate 自身也疑似受损。**