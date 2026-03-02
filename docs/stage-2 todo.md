# Stage 2 TODO

> 基于 Stage 1 反思的后续工作计划。

---

## 1. Intent Tree 开关

**目标**：在模型设置中增加 Intent Tree 开关，默认关闭。关闭后隐藏所有 intent tree 相关工具和提示注入。

**参考**：类似 todo list 的开关机制。

- [ ] 在模型设置中添加 `enableIntentTree` 开关（默认 `false`）
- [ ] 关闭时：从工具列表中移除 intent tree 系列工具（add/update/prune/commit/restructure）
- [ ] 关闭时：从 environment 中移除 `<intent_tree>` 注入
- [ ] 前端设置 UI 适配

---

## 2. Reminder 工具

**目标**：增加 `reminder` 工具，替代 sprite-hint 的提醒功能。在模型设置中增加开关，默认开启。

**参考**：`docs/better-tools/reminder.ts`

- [ ] 实现 `ReminderTool`：agent 为自己设置延迟提醒，内容在 N 轮后作为 user message 注入
- [ ] 只保留最新一条 reminder（覆盖旧的）
- [ ] 工具描述引导：分解任务为 OKR 后创建 reminder，reminder 触发时必须设置新 reminder
- [ ] 前端 ChatRow 渲染适配
- [ ] 在模型设置中添加 `enableReminder` 开关（默认 `true`）

---

## 3. 移除 Sprite-Hint 机制

**目标**：移除 sprite-hint 相关机制，其提醒作用被 reminder 工具替代，工程上效果甚微。

- [ ] 移除 `getSpriteHint.ts` / `getContextualSpriteHint` 及相关代码
- [ ] 移除 environment 中的 `<spirit_hint>` 注入
- [ ] 清理相关测试文件
- [ ] 清理相关类型定义和引用

---

## 4. 统一 Write 工具

**目标**：将 `edit` 和 `write_to_file` 合并为统一的 `write` 工具。

**参考**：`docs/better-tools/write.ts`

- [ ] 实现统一的 `write` 工具：
    - `search` 为空/省略 → 完整文件写入（原 `write_to_file`）
    - `search` 有值 → 搜索替换（原 `edit`）
    - `expectedMatches` 参数断言匹配数量，不匹配则报错
- [ ] 移除原 `edit` 工具和 `write_to_file` 工具
- [ ] 更新工具解析器和前端渲染
- [ ] 更新系统提示词中的工具引用

---

## 5. Execute Command 改名

**目标**：将 `execute_command` 改名为 `exec`，名称更简洁，容易调用。

- [ ] 工具名 `execute_command` → `exec`
- [ ] 更新工具描述、实现、解析器、UI 全部同步
- [ ] 更新系统提示词和所有引用点

---

## 6. 完全移除 Environment 机制

**目标**：移除整个 `getEnvironmentDetails` 注入机制，解决 environment 作为 user message 打断 Interleaved Thinking 链路的问题。

**背景**：当前 environment details 作为 user message 的 text block 注入，每次都会打断支持 Interleaved Thinking 的模型（如 GLM-4.7/5）的 reasoning 链路，导致累积的 `reasoning_content` 被清除。

**移除内容**：

- [ ] `<vscode>` — 可见文件和打开的标签页
- [ ] `<git>` — Git 状态
- [ ] `<workspace>` — 工作区文件树
- [ ] `<terminals>` — 终端状态和输出
- [ ] `<recently_modified>` — 最近修改的文件
- [ ] 移除 `getEnvironmentDetails.ts` 及相关调用链
- [ ] 移除 `Task.ts` 中 environment 注入逻辑

**替代方案**：

- 终端异步输出：指导模型将后台命令输出重定向到临时文件（`cmd > tmp.log 2>&1 &`），需要时通过 `exec` 主动读取（`tail -50 tmp.log`）
- 首条消息的项目信息：考虑通过系统提示词或其他方式提供

**注意**：Reminder 工具产生的 user block 是刻意设计——定时清空累积的 thinking，促使模型反思和重新思考，不受此项影响。
