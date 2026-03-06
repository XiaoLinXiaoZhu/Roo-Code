# 工具参数类型安全审计报告

> 日期: 2026-03-06
> 触发原因: `read_media` 工具的 `focus_x`/`focus_y` 参数因 snake_case/camelCase 不匹配而永远不生效

## 已修复的问题

### 根因

`NativeToolArgs`（snake_case）与各工具本地 `Params` 接口（camelCase）之间**没有编译期约束**，完全靠开发者手动保持一致。TypeScript 未能捕获是因为：

1. `BaseTool.handle()` 中 `block.nativeArgs as ToolParams<TName>` 使用 `as` 断言绕过类型检查
2. `BaseTool.execute()` 用 method syntax 声明，TypeScript 对方法参数是 bivariant 的，子类可用任意参数类型覆盖

### 修复的 6 个工具（9 个不匹配属性）

| 工具                    | 不匹配属性                                               |
| ----------------------- | -------------------------------------------------------- |
| `ReadMediaTool`         | `focus_x`→`focusX`, `focus_y`→`focusY`                   |
| `BuildToolTool`         | `input_hint`→`inputHint`, `output_hint`→`outputHint`     |
| `AddIntentTool`         | `parent_id`→`parentId`                                   |
| `SearchProjectTool`     | `scope.file_patterns`→`scope.filePatterns`               |
| `CommitIntentTool`      | `node_id`→`nodeId`                                       |
| `RestructureIntentTool` | `node_id`, `new_parent_id`, `node_ids`, `common_content` |

修复方式：删除本地 Params 接口，`execute` 签名改为 `ToolParams<TName>`，通过解构重命名访问 snake_case 字段。

## 待处理的问题

### 1. AttemptCompletionTool 遗留属性（低优先级）

`AttemptCompletionParams` 有多余的 `command?: string`，但 `NativeToolArgs["attempt_completion"]` 只有 `{ result: string }`。这是 XML 协议时代的遗留，native 协议下 `command` 永远是 `undefined`。

### 2. 结构性风险：26 个工具仍用本地 Params 接口（低优先级）

目前属性名全部一致，但本地接口与 `NativeToolArgs` 之间没有编译期约束。未来修改任何一方都可能再次出现不匹配。

**建议的彻底修复方案（按优先级）：**

- **方案 A（推荐）**：所有工具统一改为 `ToolParams<TName>`，消除本地接口
- **方案 B（更彻底）**：在方案 A 基础上，将 `BaseTool.execute` 从 method syntax 改为 property syntax（箭头函数），启用 `strictFunctionTypes` 对参数类型的逆变检查，从根本上防止子类用不兼容的参数类型覆盖

### 3. ReminderTool 类型微差异（可忽略）

`ReminderParams.delay` 类型为 `number | null`，`NativeToolArgs` 中为 `number`。不影响运行时行为。
