import * as vscode from "vscode"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import { TodoItem } from "@roo-code/types"

/**
 * ConsultExpertTool - 咨询专家工具
 *
 * 这是一个"Agent as Tools"架构的封装工具,用于获取专家意见。
 *
 * 内部实现:
 * - 创建一个 expert 模式的子任务
 * - 使用自定义的角色定义
 * - 返回专家意见和建议
 */

interface ConsultExpertParams {
	/**
	 * 专家领域描述
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
	 * 可选:附件 (文件路径或内容)
	 */
	attachments?: string

	/**
	 * 可选:期望的输出格式
	 */
	outputFormat?: "analysis" | "design" | "comparison" | "recommendation"
}

export class ConsultExpertTool extends BaseTool<"consult_expert"> {
	readonly name = "consult_expert" as const

	parseLegacy(params: Partial<Record<string, string>>): ConsultExpertParams {
		return {
			domain: params.domain || "",
			topic: params.topic || "",
			question: params.question || "",
			attachments: params.attachments,
			outputFormat: params.outputFormat as any,
		}
	}

	async execute(params: ConsultExpertParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { domain, topic, question, attachments, outputFormat } = params
		const { askApproval, handleError, pushToolResult, toolCallId } = callbacks

		// 验证必需参数
		if (!domain) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("consult_expert", "domain"))
			return
		}

		if (!topic) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("consult_expert", "topic"))
			return
		}

		if (!question) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("consult_expert", "question"))
			return
		}

		task.consecutiveMistakeCount = 0

		// 构建任务消息
		const taskMessage = this.buildConsultMessage(domain, topic, question, outputFormat, attachments)

		// 获取 Provider
		const provider = task.providerRef.deref()
		if (!provider) {
			pushToolResult(formatResponse.toolError("Provider reference lost"))
			return
		}

		// 创建工具消息用于审批
		const toolMessage = JSON.stringify({
			tool: "consultExpert",
			domain: domain,
			topic: topic,
			question: question,
			attachments: attachments,
			outputFormat: outputFormat,
		})

		// 请求审批
		const didApprove = await askApproval("tool", toolMessage)
		if (!didApprove) {
			pushToolResult(formatResponse.toolDenied())
			return
		}

		const todos = this.buildTodos(domain, topic, question, attachments, outputFormat)

		try {
			// 委派到 expert 模式的子任务
			const child = await (provider as any).delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: taskMessage,
				initialTodos: todos,
				mode: "expert", // 使用专门的 expert 模式
			})

			// 等待子任务完成并返回结果
			pushToolResult(`已创建专家咨询子任务 ${child.taskId}, 正在分析...`)

			// 注意: 这里我们不等待子任务完成,因为父任务会被暂停
			// 子任务完成后会通过 reopenParentFromDelegation 恢复父任务
		} catch (error: any) {
			await handleError("creating expert consultation subtask", error)
		}
	}

	private buildConsultMessage(
		domain: string,
		topic: string,
		question: string,
		outputFormat?: string,
		attachments?: string,
	): string {
		// 清晰明确的任务要求
		let message = `<role>
${domain} 领域专家
</role>

<consultation>
主题：${topic}

问题：${question}
</consultation>`

		if (attachments) {
			message += `\n\n<attachments>
${attachments}
</attachments>`
		}

		// 专家咨询方法论（归化自 expert 模式 customInstructions）
		message += `\n\n<approach>
- 使用 read_file、search_files、codebase_search 获取上下文
- 提供专家级深度分析，而非表面解释
- 考虑多种方案，讨论各自的权衡
- 主动识别潜在风险和边缘情况
- 使用专业术语，提供代码示例佐证
</approach>`

		// 明确交付物格式
		const formatDesc = outputFormat
			? {
					analysis: "深度分析报告",
					design: "架构设计方案",
					comparison: "方案对比评估",
					recommendation: "具体行动建议",
				}[outputFormat] || outputFormat
			: "结构化专业意见"

		message += `\n\n<deliverable>
输出格式：${formatDesc}

完成后使用 attempt_completion 提交：
- 核心结论
- 支撑分析
- 风险与注意事项
- 后续建议
</deliverable>`

		return message
	}

	private buildTodos(
		domain: string,
		topic: string,
		question: string,
		attachments?: string,
		outputFormat?: string,
	): TodoItem[] {
		const todos: TodoItem[] = []

		// Step 1: 信息获取
		if (attachments) {
			todos.push({
				id: crypto.randomUUID(),
				content: `读取附件：${attachments}`,
				status: "pending",
			})
		}

		// Step 2: 分析问题（注入 question，先想后做）
		todos.push({
			id: crypto.randomUUID(),
			content: `分析咨询问题：${question}`,
			status: "pending",
		})

		// Step 3: 提供退路（符合诚实透明原则）
		todos.push({
			id: crypto.randomUUID(),
			content: "若超出专业范围或信息不足，调用 attempt_completion 说明边界",
			status: "pending",
		})

		// Step 4: 推演
		todos.push({
			id: crypto.randomUUID(),
			content: "基于专业知识推演解决方案",
			status: "pending",
		})

		// Step 5: 交付（末端重申质量要求）
		todos.push({
			id: crypto.randomUUID(),
			content: "attempt_completion 提交：核心结论、支撑分析、风险提示",
			status: "pending",
		})

		return todos
	}
	override async handlePartial(task: Task, block: ToolUse<"consult_expert">): Promise<void> {
		const domain: string | undefined = block.params.domain
		const topic: string | undefined = block.params.topic
		const question: string | undefined = block.params.question
		const attachments: string | undefined = block.params.attachments

		const partialMessage = JSON.stringify({
			tool: "consultExpert",
			domain: domain,
			topic: topic,
			question: question,
			attachments: attachments,
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const consultExpertTool = new ConsultExpertTool()
