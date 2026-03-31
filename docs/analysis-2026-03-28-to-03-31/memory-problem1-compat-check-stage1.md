# 问题 1 切换前兼容校验（阶段记录）

## 当前进展
已经对“切到根部 runtime 前要不要先校验兼容”做了第一轮检查，结论是：

> **必须先做 store 健康检查 / 数据兼容检查，再切。**

---

## 为什么必须先查 store 健康
### 1. 现有 store 已暴露出内容污染迹象
在当前 working-memory store 的可见内容中，已经出现明显乱码残片，例如：
- `已确认方�?`
- `已记�?`
- `已调�?`

这说明至少部分历史数据存在：
- 编码污染
- 写入过程不干净
- 或旧实现生成内容不稳定

### 2. 现有 JSON 读取链对某些文件并不稳
在 PowerShell 直接解析 store 时，已经出现某个 JSON 无法顺利按预期结构读取的情况。
这不一定代表 JSON 整体损坏，但至少说明：
- 数据健康不能默认没问题
- 切换前需要专门体检

---

## 对两套 runtime 的进一步兼容判断
### 根部 runtime 在存储层更稳健
已看到根部 runtime 在 replay/vector store 方面具备更好的工程特性：
- 更稳的 atomic write
- 更明确的 normalize
- 更强的异常回退
- 更高版本痕迹（v2 方向更明显）

这进一步支持：
> **根部 runtime 更适合扶正为唯一主 runtime。**

### 但这不等于可以直接切
因为如果底层 store 已有污染数据，切过去只是：
- 用更强 runtime 去消费脏数据
- 而不是解决污染本身

---

## 当前结论
问题 1 的切换前检查，新增一个必须项：

### P1-Compat-5：store 健康检查
需要确认：
1. `working-memory-store.json` 可正常解析
2. `working-memory-l0.json` 可正常解析
3. `replay-store.json` 可正常解析
4. `vector-store.json` 可正常解析
5. 是否存在 replacement char / 编码污染
6. 顶层结构是否符合新 runtime 预期
7. 核心字段是否齐全（events / decisions / items / createdAt / timestamp / ids 等）

---

## 现在的总判断
切换动作顺序应该是：
1. 先确认根部 runtime 是唯一目标主实现
2. 再确认 store 数据能被安全接管
3. 最后才切 CLI / 插件桥到根部 runtime

不能跳过第 2 步。

---

## 下一步
下一步直接做：
- store 健康检查脚本化
- 逐个文件确认是否可解析、是否有乱码污染、是否需要迁移/清洗

只有过了这一步，问题 1 才适合进入真正的桥接切换。