# 提示词优化 TODOs

## 已完成 ✅

### Spirit v3.0 → v4.0

- [x] Identity 精简为行为锚点（~30 tokens），移除身份声明
- [x] 12 个抽象 behavior tags → 10 个可执行 behaviors（推理链 + 触发条件 + 步骤 + 违规示例）
- [x] 解决 `default_to_action` 与 `goal_discovery` 的冲突（合并为决策树）
- [x] 移除结构图、"Why it matters" 叙事、推导链幻觉语句

### roleDefinition 与 Spirit 职责边界清理

- [x] Spirit identity 不再包含"你是谁"，只说"你怎么做事"
- [x] 所有 7 个 mode 的 roleDefinition 统一为"身份 + 能力范围"格式
- [x] 移除 roleDefinition 中与 Spirit 重复的行为指导

### 工具描述优化（第一轮）

- [x] `go_to_definition` 描述重写：第一句从 "Jump to" 改为 "Find where... is defined"
- [x] `find_references` 描述重写：第一句从 "Find all references using LSP" 改为 "Find all usages of..."
- [x] `execute_command` 描述开头添加反向引导

---

## 待完成 📋

### P0: LSP 工具改名

**目标**：让工具名称匹配模型的思维语言

| 当前名称           | 建议新名称           | 理由                                  |
| ------------------ | -------------------- | ------------------------------------- |
| `go_to_definition` | `find_definition`    | 模型想"查找定义"而非"跳转到定义"      |
| `find_references`  | `find_usages` 或保留 | 当前名称尚可，但 `find_usages` 更直觉 |

**涉及的文件**（需要全部同步修改）：

- `src/core/prompts/tools/native-tools/go_to_definition.ts` — 工具描述
- `src/core/tools/GoToDefinitionTool.ts` — 工具实现
- `src/core/tools/toolRegistry.ts` — 工具注册
- `src/core/task/build-tools.ts` — 工具构建（如果有引用）
- `src/shared/tools.ts` — 共享工具类型（如果有 ToolName 枚举）
- `webview-ui/` — UI 显示（如果工具名出现在 UI 中）
- `packages/types/` — 类型定义（如果有）
- 所有测试文件
- Spirit v4.0 中引用了 `go_to_definition` 的地方

**方法**：用 `find_references` 工具（讽刺地）找到所有引用点，批量替换。

### P1: tool-builder 的 CRITICAL OUTPUT LIMITS

- [ ] 将 "CRITICAL OUTPUT LIMITS" 从 roleDefinition 搬到 `customInstructions`
- 文件：`packages/types/src/mode.ts` tool-builder mode

### P2: 运行时 spirit_hint 改为上下文感知

- [ ] 当前 spirit_hint 是随机选择一条规则注入 `environment_details`
- [ ] 应改为根据当前操作类型（文件修改/调试/搜索等）选择相关的规则提醒
- 需要调查 spirit_hint 的实现位置和注入逻辑

### P3: 笔记同步

- [ ] 将最终的改造结果同步回 `e:/myNote/myNote/提示词设计：spirit？.md`
