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

### P0: LSP 工具改名 ✅

- [x] `go_to_definition` → `find_definition`（ToolName、工具描述、实现、解析器、UI 全部同步）
- [x] `find_references` → `find_usages`（ToolName、工具描述、实现、解析器、UI 全部同步）
- [x] 文件重命名：`go_to_definition.ts` → `find_definition.ts`，`find_references.ts` → `find_usages.ts`
- [x] 文件重命名：`GoToDefinitionTool.ts` → `FindDefinitionTool.ts`，`FindReferencesTool.ts` → `FindUsagesTool.ts`
- [x] 所有引用点更新（16+ 文件），TypeScript 编译通过，测试通过

### P2: 运行时 spirit_hint 改为上下文感知 ✅

- [x] 调查 spirit_hint 实现位置：`src/core/environment/getSpriteHint.ts`
- [x] 调查注入逻辑：`src/core/environment/getEnvironmentDetails.ts`
- [x] 实现 `HintContext` 接口和 `getContextualSpriteHint()` 函数
- [x] 按主题（certainty/resultOrientation/honesty/efficiency）索引 hints
- [x] 根据上下文信号（consecutiveMistakeCount、lastToolFailed、messageCount、hasRecentlyModifiedFiles）选择主题
- [x] 保留 20% 随机概率避免可预测性
- [x] 修改 `getEnvironmentDetails.ts` 调用点

### P3: 笔记同步 ✅

- [x] 改造结果同步到 `docs/提示词优化.md`

---

## 不适用 ⚠️

### P1: tool-builder 的 CRITICAL OUTPUT LIMITS

- [x] ~~将 "CRITICAL OUTPUT LIMITS" 从 roleDefinition 搬到 `customInstructions`~~
- **状态**: 目标对象不存在——`packages/types/src/mode.ts` 中 tool-builder mode 的 roleDefinition 只有一行简短描述，没有 "CRITICAL OUTPUT LIMITS" 文本。此 TODO 已过时。
