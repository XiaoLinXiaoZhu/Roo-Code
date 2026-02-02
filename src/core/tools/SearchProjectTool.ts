import * as vscode from "vscode"

import type { TodoItem } from "@roo-code/types"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import { getSearchProjectCache } from "./SearchProjectCache"

// crypto for UUID generation
const crypto = globalThis.crypto

/**
 * SearchProjectTool - 搜索项目工具
 *
 * 这是一个"Agent as Tools"架构的封装工具,它将子任务委派机制
 * 包装成一个简单的工具接口。主模型无需理解委派、状态管理等概念,
 * 只需要调用这个工具并提供自然语言查询即可。
 *
 * 内部实现:
 * - 创建一个 ask 模式的子任务
 * - 等待子任务完成
 * - 返回结构化的搜索结果
 */

interface SearchProjectParams {
	/**
	 * 自然语言查询
	 * @example "找到所有处理用户认证的文件"
	 * @example "项目使用了哪些数据库？"
	 */
	query: string

	/**
	 * 可选:指定搜索范围
	 */
	scope?: {
		/**
		 * 限制搜索目录
		 */
		directories?: string

		/**
		 * 文件匹配模式 (glob)
		 */
		filePatterns?: string

		/**
		 * 排除模式
		 */
		excludes?: string
	}

	/**
	 * 可选:结构化返回格式
	 * 当提供 schema 时,结果将按此格式组织
	 */
	schema?: string
}

export class SearchProjectTool extends BaseTool<"search_project"> {
	readonly name = "search_project" as const
	override readonly isDelegationTool = true

	parseLegacy(params: Partial<Record<string, string>>): SearchProjectParams {
		return {
			query: params.query || "",
			scope: params.scope ? JSON.parse(params.scope) : undefined,
			schema: params.schema,
		}
	}

	async execute(params: SearchProjectParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { query, scope, schema } = params
		const { askApproval, handleError, pushToolResult, toolCallId } = callbacks

		// 验证必需参数
		if (!query) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("search_project", "query"))
			return
		}

		task.consecutiveMistakeCount = 0

		// 构建任务消息（包含完整的任务要求，含缓存提示）
		const taskMessage = await this.buildSearchMessage(query, scope, schema)

		// 构建 SOP 步骤（含缓存检查步骤）
		const todos = await this.buildTodos(query, scope, schema)

		// 获取 Provider
		const provider = task.providerRef.deref()
		if (!provider) {
			pushToolResult(formatResponse.toolError("Provider reference lost"))
			return
		}

		// 创建工具消息用于审批
		const toolMessage = JSON.stringify({
			tool: "searchProject",
			query: query,
			scope: scope,
		})

		// 请求审批
		const didApprove = await askApproval("tool", toolMessage)
		if (!didApprove) {
			pushToolResult(formatResponse.toolDenied())
			return
		}

		try {
			// 委派到 ask 模式的子任务
			const child = await (provider as any).delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: taskMessage,
				initialTodos: todos,
				mode: "ask",
			})

			// 等待子任务完成并返回结果
			pushToolResult(`已创建搜索子任务 ${child.taskId}, 正在调查项目...`)

			// 注意: 这里我们不等待子任务完成,因为父任务会被暂停
			// 子任务完成后会通过 reopenParentFromDelegation 恢复父任务
		} catch (error: any) {
			await handleError("creating search project subtask", error)
		}
	}

	private async buildSearchMessage(
		query: string,
		scope?: SearchProjectParams["scope"],
		schema?: string,
	): Promise<string> {
		// 清晰明确的任务要求
		let message = `<task>
调查项目：${query}
</task>

<constraint>
只读调查，禁止任何编辑操作
</constraint>

<approach>
- 使用 codebase_search 和 search_files 定位相关代码
- 使用 read_file 深入阅读关键文件
- 彻底回答问题，不遗漏重要细节
- 适当时使用 Mermaid 图表辅助说明
</approach>`

		if (scope?.directories || scope?.filePatterns || scope?.excludes) {
			message += `\n\n<scope>`
			if (scope.directories) {
				message += `\n目录范围：${scope.directories}`
			}
			if (scope.filePatterns) {
				message += `\n文件模式：${scope.filePatterns}`
			}
			if (scope.excludes) {
				message += `\n排除：${scope.excludes}`
			}
			message += `\n</scope>`
		}

		// 注入缓存提示（如果有可用缓存）
		const cache = getSearchProjectCache()
		if (cache) {
			try {
				const cacheHint = await cache.generateCacheHint()
				if (cacheHint) {
					message += `\n\n<cache_hint>
${cacheHint}
</cache_hint>`
				}
			} catch {
				// 缓存读取失败，忽略
			}
		}

		// 明确交付物格式
		if (schema) {
			message += `\n\n<deliverable>
按以下 schema 返回 JSON：
\`\`\`json
${schema}
\`\`\`
</deliverable>`
		} else {
			message += `\n\n<deliverable>
完成后使用 attempt_completion 提交：
- 相关文件列表
- 关键代码片段
- 发现与结论
</deliverable>`
		}

		return message
	}

	private async buildTodos(
		query: string,
		scope?: SearchProjectParams["scope"],
		schema?: string,
	): Promise<TodoItem[]> {
		const todos: TodoItem[] = []

		// Step 0: 检查缓存（新增）
		const cache = getSearchProjectCache()
		let hasCacheHint = false
		if (cache) {
			try {
				const cacheHint = await cache.generateCacheHint()
				hasCacheHint = !!cacheHint
			} catch {
				// 忽略
			}
		}

		if (hasCacheHint) {
			todos.push({
				id: crypto.randomUUID(),
				content: "检查 <cache_hint> 中的可用缓存，判断是否可复用",
				status: "pending",
			})
		}

		// Step 1: 定位
		if (scope?.directories) {
			todos.push({
				id: crypto.randomUUID(),
				content: `在 ${scope.directories} 范围内搜索`,
				status: "pending",
			})
		} else {
			todos.push({
				id: crypto.randomUUID(),
				content: "使用 codebase_search 定位相关代码",
				status: "pending",
			})
		}

		// Step 2: 分析查询（注入 query，先想后做）
		todos.push({
			id: crypto.randomUUID(),
			content: `分析调查目标：${query}`,
			status: "pending",
		})

		// Step 3: 提供退路（符合诚实透明原则）
		todos.push({
			id: crypto.randomUUID(),
			content: "若无法找到相关信息，调用 attempt_completion 说明搜索结果",
			status: "pending",
		})

		// Step 4: 深入阅读
		todos.push({
			id: crypto.randomUUID(),
			content: "read_file 阅读关键文件",
			status: "pending",
		})

		// Step 5: 整理结论
		todos.push({
			id: crypto.randomUUID(),
			content: "整理发现并形成结论",
			status: "pending",
		})

		// Step 6: 交付（末端重申质量要求）
		todos.push({
			id: crypto.randomUUID(),
			content: "attempt_completion 提交：相关文件、关键代码、发现与结论",
			status: "pending",
		})

		return todos
	}

	override async handlePartial(task: Task, block: ToolUse<"search_project">): Promise<void> {
		const query: string | undefined = block.params.query
		const scope: string | undefined = block.params.scope
		const schema: string | undefined = block.params.schema

		const partialMessage = JSON.stringify({
			tool: "searchProject",
			query: query,
			scope: scope,
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const searchProjectTool = new SearchProjectTool()
