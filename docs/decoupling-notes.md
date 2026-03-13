# 解耦说明

这个文件记录了为了公开发布而做过哪些解耦与清理。

## 运行时路径与配置解耦

### 已完成
- [x] 新增 `runtime/config.mjs`，统一做项目内相对路径解析
- [x] 新增 `config.example.json`，作为 embedding / light 模型配置模板
- [x] 将 `runtime/paths.mjs` 改成使用项目内路径和本项目配置
- [x] 将 `runtime/summarize.mjs` 改成通过 `PROMPTS_DIR` 读取 prompt
- [x] 将 `runtime/embedding-model.mjs` 改成从 `config.json` / `AGENT_MEMORY_CONFIG_PATH` 读取配置
- [x] 将 `runtime/light-model.mjs` 改成从 `config.json` / `AGENT_MEMORY_CONFIG_PATH` 读取配置
- [x] 将 `runtime/replay-store.mjs` 改成使用 `REPLAY_STORE_FILE`
- [x] 将 `runtime/vector-store.mjs` 改成使用 `VECTOR_STORE_FILE`
- [x] 降低 `runtime/entity-extractor.mjs` 中的宿主环境假设
- [x] 降低 `runtime/ingest.mjs` 中的宿主配置键假设

### 仍可继续优化
- [ ] 继续改善 TS 源和 runtime 源的一致性
- [ ] 继续检查 prompts 是否还有实验环境语气
- [ ] 继续检查公开文档里是否还残留过多内部研发痕迹
- [ ] README 里还可以再补更细的配置示例和 FAQ

## 配置模型

独立仓库应依赖：
- `config.json`
- `AGENT_MEMORY_CONFIG_PATH`

而不是依赖宿主应用自己的配置文件。

## 环境变量

- `AGENT_MEMORY_CONFIG_PATH`（可选）：指定自定义 `config.json` 路径，默认读取项目根目录下的 `config.json`
- 模型 API Key 应写在 `config.json` 中，不应硬编码到仓库文件里
