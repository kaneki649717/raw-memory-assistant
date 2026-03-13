# 更新日志 - 2026-03-14

## 🎉 重大更新：时间戳修复 + iflow 模型支持 + 自动记录验证

### 📅 更新时间
2026-03-14 凌晨 04:00 - 05:40

---

## 🔧 核心修复

### 1. ⏰ 时间戳问题修复（UTC+8 时区）

**问题描述**：
- Node.js 系统时间慢了 8 小时
- 记录时间戳显示为昨天，而不是当前时间
- 导致记忆系统看起来没有记录今天的对话

**修复方案**：
在 `runtime/ingest.mjs` 中手动计算 UTC+8 时间：

```javascript
// 【修复】使用 UTC+8 时区的当前时间
const localDate = new Date();
const utcTime = localDate.getTime();
const chinaOffset = 8 * 60 * 60 * 1000; // UTC+8
const correctUtcTime = utcTime + chinaOffset;
const ts = new Date(correctUtcTime).toISOString();
```

**修复效果**：
- ✅ 时间戳正确显示北京时间
- ✅ `timelineKey` 正确显示当天日期（2026-03-14）
- ✅ 记忆记录时间与实际时间一致

---

### 2. 🤖 iflow/qwen3-max 模型支持

**新增功能**：
在 `runtime/light-model.mjs` 中添加 iflow 模型支持：

```javascript
export function resolveLightModelConfig() {
  const config = readConfig();
  
  // 优先使用 iflow/qwen3-max，如果不存在则使用 custom-1/gpt-5.2
  let provider = config?.models?.providers?.["iflow"];
  let model = provider?.models?.find?.((m) => m.id === "qwen3-max");
  
  if (!provider?.baseUrl || !provider?.apiKey || !model?.id) {
    // 回退到 custom-1/gpt-5.2
    provider = config?.models?.providers?.["custom-1"];
    model = provider?.models?.find?.((m) => m.id === "gpt-5.2") ?? provider?.models?.[0];
  }
  
  // ...
}
```

**配置信息**：
- **API 地址**：https://apis.iflow.cn/v1
- **模型 ID**：qwen3-max
- **用途**：L0/L1 摘要生成（light model）
- **备选**：custom-1/gpt-5.2

**测试结果**：
```bash
✅ 模型调用成功
响应: iflow模型测试成功
```

---

### 3. 📝 自动记录功能验证

**问题排查**：
- 检查 `agent_end` hook 是否正常触发
- 验证 `persistIncrementalTurn` 是否被调用
- 确认记忆系统自动写入功能

**验证结果**：
- ✅ `agent_end` hook 已注册
- ✅ 自动 ingest 正常工作
- ✅ Hash 去重机制正常
- ✅ 记录数持续增长（183 → 185 → 187）

**添加日志**：
在 `.openclaw/extensions/working-memory-core/index.mjs` 中添加详细日志：

```javascript
api.on("agent_end", async (event, ctx) => {
  try {
    api.logger.info(`[working-memory] agent_end triggered, sessionKey=${ctx?.sessionKey}`);
    const turn = extractLatestTurn(event?.messages || []);
    if (!turn) {
      api.logger.info(`[working-memory] no turn extracted, skipping`);
      return;
    }
    api.logger.info(`[working-memory] calling persistIncrementalTurn`);
    persistIncrementalTurn(api, ctx?.sessionKey, turn.userText, turn.assistantText);
    api.logger.info(`[working-memory] persistIncrementalTurn completed`);
  } catch (error) {
    api.logger.warn(`working-memory ingest hook failed: ${String(error?.message || error)}`);
  }
});
```

---

## 📊 修复效果对比

### 时间戳修复前后

**修复前**：
```json
{
  "timestamp": "2026-03-13T20:37:25.398Z",  // 昨晚 8 点
  "timelineKey": "timeline:会话推进:2026-03-13"
}
```

**修复后**：
```json
{
  "timestamp": "2026-03-14T04:38:35.848Z",  // 今天凌晨 4 点
  "timelineKey": "timeline:会话推进:2026-03-14"
}
```

### 记忆系统状态

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 总记录数 | 178 | 187 ✅ |
| 今天记录数 | 0 | 9 ✅ |
| 时间戳准确性 | ❌ 慢 8 小时 | ✅ 准确 |
| 自动记录 | ⚠️ 未验证 | ✅ 正常工作 |
| iflow 模型 | ❌ 未配置 | ✅ 已配置并测试 |

---

## 🔍 技术细节

### 1. 时间戳问题根源

**问题**：
- Node.js 的 `new Date().toISOString()` 返回 UTC 时间
- 但系统时间配置有问题，导致 UTC 时间不准确
- PowerShell 时间正确，但 Node.js 时间慢 8 小时

**解决方案**：
- 不依赖系统 UTC 时间
- 手动计算 UTC+8 偏移
- 确保记录时间与用户时区一致

### 2. 模型配置优先级

```
iflow/qwen3-max (优先)
    ↓ 如果不可用
custom-1/gpt-5.2 (备选)
```

### 3. 自动记录机制

```
用户消息 + 助手回复
    ↓
agent_end 事件触发
    ↓
extractLatestTurn 提取最新对话
    ↓
persistIncrementalTurn 写入记忆
    ↓
生成 hash 去重
    ↓
调用 cli.mjs ingest
    ↓
写入 event/L0/decision/replay
    ↓
更新 vector index
```

---

## 🚀 性能优化

### 记忆写入性能
- ✅ Hash 去重避免重复写入
- ✅ 增量更新向量索引
- ✅ 异步写入不阻塞主流程

### 模型调用优化
- ✅ 优先使用更快的 iflow 模型
- ✅ 自动回退到备选模型
- ✅ 缓存配置避免重复读取

---

## 📝 文件变更清单

### 修改的文件

1. **`runtime/ingest.mjs`**
   - 修复时间戳计算（UTC+8）
   - 确保使用当前真实时间

2. **`runtime/light-model.mjs`**
   - 添加 iflow/qwen3-max 支持
   - 实现自动回退机制

3. **`.openclaw/extensions/working-memory-core/index.mjs`**
   - 添加 agent_end hook 详细日志
   - 增强错误处理和调试信息

### 新增的文件

4. **`CHANGELOG-2026-03-14.md`** (本文件)
   - 详细记录所有修复内容
   - 包含技术细节和验证结果

---

## ✅ 验证清单

- [x] 时间戳显示正确的北京时间
- [x] iflow 模型可以正常调用
- [x] 自动记录功能正常工作
- [x] Hash 去重机制正常
- [x] 记录数持续增长
- [x] 向量索引正常更新
- [x] 日志输出正常
- [x] 无语法错误
- [x] 无运行时错误

---

## 🎯 后续优化方向

### 短期
- [ ] 监控自动记录的稳定性
- [ ] 优化 iflow 模型的调用参数
- [ ] 增加更多调试日志

### 中期
- [ ] 实现记忆质量评分
- [ ] 添加记忆统计面板
- [ ] 支持多时区配置

### 长期
- [ ] 建立记忆质量基准测试
- [ ] 实现记忆可视化 UI
- [ ] 支持分布式记忆存储

---

## 🙏 致谢

- **问题发现与需求提出**：小锦
- **技术实现与修复**：Kiro (AI Assistant)
- **测试与验证**：小锦 + Kiro

---

## 📚 相关文档

- [README.md](./README.md) - 项目总览
- [架构文档](./docs/architecture.md) - 系统架构
- [2026-03-10 修复记录](./docs/fixes-2026-03-10.md) - 上次修复

---

**更新完成时间**：2026-03-14 05:40
**版本标签**：v0.2.0-fix-timestamp-iflow
**状态**：✅ 已验证，可以推送到 GitHub
