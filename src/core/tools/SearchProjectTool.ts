import * as vscode from "vscode"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { Package } from "../../shared/package"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"

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

		// 构建任务消息
		const taskMessage = this.buildSearchMessage(query, scope, schema)

		// 构建自定义指令
		const customInstructions = this.buildAskModeInstructions(schema)

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
				initialTodos: [],
				mode: "ask",
				customInstructions,
			})

			// 等待子任务完成并返回结果
			pushToolResult(`已创建搜索子任务 ${child.taskId}, 正在调查项目...`)

			// 注意: 这里我们不等待子任务完成,因为父任务会被暂停
			// 子任务完成后会通过 reopenParentFromDelegation 恢复父任务
		} catch (error: any) {
			await handleError("creating search project subtask", error)
		}
	}

	private buildSearchMessage(query: string, scope?: SearchProjectParams["scope"], schema?: string): string {
		let message = `你需要调查项目并回答以下问题:\n\n${query}`

		if (scope?.directories) {
			message += `\n\n**搜索范围:** ${scope.directories}`
		}

		if (scope?.filePatterns) {
			message += `\n\n**文件模式:** ${scope.filePatterns}`
		}

		if (scope?.excludes) {
			message += `\n\n**排除模式:** ${scope.excludes}`
		}

		return message
	}

	private buildAskModeInstructions(schema?: string): string {
		let instructions = `
你在一个只读的调查任务中执行。

**你的工具权限:**
- ✅ read_file
- ✅ search_files
- ✅ list_files
- ✅ codebase_search
- ❌ write_to_file (禁止任何编辑操作)
- ❌ apply_diff (禁止任何编辑操作)
- ❌ searchProject (禁止递归调用)
- ❌ applyEdit (禁止编辑)
- ❌ consultExpert (禁止递归调用)

**你的任务:**
1. 调查项目以回答问题
2. 使用 search_files 和 codebase_search 查找相关代码
3. 使用 read_file 阅读关键文件
4. 使用 list_files 了解项目结构
5. 完成后使用 attempt_completion 返回结果

**输出要求:**
`.trim()

		if (schema) {
			instructions += `
严格按照提供的 schema 格式返回 JSON 数据:
\`\`\`json
${schema}
\`\`\`
`
		} else {
			instructions += `
提供清晰的结构化报告,包含:
- 相关文件列表 (使用文件路径)
- 关键代码片段
- 你的发现和总结
`
		}

		return instructions
	}

	override async handlePartial(task: Task, block: ToolUse<"search_project">): Promise<void> {
		const query: string | undefined = block.params.query
		const scope: string | undefined = block.params.scope
		const schema: string | undefined = block.params.schema

		const partialMessage = JSON.stringify({
			tool: "searchProject",
			query: this.removeClosingTag("query", query, block.partial),
			scope: scope ? JSON.parse(this.removeClosingTag("scope", scope, block.partial)) : undefined,
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const searchProjectTool = new SearchProjectTool()
