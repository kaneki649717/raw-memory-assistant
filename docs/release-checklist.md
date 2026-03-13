# 发布检查清单

在把仓库推到 GitHub 前，按这份清单过一遍。

## 1. 仓库结构

- [x] 已有独立发布父文件夹
- [x] 已抽离核心 runtime 代码
- [x] 已抽离 prompts
- [x] 已抽离 schemas
- [x] 已有 docs 目录
- [x] 已有 examples 示例数据
- [x] 已有 `.gitignore`

## 2. 私有 / 本地数据安全

- [x] 未包含真实 session transcript
- [x] 未包含真实 replay store
- [x] 未包含真实 vector store
- [x] 未包含真实 working memory store
- [x] 未包含 runtime cache
- [x] 仓库文件中未硬编码 API Key
- [ ] 再确认 validation / docs 中没有真实私有内容

## 3. 路径 / 配置解耦

- [x] runtime 不再依赖写死的本地绝对路径
- [x] runtime 不再直接依赖宿主应用配置文件
- [x] 已有 `config.example.json`
- [x] 已改成项目内相对存储路径
- [x] prompt 读取路径已项目内化
- [x] 模型配置已改为项目配置驱动
- [x] TS 的路径逻辑已同步更新
- [x] TS 的 ingest 配置键逻辑已同步更新

## 4. 文档

- [x] README 已有
- [x] 架构文档已完成
- [x] 模块说明已完成
- [x] 数据流文档已完成
- [x] 使用说明已完成
- [x] 路线图已完成
- [x] 解耦说明已完成
- [x] 发布检查清单已完成
- [ ] README 还可以继续做公开版抛光

## 5. 公开可读性

- [ ] 再检查 prompts 的公开表达
- [ ] 再检查 validation / docs 是否保留过多内部研发痕迹
- [ ] 决定哪些开发历史要公开，哪些只保留内部版本
- [ ] 视情况再优化文件命名和术语表达

## 6. 现在能不能推

### 现在推 private repo 可以吗？
**可以，基本没问题。**

### 现在直接推 public repo 可以吗？
**也可以，但最好再做一轮文案抛光。**

## 7. 推荐动作顺序

1. 先打开仓库目录，快速看一遍：
   - `README.md`
   - `docs/usage.md`
   - `docs/decoupling-notes.md`
   - `docs/validation-summary.md`
2. 再确认 validation 历史记录要不要继续公开保留
3. 本地测试时可以把 `config.example.json` 复制为 `config.json`，但不要提交真实密钥
4. 先推到 private GitHub 仓库
5. GitHub 页面效果确认无误后，再改成 public 或另建公开仓库
