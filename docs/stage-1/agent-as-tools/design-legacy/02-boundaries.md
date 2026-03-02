# 边界处理与模糊定义

## 1. 工具选择边界

### 1.1 核心问题

主模型在面对任务时，如何决定应该使用哪个工具？

```
┌─────────────────────────────────────────────────────────────┐
│  任务类型决策矩阵                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   需要修改代码？                                              │
│      ├── 是 → applyEdit                                     │
│      └── 否 → 需要深度分析？                                  │
│                 ├── 是 → consultExpert                      │
│                 └── 否 → searchProject                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 模糊场景定义

| 场景                               | 表面需求  | 实际工具                      | 理由                     |
| ---------------------------------- | --------- | ----------------------------- | ------------------------ |
| "帮我看看这个代码有什么问题"       | 分析代码  | `searchProject`               | 只需阅读分析，不需要修改 |
| "帮我改一下这个代码"               | 修改代码  | `applyEdit`                   | 明确需要修改             |
| "这个架构设计有问题吗？"           | 评估设计  | `consultExpert`               | 需要深度分析和专业意见   |
| "找到所有用到这个函数的地方并更新" | 查找+修改 | `searchProject` → `applyEdit` | 组合使用                 |

### 1.3 工具选择提示词

```markdown
## 工具选择指南

选择工具时遵循以下优先级：

1. **如果任务涉及修改、创建、删除文件**
   → 使用 `applyEdit`

2. **如果任务涉及架构设计、技术决策、深度分析**
   → 使用 `consultExpert`

3. **如果任务涉及查找、理解、调查**
   → 使用 `searchProject`

4. **如果不确定**
   → 先使用 `searchProject` 了解情况，再决定下一步
```

## 2. 递归调用防护

### 2.1 问题场景

如果不加限制，可能出现：

```
Main Agent
  └── consultExpert("...")           // 正常
        └── consultExpert("...")       // ❗ 递归
              └── consultExpert("...") // ❗ 无限递归
                    └── ...
```

### 2.2 防护策略

**策略 1：工具权限矩阵**

| 执行环境           | searchProject | applyEdit | consultExpert |
| ------------------ | ------------- | --------- | ------------- |
| Main Agent         | ✅            | ✅        | ✅            |
| searchProject 内部 | ✅            | ❌        | ❌            |
| applyEdit 内部     | ❌            | ❌        | ❌            |
| consultExpert 内部 | ✅            | ❌        | ❌            |

**策略 2：深度限制**

```typescript
interface ToolContext {
	depth: number // 当前调用深度
	maxDepth: number // 最大允许深度
	parentTool?: string // 父工具名称
}

function validateToolCall(tool: string, context: ToolContext): boolean {
	// 深度检查
	if (context.depth >= context.maxDepth) {
		throw new Error(`工具调用深度超限 (max: ${context.maxDepth})`)
	}

	// 递归检查
	if (context.parentTool === tool) {
		throw new Error(`禁止递归调用工具: ${tool}`)
	}

	return true
}
```

**策略 3：系统提示词明确禁止**

在子任务的系统提示词中明确声明：

```markdown
❗ 重要限制：

- 你在一个子任务中执行
- 禁止调用: consultExpert, applyEdit
- 只能使用基础工具: read_file, search_files, list_files
```

## 3. 文件操作边界

### 3.1 范围限制

**问题**：当用户说"改一下这个文件"时，子任务应该只修改这个文件，还是可以修改相关文件？

**解决方案**：

```typescript
interface ApplyEditParams {
	instruction: string
	files?: string[] // 可选，明确限制
	allowRelatedFiles?: boolean // 是否允许修改相关文件
}
```

**行为定义**：

| files 参数 | allowRelatedFiles | 行为                             |
| ---------- | ----------------- | -------------------------------- |
| 指定       | false (default)   | 严格限制在指定文件               |
| 指定       | true              | 可以修改相关文件，但优先指定文件 |
| 未指定     | -                 | 子任务自行决定（谨慎模式）       |

### 3.2 安全边界

```typescript
const PROTECTED_PATHS = [".git/**", "node_modules/**", "*.lock", ".env*"]

const SENSITIVE_PATTERNS = [/password/i, /secret/i, /api_key/i]

function validateFileAccess(path: string, operation: "read" | "write"): boolean {
	// 保护路径检查
	if (PROTECTED_PATHS.some((p) => minimatch(path, p))) {
		if (operation === "write") {
			throw new Error(`禁止写入受保护路径: ${path}`)
		}
	}
	return true
}
```

## 4. 上下文传递边界

### 4.1 上下文窗口问题

**问题**：主模型的上下文应该传递多少给子任务？

```
主模型对话历史 (10000 tokens)
     │
     │  传递多少？
     ▼
子任务上下文 (?? tokens)
```

### 4.2 上下文传递策略

**策略：最小必要上下文**

```typescript
interface ContextForSubtask {
	// 必须传递
	instruction: string // 工具参数中的指令
	targetFiles?: string[] // 目标文件

	// 可选传递
	userContext?: string // 工具参数中的 context

	// 不传递
	// - 主模型的完整对话历史
	// - 之前工具调用的结果
	// - 用户的个人信息
}
```

**理由**：

- 减少 token 消耗
- 保持子任务的专注性
- 避免信息泄露

### 4.3 结果返回策略

**策略：结构化摘要**

```typescript
interface SubtaskResult {
	// 必须返回
	success: boolean
	summary: string // 一句话摘要

	// 可选返回
	details?: string // 详细信息（按需）
	filesAffected?: string[] // 影响的文件

	// 不返回
	// - 子任务的完整对话历史
	// - 中间思考过程
}
```

## 5. 超时与中断处理

### 5.1 超时策略

```typescript
interface TimeoutConfig {
	searchProject: {
		default: 60_000 // 60秒
		max: 120_000 // 2分钟
	}
	applyEdit: {
		default: 180_000 // 3分钟
		max: 600_000 // 10分钟（复杂重构）
	}
	consultExpert: {
		default: 120_000 // 2分钟
		max: 300_000 // 5分钟
	}
}
```

### 5.2 超时行为

```typescript
async function executeWithTimeout<T>(tool: () => Promise<T>, timeout: number): Promise<ToolResult<T>> {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), timeout)

	try {
		const result = await tool()
		return { success: true, data: result }
	} catch (error) {
		if (error.name === "AbortError") {
			return {
				success: false,
				error: {
					code: "TIMEOUT",
					message: `操作超时 (${timeout}ms)`,
					recoverable: true,
					suggestion: "可以尝试简化请求或分解为多个小任务",
				},
			}
		}
		throw error
	} finally {
		clearTimeout(timeoutId)
	}
}
```

### 5.3 用户中断处理

```typescript
// 用户可以随时中断子任务
class ToolExecutor {
	private abortController: AbortController

	async execute(tool: string, params: unknown): Promise<ToolResult> {
		this.abortController = new AbortController()

		// 监听用户中断信号
		this.onUserInterrupt(() => {
			this.abortController.abort()
		})

		try {
			return await this.runTool(tool, params, this.abortController.signal)
		} catch (error) {
			if (error.name === "AbortError") {
				return {
					success: false,
					summary: "操作被用户中断",
					error: { code: "USER_CANCELLED", recoverable: false },
				}
			}
			throw error
		}
	}
}
```

### 5.4 中断后的状态恢复

| 工具          | 中断后状态     | 恢复策略              |
| ------------- | -------------- | --------------------- |
| searchProject | 无副作用       | 直接丢弃，可重试      |
| applyEdit     | 可能有部分修改 | 提示用户检查 git diff |
| consultExpert | 无副作用       | 直接丢弃，可重试      |

## 6. 模糊场景决策树

### 6.1 完整决策流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户请求                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  是否需要修改文件？     │
                └───────────┬───────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
             是                          否
              │                           │
              ▼                           ▼
    ┌─────────────────┐       ┌───────────────────────┐
    │ 修改范围明确吗？  │       │  需要专业深度分析吗？  │
    └────────┬────────┘       └───────────┬───────────┘
             │                            │
    ┌────────┴────────┐          ┌────────┴────────┐
    │                 │          │                 │
   是                否         是                否
    │                 │          │                 │
    ▼                 ▼          ▼                 ▼
┌────────┐    ┌────────────┐ ┌────────────┐  ┌────────────┐
│applyEdi│    │searchProj  │ │consultExpe │  │searchProj  │
│t(files)│    │ect → 判断  │ │rt          │  │ect         │
└────────┘    └────────────┘ └────────────┘  └────────────┘
```

## 7. 边界案例清单

### 7.1 已识别的边界案例

| ID  | 场景                             | 期望行为         | 处理方式                      |
| --- | -------------------------------- | ---------------- | ----------------------------- |
| E01 | 用户请求同时涉及搜索和编辑       | 先搜索，后编辑   | 主模型分两步调用              |
| E02 | applyEdit 执行中发现需要更多信息 | 子任务内部搜索   | applyEdit 内部可用 read_file  |
| E03 | consultExpert 建议需要修改代码   | 返回建议，不执行 | expert 模式禁止编辑工具       |
| E04 | 用户中断后想继续                 | 提供恢复选项     | 保存 checkpoint               |
| E05 | 子任务输出超长                   | 截断并摘要       | 返回 summary + truncated 标记 |
| E06 | 指定的文件不存在                 | 明确报错         | 返回 FILE_NOT_FOUND           |
| E07 | 子任务尝试调用被禁止的工具       | 静默忽略或报错   | 工具过滤层拦截                |
| E08 | 多个文件修改部分成功             | 报告部分成功     | 返回 partial success 状态     |

### 7.2 未决边界问题

以下问题需要在实现过程中进一步明确：

```markdown
### 🔶 待讨论

1. **子任务的 token 预算**

    - 每个子任务应该有独立的 token 限制吗？
    - 如何在主模型和子任务之间分配总预算？
        > 不用考虑token预算问题。

2. **并行调用的隔离性**（v2.0）

    - 如果两个 applyEdit 并行修改同一文件会怎样？
    - 是否需要文件级别的锁？
        > 目前不考虑并行调用。仅仅完成串行调用。

3. **子任务的用户交互**

    - 子任务是否可以向用户提问？
    - 还是必须在信息不足时直接返回错误？
        > 子任务不允许直接与用户交互。所有交互均通过主模型进行。
        > 在信息不足时应当使用 attempt_completion 上交具体情况。

4. **跨工具的事务性**

    - searchProject → applyEdit 的组合中，如果 applyEdit 失败
    - 是否需要提供"撤销"能力？
        > 是的，使用现有记录点机制。

5. **敏感操作确认**
    - 子任务执行危险操作（如删除文件）时
    - 是否需要主模型再次确认？
        > 不需要。因为有4. 可以使用记录点回滚。
```

### 7.3 边界测试用例

```typescript
describe("边界案例测试", () => {
	test("E01: 搜索+编辑组合", async () => {
		// 用户: "找到所有使用 deprecated API 的地方并更新"
		// 期望: 主模型先调用 searchProject，再调用 applyEdit
	})

	test("E03: consultExpert 不应执行编辑", async () => {
		const result = await consultExpert({
			domain: "代码审查",
			question: "这个函数有问题，帮我改一下",
		})
		// 期望: 返回建议，但不执行任何文件修改
		expect(result.filesModified).toBeUndefined()
	})

	test("E07: 禁止的工具调用", async () => {
		// 在 searchProject 内部尝试调用 applyEdit
		// 期望: 被工具过滤层拦截
	})
})
```

---

下一篇：[03-migration-plan.md](./03-migration-plan.md) - 从旧架构的迁移计划
