# AST 分析支持 - 实现踩坑记录

## 问题：`go_to_definition` 和 `find_references` 工具调用失败

### 错误信息

```
Invalid tool call for 'go_to_definition': missing nativeArgs.
This usually means the model streamed invalid or incomplete arguments and the call could not be finalized.
```

### 问题根源

添加新的原生工具时，需要在**多个位置**进行注册，缺一不可：

| 位置                        | 文件                                                      | 作用                              |
| --------------------------- | --------------------------------------------------------- | --------------------------------- |
| ✅ Schema 定义              | `src/core/prompts/tools/native-tools/go_to_definition.ts` | 告诉模型工具的参数格式            |
| ✅ 类型定义                 | `src/shared/tools.ts` 中的 `NativeToolArgs`               | TypeScript 类型安全               |
| ✅ 执行实现                 | `src/core/tools/GoToDefinitionTool.ts`                    | 实际执行逻辑                      |
| ❌ **parseToolCall**        | `src/core/assistant-message/NativeToolCallParser.ts`      | **解析模型输出，构造 nativeArgs** |
| ❌ **createPartialToolUse** | `src/core/assistant-message/NativeToolCallParser.ts`      | **流式场景下的部分参数解析**      |

**遗漏了最后两个位置**，导致模型调用工具时 `nativeArgs` 为 `undefined`，触发错误。

### 修复方案

在 `NativeToolCallParser.ts` 中添加两个 case：

#### 1. `parseToolCall()` 函数（用于最终工具调用）

```typescript
case "go_to_definition":
    if (args.purpose !== undefined && args.path !== undefined && args.symbol !== undefined) {
        nativeArgs = {
            purpose: args.purpose,
            path: args.path,
            symbol: args.symbol,
            surrounding_code: args.surrounding_code,
            start_line: args.start_line,
        } as NativeArgsFor<TName>
    }
    break

case "find_references":
    if (args.purpose !== undefined && args.path !== undefined && args.symbol !== undefined) {
        nativeArgs = {
            purpose: args.purpose,
            path: args.path,
            symbol: args.symbol,
            surrounding_code: args.surrounding_code,
            start_line: args.start_line,
            include_declaration: args.include_declaration,
            max_results: args.max_results,
        } as NativeArgsFor<TName>
    }
    break
```

#### 2. `createPartialToolUse()` 函数（用于流式场景）

```typescript
case "go_to_definition":
    if (
        partialArgs.purpose !== undefined ||
        partialArgs.path !== undefined ||
        partialArgs.symbol !== undefined
    ) {
        nativeArgs = {
            purpose: partialArgs.purpose,
            path: partialArgs.path,
            symbol: partialArgs.symbol,
            surrounding_code: partialArgs.surrounding_code,
            start_line: partialArgs.start_line,
        }
    }
    break

case "find_references":
    if (
        partialArgs.purpose !== undefined ||
        partialArgs.path !== undefined ||
        partialArgs.symbol !== undefined
    ) {
        nativeArgs = {
            purpose: partialArgs.purpose,
            path: partialArgs.path,
            symbol: partialArgs.symbol,
            surrounding_code: partialArgs.surrounding_code,
            start_line: partialArgs.start_line,
            include_declaration: partialArgs.include_declaration,
            max_results: partialArgs.max_results,
        }
    }
    break
```

### 关键区别

| 函数                   | 条件判断                        | 用途                 |
| ---------------------- | ------------------------------- | -------------------- |
| `parseToolCall`        | 使用 `&&`（所有必需参数都存在） | 最终执行，必须完整   |
| `createPartialToolUse` | 使用 `\|\|`（任一参数存在即可） | 流式展示，允许不完整 |

### 教训

**添加新的原生工具时的 Checklist**：

1. [ ] `src/core/prompts/tools/native-tools/` - 添加 schema 定义
2. [ ] `src/core/prompts/tools/native-tools/index.ts` - 导出 schema
3. [ ] `src/shared/tools.ts` - 在 `NativeToolArgs` 中添加类型
4. [ ] `src/core/tools/` - 添加工具执行实现
5. [ ] **`src/core/assistant-message/NativeToolCallParser.ts`** - 在 `parseToolCall()` 中添加 case
6. [ ] **`src/core/assistant-message/NativeToolCallParser.ts`** - 在 `createPartialToolUse()` 中添加 case
7. [ ] **`src/core/auto-approval/tools.ts`** - 将工具添加到对应的自动批准组（见下文）

---

## 问题：工具不属于自动批准组

### 错误现象

工具可以正常调用，但即使用户开启了"自动批准只读操作"，每次调用仍然需要用户确认。

### 问题根源

自动批准机制基于 `ClineSayTool.tool` 字段值来判断，而不是直接基于 native tool name。

需要在 `src/core/auto-approval/tools.ts` 中将工具添加到对应的组：

| 组     | 函数                     | 对应设置              |
| ------ | ------------------------ | --------------------- |
| 只读组 | `isReadOnlyToolAction()` | `alwaysAllowReadOnly` |
| 写入组 | `isWriteToolAction()`    | `alwaysAllowWrite`    |

### 修复方案

对于 `go_to_definition` 和 `find_references`，它们是只读操作，应该添加到 `isReadOnlyToolAction()` 的列表中：

```typescript
// src/core/auto-approval/tools.ts
export function isReadOnlyToolAction(tool: ClineSayTool): boolean {
	return [
		"readFile",
		"listFiles",
		"listFilesTopLevel",
		"listFilesRecursive",
		"searchFiles",
		"codebaseSearch",
		"runSlashCommand",
		"goToDefinition", // 新增
		"findReferences", // 新增
	].includes(tool.tool)
}
```

### 注意事项

1. **`ClineSayTool.tool` 值**：这个值在工具执行实现中定义（如 `GoToDefinitionTool.ts` 中的 `tool: "goToDefinition"`），必须与 `packages/types/src/vscode-extension-host.ts` 中的 `ClineSayTool` 类型定义一致。

2. **类型定义**：如果 `ClineSayTool.tool` 类型中没有你的工具名，需要先在 `packages/types/src/vscode-extension-host.ts` 中添加。

### 更新后的 Checklist

**添加新的原生工具时的完整 Checklist**：

1. [ ] `src/core/prompts/tools/native-tools/` - 添加 schema 定义
2. [ ] `src/core/prompts/tools/native-tools/index.ts` - 导出 schema
3. [ ] `src/shared/tools.ts` - 在 `NativeToolArgs` 中添加类型
4. [ ] `packages/types/src/vscode-extension-host.ts` - 在 `ClineSayTool.tool` 类型中添加工具名
5. [ ] `src/core/tools/` - 添加工具执行实现（使用正确的 `tool` 值）
6. [ ] `src/core/assistant-message/NativeToolCallParser.ts` - 在 `parseToolCall()` 中添加 case
7. [ ] `src/core/assistant-message/NativeToolCallParser.ts` - 在 `createPartialToolUse()` 中添加 case
8. [ ] `src/core/auto-approval/tools.ts` - 将工具添加到对应的自动批准组
