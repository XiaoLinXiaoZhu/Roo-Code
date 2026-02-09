# 新工具接口设计规范

## 1. 工具总览

| 工具名称        | 语义隐喻    | 内部模式 | 主要用途                     |
| --------------- | ----------- | -------- | ---------------------------- |
| `searchProject` | Google 搜索 | ask      | 调查项目、搜索代码、分析结构 |
| `applyEdit`     | 代码编辑器  | code     | 修改代码、创建文件、重构     |
| `consultExpert` | 发邮件咨询  | expert   | 架构设计、技术决策、深度分析 |

### 设计原则

```
┌─────────────────────────────────────────────────────────────┐
│  工具设计三原则                                               │
├─────────────────────────────────────────────────────────────┤
│  1. 语义清晰：工具名称即用途，无需额外解释                       │
│  2. 参数简洁：自然语言优先，避免复杂结构化参数                    │
│  3. 返回一致：统一的结果格式，便于主模型处理                      │
└─────────────────────────────────────────────────────────────┘
```

## 2. searchProject 工具

### 2.1 设计目标

- **封装搜索复杂性**：将文件搜索、代码搜索、语义搜索统一为一个入口
- **只读保证**：该工具绝不会修改任何文件，确保安全性
- **结构化输出**：支持可选的 schema 参数，要求特定格式的返回结果

### 2.2 接口定义

```typescript
interface SearchProjectParams {
	/**
	 * 自然语言查询
	 * @example "找到所有处理用户认证的文件"
	 * @example "项目使用了哪些数据库？"
	 */
	query: string

	/**
	 * 可选：指定搜索范围
	 * @default 整个项目
	 */
	scope?: {
		directories?: string[] // 限制搜索目录
		filePatterns?: string[] // 文件匹配模式 (glob)
		excludes?: string[] // 排除模式
	}

	/**
	 * 可选：结构化返回格式
	 * 当提供 schema 时，结果将按此格式组织
	 */
	schema?: JSONSchema
}

interface SearchProjectResult {
	success: boolean
	summary: string // 简要总结
	findings: Finding[] // 详细发现
	structuredData?: unknown // 如果提供了 schema，返回结构化数据
}
```

### 2.3 使用场景

**场景 1：项目结构调查**

```typescript
await searchProject({
	query: "这个项目的技术栈是什么？使用了哪些主要框架？",
})
// 返回：React + TypeScript + Vite，详细的依赖分析...
```

**场景 2：定位代码位置**

```typescript
await searchProject({
	query: "找到处理用户登录的代码",
	scope: { directories: ["src/auth", "src/api"] },
})
// 返回：相关文件列表和关键代码片段
```

**场景 3：结构化信息提取**

```typescript
await searchProject({
	query: "列出所有 API 端点",
	schema: {
		type: "array",
		items: {
			type: "object",
			properties: {
				method: { type: "string" },
				path: { type: "string" },
				handler: { type: "string" },
			},
		},
	},
})
// 返回：[{ method: "POST", path: "/api/login", handler: "authController.login" }, ...]
```

### 2.4 内部实现映射

```typescript
// 内部实现伪代码
class SearchProjectTool extends BaseTool<"search_project"> {
	async execute(params: SearchProjectParams): Promise<SearchProjectResult> {
		// 1. 构建子任务消息
		const message = this.buildSearchMessage(params)

		// 2. 委派到 ask 模式的子任务
		const result = await this.provider.delegateParentAndOpenChild({
			parentTaskId: this.task.taskId,
			message,
			mode: "ask", // 使用只读模式
			initialTodos: [],
		})

		// 3. 等待子任务完成并解析结果
		const completion = await this.waitForCompletion()

		// 4. 如果有 schema，进行结构化提取
		if (params.schema) {
			return this.extractStructured(completion, params.schema)
		}

		return this.parseResult(completion)
	}
}
```

**工具权限配置**（内部模式：ask）

- ✅ read_file, search_files, list_files, codebase_search
- ✅ execute_command（只读命令）
- ❌ write_to_file, apply_diff（禁止编辑）
- ❌ consultExpert（防止递归）

## 3. applyEdit 工具

### 3.1 设计目标

- **意图驱动**：用自然语言描述修改意图，而非具体的代码差异
- **自动校验**：内部自动进行 Lint/Compile 检查
- **范围限制**：可以限定受影响的文件范围

### 3.2 接口定义

```typescript
interface ApplyEditParams {
	/**
	 * 自然语言编辑指令
	 * @example "把这个函数的错误处理改成 try-catch"
	 * @example "添加类型注解到所有参数"
	 */
	instruction: string

	/**
	 * 可选：限制可编辑的文件
	 * 如果不提供，子任务可以自行决定修改哪些文件
	 */
	files?: string[]

	/**
	 * 可选：上下文信息
	 * 提供额外的背景信息帮助子任务理解
	 */
	context?: string

	/**
	 * 可选：是否运行校验
	 * @default true
	 */
	validate?: boolean
}

interface ApplyEditResult {
	success: boolean
	filesModified: string[] // 实际修改的文件列表
	summary: string // 修改摘要
	validationPassed: boolean // 校验是否通过
	errors?: string[] // 如果有错误
}
```

### 3.3 使用场景

**场景 1：简单修改**

```typescript
await applyEdit({
	instruction: "把按钮的颜色从蓝色改成绿色",
	files: ["src/components/Button.tsx"],
})
```

**场景 2：Bug 修复**

```typescript
await applyEdit({
	instruction: "修复这个空指针异常，user 可能为 null",
	context: "报错信息：Cannot read property 'name' of null at UserProfile.tsx:42",
})
```

**场景 3：批量重构**

```typescript
await applyEdit({
	instruction: "把所有 class 组件改写成函数式组件",
	files: ["src/components/*.tsx"],
	validate: true,
})
```

**场景 4：新功能开发**

```typescript
await applyEdit({
	instruction: "创建一个新的 React 组件：UserAvatar，显示用户头像，支持不同尺寸",
	context: "参考现有的 Button 组件风格",
})
```

### 3.4 内部实现映射

```typescript
class ApplyEditTool extends BaseTool<"apply_edit"> {
  async execute(params: ApplyEditParams): Promise<ApplyEditResult> {
    // 1. 构建编辑任务消息
    const message = this.buildEditMessage(params)

    // 2. 委派到 code 模式的子任务
    await this.provider.delegateParentAndOpenChild({
      parentTaskId: this.task.taskId,
      message,
      mode: "code",  // 完整编辑能力
      initialTodos: this.buildTodos(params)
    })

    // 3. 等待子任务完成
    const completion = await this.waitForCompletion()

    // 4. 可选：进行校验
    if (params.validate !== false) {
      const validation = await this.runValidation()
      if (!validation.passed) {
        return { success: false, errors: validation.errors, ... }
      }
    }

    return this.parseResult(completion)
  }
}
```

**工具权限配置**（内部模式：code）

- ✅ read_file, write_to_file, apply_diff（完整编辑）
- ✅ execute_command（测试、校验）
- ✅ search_files, list_files（代码导航）
- ❌ consultExpert（防止递归）
- ❌ searchProject（防止递归）

## 4. consultExpert 工具

### 4.1 设计目标

- **深度思考**：用于需要复杂推理、架构设计的任务
- **领域专家**：通过 domain 参数指定需要哪方面的专业知识
- **文档产出**：输出结构化的分析报告或设计方案

### 4.2 接口定义

```typescript
interface ConsultExpertParams {
	/**
	 * 专家领域描述
	 * 用于构建子任务的系统提示词
	 * @example "UI/UX 设计、用户体验专家"
	 * @example "后端架构、分布式系统设计"
	 */
	domain: string

	/**
	 * 咨询主题/问题
	 */
	topic: string

	/**
	 * 详细问题描述
	 */
	question: string

	/**
	 * 可选：附件（文件路径或内容）
	 */
	attachments?: string[]

	/**
	 * 可选：期望的输出格式
	 */
	outputFormat?: "analysis" | "design" | "comparison" | "recommendation"
}

interface ConsultExpertResult {
	success: boolean
	opinion: string // 专家意见摘要
	analysis?: string // 详细分析
	recommendations: string[] // 具体建议列表
	caveats?: string[] // 注意事项/风险点
}
```

### 4.3 使用场景

**场景 1：架构设计**

```typescript
await consultExpert({
	domain: "后端架构、微服务设计、数据库设计",
	topic: "用户认证系统设计",
	question: "我需要设计一个支持多租户的用户认证系统，应该如何设计？",
	outputFormat: "design",
})
```

**场景 2：技术选型**

```typescript
await consultExpert({
	domain: "前端框架、性能优化",
	topic: "状态管理方案选择",
	question: "Redux vs Zustand vs Jotai，对于中大型应用应该选择哪个？",
	outputFormat: "comparison",
})
```

**场景 3：代码审查**

```typescript
await consultExpert({
	domain: "代码质量、安全审计",
	topic: "安全漏洞检查",
	question: "请审查这个认证模块的安全性",
	attachments: ["src/auth/login.ts", "src/auth/session.ts"],
})
```

**场景 4：性能优化建议**

```typescript
await consultExpert({
	domain: "性能优化、数据库调优",
	topic: "查询性能优化",
	question: "这个 SQL 查询很慢，如何优化？",
	attachments: ["slow-query.sql"],
	outputFormat: "recommendation",
})
```

### 4.4 内部实现映射

```typescript
class ConsultExpertTool extends BaseTool<"consult_expert"> {
	async execute(params: ConsultExpertParams): Promise<ConsultExpertResult> {
		// 1. 根据 domain 构建专家角色提示词
		const expertPrompt = this.buildExpertPrompt(params.domain)

		// 2. 构建咨询消息
		const message = this.buildConsultMessage(params)

		// 3. 委派到 expert 模式的子任务
		await this.provider.delegateParentAndOpenChild({
			parentTaskId: this.task.taskId,
			message,
			mode: "expert", // 自定义的 expert 模式
			initialTodos: [],
			// 关键：传递 expert 的角色定义
			modeOverrides: {
				roleDefinition: expertPrompt,
			},
		})

		// 4. 等待并解析结果
		const completion = await this.waitForCompletion()
		return this.parseExpertOpinion(completion, params.outputFormat)
	}

	private buildExpertPrompt(domain: string): string {
		return `你是一位 ${domain} 领域的赅深专家。
你的角色是提供专业、深思熟虑的建议。
请基于你的专业知识，给出全面、实用的分析和建议。`
	}
}
```

**工具权限配置**（内部模式：expert）

- ✅ read_file, search_files, list_files（了解上下文）
- ✅ execute_command（只读操作）
- ✅ searchProject（调查项目）
- ❌ write_to_file, apply_diff（禁止编辑）
- ❌ consultExpert（防止递归）
- ❌ applyEdit（防止递归）

## 5. 统一返回格式

所有新工具共享统一的基础返回结构：

```typescript
interface ToolResult {
	/**
	 * 执行是否成功
	 */
	success: boolean

	/**
	 * 简要摘要（一句话）
	 * 主模型可以直接展示给用户
	 */
	summary: string

	/**
	 * 错误信息（当 success=false 时）
	 */
	error?: {
		code: string
		message: string
		recoverable: boolean // 是否可重试
	}

	/**
	 * 操作统计
	 */
	stats?: {
		tokensUsed: number
		durationMs: number
	}
}

// 各工具的结果继承基础结构
interface SearchProjectResult extends ToolResult {
	findings: Finding[]
	structuredData?: unknown
}

interface ApplyEditResult extends ToolResult {
	filesModified: string[]
	validationPassed: boolean
}

interface ConsultExpertResult extends ToolResult {
	opinion: string
	recommendations: string[]
}
```

## 6. 错误处理规范

### 6.1 错误类型

| 错误码              | 含义         | 可重试 | 处理方式                   |
| ------------------- | ------------ | ------ | -------------------------- |
| `TIMEOUT`           | 子任务超时   | ✅     | 可以简化请求后重试         |
| `VALIDATION_FAILED` | 代码校验失败 | ✅     | 返回错误信息，让主模型决定 |
| `PERMISSION_DENIED` | 操作被拒绝   | ❌     | 告知主模型此操作不可行     |
| `FILE_NOT_FOUND`    | 文件不存在   | ❌     | 告知主模型检查路径         |
| `INTERNAL_ERROR`    | 内部错误     | ✅     | 记录日志，建议重试         |

### 6.2 错误传递策略

```typescript
// 子任务失败时，不会抛出异常，而是返回错误结果
async function executeToolWithErrorHandling(tool: ToolAgent, params: unknown): Promise<ToolResult> {
	try {
		return await tool.execute(params)
	} catch (error) {
		return {
			success: false,
			summary: `操作失败: ${error.message}`,
			error: {
				code: classifyError(error),
				message: error.message,
				recoverable: isRecoverable(error),
			},
		}
	}
}
```

### 6.3 主模型错误处理指导

系统提示词应包含如何处理工具错误的指导：

```markdown
当工具返回错误时：

- 如果 `recoverable: true`，可以尝试重新调用或调整参数
- 如果 `recoverable: false`，应该向用户解释原因并请求指导
- 不要反复重试相同的失败操作
```

## 7. 工具组合模式

### 7.1 常见组合模式

**模式 1：调查-编辑 (Explore-Edit)**

```typescript
// 先调查，再编辑
const info = await searchProject({ query: "找到用户认证相关代码" })
const result = await applyEdit({
	instruction: "添加 JWT 令牌验证",
	files: info.findings.map((f) => f.path),
})
```

**模式 2：咨询-实施 (Consult-Implement)**

```typescript
// 先咨询专家，再实施方案
const design = await consultExpert({
	domain: "数据库设计",
	topic: "用户表结构",
	question: "如何设计支持多租户的用户表？",
})
const result = await applyEdit({
	instruction: `根据以下设计创建 migration：${design.opinion}`,
	context: design.recommendations.join("\n"),
})
```

**模式 3：多步调查 (Multi-Search)**

```typescript
// 并行多个调查
const [frontend, backend, database] = await Promise.all([
	searchProject({ query: "前端组件结构" }),
	searchProject({ query: "API 接口定义" }),
	searchProject({ query: "数据库模型定义" }),
])
```

### 7.2 组合限制

| 调用方        | 可调用        | 不可调用（防止递归）         |
| ------------- | ------------- | ---------------------------- |
| 主模型        | 全部          | -                            |
| searchProject | searchProject | applyEdit, consultExpert     |
| applyEdit     | -             | searchProject, consultExpert |
| consultExpert | searchProject | applyEdit, consultExpert     |

### 7.3 v2.0 并行子任务设想

未来版本可能支持真正的并行子任务：

```typescript
// v2.0 设想：并行执行多个编辑
await Promise.all([
	applyEdit({ instruction: "修复前端 bug", files: ["src/App.tsx"] }),
	applyEdit({ instruction: "修复后端 bug", files: ["src/api/handler.ts"] }),
])
```

> 注意：v1.0 版本中，所有工具调用都是串行执行的，因为底层仍使用单一活动任务约束。

---

下一篇：[02-boundaries.md](./02-boundaries.md) - 边界处理与模糊定义
