import * as vscode from "vscode"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import { getSearchProjectCache } from "./SearchProjectCache"

const crypto = globalThis.crypto

/**
 * SearchProjectTool - 搜索项目工具
 *
 * Agent as Tools 架构的封装工具，用于调查和分析项目代码。
 * 通过专有系统提示词指导如何通过工具和 LSP 快速分析。
 */

interface SearchProjectParams {
	query: string
	scope?: {
		directories?: string
		filePatterns?: string
		excludes?: string
	}
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
		const { askApproval, handleError, pushToolResult } = callbacks

		if (!query) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("search_project", "query"))
			return
		}

		task.consecutiveMistakeCount = 0

		const provider = task.providerRef.deref()
		if (!provider) {
			pushToolResult(formatResponse.toolError("Provider reference lost"))
			return
		}

		const toolMessage = JSON.stringify({
			tool: "searchProject",
			query,
			scope,
		})

		const didApprove = await askApproval("tool", toolMessage)
		if (!didApprove) {
			pushToolResult(formatResponse.toolDenied())
			return
		}

		const systemPrompt = this.buildSystemPrompt()
		const taskMessage = await this.buildTaskMessage(query, scope, schema)

		try {
			const child = await (provider as any).delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: taskMessage,
				mode: "ask",
				systemPromptOverride: systemPrompt,
			})

			pushToolResult(`已创建搜索子任务 ${child.taskId}, 正在调查项目...`)
		} catch (error: any) {
			await handleError("creating search project subtask", error)
		}
	}
	private buildSystemPrompt(): string {
		return `# 身份

你是一个项目代码分析师。你的职责是通过工具快速、准确地调查项目代码，回答关于项目结构、实现细节和依赖关系的问题。

# 约束

- 只读调查，禁止任何编辑操作
- 不要无止境地调查——当已有足够证据回答问题时，停止搜索并给出结论
- 不要返回未经整理的原始工具输出，必须综合分析后给出结论

# 分析方法

## 优先使用 LSP 导航
- 使用 find_definition 追踪函数/类型的定义
- 使用 find_usages 了解符号的使用范围和影响面
- LSP 导航比文本搜索更精确，不会产生注释或字符串中的误匹配

## 辅助搜索
- 使用 codebase_search 进行语义搜索，定位相关代码区域
- 使用 search_files 进行精确的文本/正则匹配
- 使用 list_files 了解目录结构

## 深入阅读
- 使用 read_file 完整阅读关键文件
- 不要只读片段——理解完整上下文才能给出准确结论

# 失败处理

- 如果查询过于模糊无法定位，通过 attempt_completion 说明需要更具体的问题描述
- 如果在指定范围内找不到相关代码，报告搜索结果为空并建议扩大范围
- 如果相关代码在二进制文件或生成文件中，说明无法分析的原因

# 交付

使用 attempt_completion 提交调查结果：
- 相关文件列表及其作用
- 关键代码片段（引用文件路径和行号）
- 发现与结论
- 适当时使用 Mermaid 图表辅助说明`
	}
	private async buildTaskMessage(
		query: string,
		scope?: SearchProjectParams["scope"],
		schema?: string,
	): Promise<string> {
		let message = `调查问题：${query}`

		if (scope?.directories || scope?.filePatterns || scope?.excludes) {
			message += `\n\n搜索范围：`
			if (scope.directories) {
				message += `\n- 目录：${scope.directories}`
			}
			if (scope.filePatterns) {
				message += `\n- 文件模式：${scope.filePatterns}`
			}
			if (scope.excludes) {
				message += `\n- 排除：${scope.excludes}`
			}
		}

		// 注入缓存提示
		const cache = getSearchProjectCache()
		if (cache) {
			try {
				const cacheHint = await cache.generateCacheHint()
				if (cacheHint) {
					message += `\n\n可用缓存：\n${cacheHint}`
				}
			} catch {
				// 缓存读取失败，忽略
			}
		}

		if (schema) {
			message += `\n\n按以下 schema 返回 JSON：\n\`\`\`json\n${schema}\n\`\`\``
		}

		return message
	}
	override async handlePartial(task: Task, block: ToolUse<"search_project">): Promise<void> {
		const query: string | undefined = block.params.query
		const scope: string | undefined = block.params.scope
		const schema: string | undefined = block.params.schema

		const partialMessage = JSON.stringify({
			tool: "searchProject",
			query,
			scope,
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const searchProjectTool = new SearchProjectTool()
