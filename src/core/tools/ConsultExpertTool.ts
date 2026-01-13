import * as vscode from "vscode"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"

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

		// 根据 domain 构建专家角色
		const expertPrompt = this.buildExpertPrompt(domain, outputFormat)

		// 构建任务消息
		const taskMessage = this.buildConsultMessage(topic, question, attachments)

		// 构建自定义指令
		const customInstructions = this.buildExpertModeInstructions(domain, outputFormat)

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
		})

		// 请求审批
		const didApprove = await askApproval("tool", toolMessage)
		if (!didApprove) {
			pushToolResult(formatResponse.toolDenied())
			return
		}

		try {
			// 委派到 expert 模式的子任务
			const child = await (provider as any).delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: taskMessage,
				initialTodos: [],
				mode: "expert", // 使用专门的 expert 模式
				customInstructions,
				modeOverrides: {
					roleDefinition: expertPrompt,
				},
			})

			// 等待子任务完成并返回结果
			pushToolResult(`已创建专家咨询子任务 ${child.taskId}, 正在分析...`)

			// 注意: 这里我们不等待子任务完成,因为父任务会被暂停
			// 子任务完成后会通过 reopenParentFromDelegation 恢复父任务
		} catch (error: any) {
			await handleError("creating expert consultation subtask", error)
		}
	}

	private buildExpertPrompt(domain: string, outputFormat?: string): string {
		let prompt = `你是一位 ${domain} 领域的资深专家。`

		if (outputFormat === "design") {
			prompt += `\n\n你擅长架构设计和技术方案设计。你的输出应该清晰、可执行、考虑周全。`
		} else if (outputFormat === "comparison") {
			prompt += `\n\n你擅长技术方案对比和分析。你的输出应该客观、基于事实、给出明确建议。`
		} else if (outputFormat === "recommendation") {
			prompt += `\n\n你擅长提供实践建议和最佳实践。你的输出应该具体、可操作、有优先级。`
		}

		prompt += `

**你的角色:**
- 基于专业知识提供深思熟虑的建议
- 考虑多种方案和权衡
- 识别潜在风险和注意事项
- 提供清晰、可执行的建议

**你的限制:**
- 不能修改任何文件
- 不能执行任何代码
- 只能进行分析和建议
`.trim()

		return prompt
	}

	private buildConsultMessage(topic: string, question: string, attachments?: string): string {
		let message = `**主题:** ${topic}\n\n**问题:** ${question}`

		if (attachments) {
			message += `\n\n**附件:**\n${attachments}`
		}

		return message
	}

	private buildExpertModeInstructions(domain: string, outputFormat?: string): string {
		const expertRole = this.buildExpertPrompt(domain, outputFormat)

		let instructions = `${expertRole}

**你的工具权限:**
- ✅ read_file
- ✅ search_files
- ✅ list_files
- ✅ codebase_search
- ❌ write_to_file (禁止编辑)
- ❌ apply_diff (禁止编辑)
- ❌ consultExpert (禁止递归)
- ❌ applyEdit (禁止编辑)

**你的任务:**
1. 理解咨询主题和问题
2. 使用 search_files 和 codebase_search 了解相关上下文
3. 基于你的专业领域知识提供深入分析
4. 考虑多种方案,识别风险
5. 使用 attempt_completion 返回你的意见

**输出格式要求:**
- 提供简明的意见摘要
- 列出具体的建议
- 识别注意事项和风险点
`.trim()

		if (outputFormat) {
			instructions += `\n\n**输出格式:** ${outputFormat}`
		}

		return instructions
	}

	override async handlePartial(task: Task, block: ToolUse<"consult_expert">): Promise<void> {
		const domain: string | undefined = block.params.domain
		const topic: string | undefined = block.params.topic
		const question: string | undefined = block.params.question
		const attachments: string | undefined = block.params.attachments

		const partialMessage = JSON.stringify({
			tool: "consultExpert",
			domain: this.removeClosingTag("domain", domain, block.partial),
			topic: this.removeClosingTag("topic", topic, block.partial),
			question: this.removeClosingTag("question", question, block.partial),
			attachments: this.removeClosingTag("attachments", attachments, block.partial),
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const consultExpertTool = new ConsultExpertTool()
