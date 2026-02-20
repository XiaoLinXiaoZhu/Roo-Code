import * as vscode from "vscode"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import { TodoItem } from "@roo-code/types"

/**
 * ConsultExpertTool - 咨询专家工具（赋能定位）
 *
 * 用于获取领域知识、方法论、最佳实践和标准。
 * 不做具体问题诊断，而是教模型"如何思考一类问题"。
 *
 * 内部实现:
 * - 创建一个 expert 模式的子任务
 * - 返回领域知识和方法论建议
 */

type ConsultType = "principles" | "best-practices" | "methodology" | "standards"

interface ConsultTypeConfig {
	approach: string[]
	deliverable: string
	todoTemplate: string[]
}

const CONSULT_TYPE_CONFIGS: Record<ConsultType, ConsultTypeConfig> = {
	principles: {
		approach: [
			"识别该领域的核心设计原则和心智模型",
			"解释每个原则背后的 WHY（为什么这样做）",
			"提供原则之间的权衡关系和优先级",
			"给出判断标准：什么时候该用、什么时候不该用",
		],
		deliverable: "设计原则和心智模型",
		todoTemplate: ["识别核心原则", "解释原则背后的 WHY", "说明权衡关系", "给出判断标准"],
	},
	"best-practices": {
		approach: [
			"总结该领域经过验证的最佳实践",
			"列出常见陷阱和反模式（以及为什么它们是错的）",
			"提供实践的适用条件和边界",
			"给出质量检查清单",
		],
		deliverable: "最佳实践和常见陷阱",
		todoTemplate: ["总结最佳实践", "列出常见陷阱", "说明适用条件", "给出检查清单"],
	},
	methodology: {
		approach: [
			"提供结构化的步骤框架",
			"解释每个步骤的目的和产出",
			"说明步骤之间的依赖关系和可选路径",
			"给出每个步骤的完成标准",
		],
		deliverable: "结构化方法论框架",
		todoTemplate: ["提供步骤框架", "解释步骤目的", "说明依赖关系", "给出完成标准"],
	},
	standards: {
		approach: [
			"列出该领域的行业标准和规范",
			"解释标准的核心要求和合规标准",
			"提供质量等级和验收标准",
			"给出常见的不合规情况和修正方法",
		],
		deliverable: "标准规范和验收标准",
		todoTemplate: ["列出行业标准", "解释核心要求", "提供验收标准", "说明常见不合规"],
	},
}

interface ConsultExpertParams {
	/**
	 * 专家领域描述
	 * @example "React performance optimization + virtual DOM internals"
	 */
	domain: string

	/**
	 * 想学习的知识/方法论/最佳实践主题
	 */
	topic: string

	/**
	 * 为什么需要这个知识（背景）
	 */
	context: string

	/**
	 * 可选:附件 (文件路径或内容)
	 */
	attachments?: string | null

	/**
	 * 咨询类型
	 */
	consultType: ConsultType
}

export class ConsultExpertTool extends BaseTool<"consult_expert"> {
	readonly name = "consult_expert" as const
	override readonly isDelegationTool = true

	parseLegacy(params: Partial<Record<string, string>>): ConsultExpertParams {
		return {
			domain: params.domain || "",
			topic: params.topic || "",
			context: params.context || "",
			attachments: params.attachments,
			consultType: (params.consultType as ConsultType) || "best-practices",
		}
	}

	async execute(params: ConsultExpertParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { domain, topic, context, attachments, consultType } = params
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

		if (!context) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("consult_expert", "context"))
			return
		}

		if (!consultType) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("consult_expert", "consultType"))
			return
		}

		task.consecutiveMistakeCount = 0

		// 构建任务消息
		const taskMessage = this.buildConsultMessage(domain, topic, context, consultType, attachments)

		// 获取 Provider
		const provider = task.providerRef.deref()
		if (!provider) {
			pushToolResult(formatResponse.toolError("Provider reference lost"))
			return
		}

		// 创建工具消息用于审批
		const toolMessage = JSON.stringify({
			tool: "consultExpert",
			domain,
			topic,
			context,
			attachments: attachments ?? null,
			consultType,
		})

		// 请求审批
		const didApprove = await askApproval("tool", toolMessage)
		if (!didApprove) {
			pushToolResult(formatResponse.toolDenied())
			return
		}

		const todos = this.buildTodos(consultType, attachments)

		try {
			// 委派到 expert 模式的子任务
			const child = await (provider as any).delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: taskMessage,
				initialTodos: todos,
				mode: "expert",
			})

			pushToolResult(`已创建专家咨询子任务 ${child.taskId}, 正在分析...`)
		} catch (error: any) {
			await handleError("creating expert consultation subtask", error)
		}
	}

	private buildConsultMessage(
		domain: string,
		topic: string,
		context: string,
		consultType: ConsultType,
		attachments?: string | null,
	): string {
		const config = CONSULT_TYPE_CONFIGS[consultType]

		let message = `<role>
${domain} 领域专家
</role>

<consultation>
主题：${topic}

背景：${context}
</consultation>`

		if (attachments) {
			message += `\n\n<attachments>
${attachments}
</attachments>`
		}

		message += `\n\n<approach>
${config.approach.map((step) => `- ${step}`).join("\n")}
</approach>`

		message += `\n\n<deliverable>
输出格式：${config.deliverable}

重要：你的任务是传授知识和方法论，不是解决具体问题。提供可复用的原则和框架，而不是针对特定场景的具体方案。

完成后使用 attempt_completion 提交。
</deliverable>`

		return message
	}

	private buildTodos(consultType: ConsultType, attachments?: string | null): TodoItem[] {
		const config = CONSULT_TYPE_CONFIGS[consultType]
		const todos: TodoItem[] = []

		if (attachments) {
			todos.push({
				id: crypto.randomUUID(),
				content: `读取附件：${attachments}`,
				status: "pending",
			})
		}

		todos.push({
			id: crypto.randomUUID(),
			content: "若超出专业范围或信息不足，调用 attempt_completion 说明边界",
			status: "pending",
		})

		for (const todoContent of config.todoTemplate) {
			todos.push({
				id: crypto.randomUUID(),
				content: todoContent,
				status: "pending",
			})
		}

		todos.push({
			id: crypto.randomUUID(),
			content: "attempt_completion 提交结果",
			status: "pending",
		})

		return todos
	}

	override async handlePartial(task: Task, block: ToolUse<"consult_expert">): Promise<void> {
		const domain: string | undefined = block.params.domain
		const topic: string | undefined = block.params.topic
		const context: string | undefined = block.params.context
		const attachments: string | undefined = block.params.attachments
		const consultType: string | undefined = block.params.consultType

		const partialMessage = JSON.stringify({
			tool: "consultExpert",
			domain,
			topic,
			context,
			attachments,
			consultType,
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const consultExpertTool = new ConsultExpertTool()
