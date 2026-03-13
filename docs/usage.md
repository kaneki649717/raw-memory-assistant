# 使用说明

## 1. 准备配置文件

把 `config.example.json` 复制成 `config.json`，然后填入你自己的模型配置。

示例：

```json
{
  "storage": {
    "root": "./data"
  },
  "models": {
    "embedding": {
      "baseUrl": "https://你的 embedding 接口地址",
      "apiKey": "你的 API Key",
      "model": "你的 embedding 模型名"
    },
    "light": {
      "baseUrl": "https://你的 chat 接口地址",
      "apiKey": "你的 API Key",
      "model": "你的轻量模型名"
    }
  }
}
```

你也可以通过环境变量指定自定义配置路径：

```bash
AGENT_MEMORY_CONFIG_PATH=./config.json
```

## 2. 独立运行方式

### 写入一轮对话

```bash
node cli.mjs ingest demo-session "我们决定采用 L0/L1/L2 分层记忆。" "好的，再配合 hybrid retrieval 和 rerank。"
```

这一步会尝试：
- 创建 event
- 创建 L0 项
- 按需创建 decision
- 保存 replay 文本
- 更新向量索引

### 召回记忆

```bash
node cli.mjs recall 分层记忆架构
```

返回内容通常包括：
- 意图判断
- contextPack
- bundle

### 单独做 hybrid 检索

```bash
node cli.mjs hybrid rerank recall 架构
```

### 回放原话

```bash
node cli.mjs replay 原话 分层记忆
```

### 重建向量索引

```bash
node cli.mjs reindex
```

## 3. 接入 OpenClaw 的推荐方式

### 方案一：外部调用接入
最推荐先这样做。

#### 对话后写入
在 OpenClaw 完成一轮 user / assistant 对话后，调用：
- `ingest`

把这一轮写入：
- event
- L0
- decision
- replay
- vector index

#### 回答前召回
在模型正式回答前，先根据用户 query 调用：
- `recall`

拿到：
- 相关短摘要
- 相关历史决策
- 相关事件时间线
- 必要时的原话证据

再把这些内容整理成 context pack，注入当前回答上下文。

### 方案二：做成更深的 memory 插件层
这种方式更进一步。

也就是把这套记忆系统接到 OpenClaw 的内部记忆链路中，让它成为更正式的：
- memory 扩展层
- recall 增强层
- 或结构化记忆层

更适合后续深度集成，但一开始建议先从方案一开始。

## 4. 插件是什么意思

这里说的“插件”，可以理解成：

> 给 OpenClaw 额外插上的一个功能模块。

如果你的这套项目被作为 memory 插件来使用，它干的事情就是：

- 在写入时：保存 event / decision / L0 / replay
- 在读取时：做 recall / rerank / context pack
- 在需要时：回放原话证据

也就是说，它的作用不是简单替代聊天上下文，而是：

> 给 OpenClaw 提供更强、更分层、更可控的记忆能力。

## 数据默认保存位置

默认情况下，运行时数据会写到：

```text
./data/store/
```

包含：
- `working-memory-store.json`
- `working-memory-l0.json`
- `replay-store.json`
- `vector-store.json`

## 补充说明

这个仓库目前仍然处于“从本地实验版抽离成独立公开项目”的阶段。

如果你想进一步看：
- 更完整原理：`docs/architecture.md`
- 模块职责：`docs/module-map.md`
- 发布前检查：`docs/release-checklist.md`
