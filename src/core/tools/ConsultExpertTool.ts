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
		let message = `你现在是以下专家角色：\n\n<expert_domain>${domain}</expert_domain>\n
${outputFormat ? `<output_format>${outputFormat}</output_format>` : ""}
<email>
<topic>${topic}</topic>
<question>${question}</question>
${attachments ? `<attachments>\n${attachments}\n</attachments>` : ""}
</email>`

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

		// 1. 身份锚定：去“作为”，强调“立足”与“见解”
		todos.push({
			id: crypto.randomUUID(),
			content: `立足${domain}专家视角，展示专业造诣及对${topic}的独到见解`,
			status: "pending",
		})

		// 2. 信息摄入：精简措辞，去冗余
		todos.push({
			id: crypto.randomUUID(),
			content: `研读附件，消化背景信息${attachments ? `（附件：${attachments}）` : ""}`,
			status: "pending",
		})

		// 3. 需求锁定：动词更精准（审视、明确）
		todos.push({
			id: crypto.randomUUID(),
			content: `审视问题：${question}，明确核心诉求`,
			status: "pending",
		})

		// 4. 逻辑推演：拒绝“进行”，强调“推演”
		todos.push({
			id: crypto.randomUUID(),
			content: `结合背景与需求深度推演，呈现分析逻辑`,
			status: "pending",
		})

		// 5. 结果交付：动词归位，去形容词后缀
		todos.push({
			id: crypto.randomUUID(),
			content: `调用 attempt_completion 交付结论：包含摘要、建议及风险提示，严格遵循 <output_format>${outputFormat}</output_format> 格式`,
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
			domain: this.removeClosingTag("domain", domain, block.partial),
			topic: this.removeClosingTag("topic", topic, block.partial),
			question: this.removeClosingTag("question", question, block.partial),
			attachments: this.removeClosingTag("attachments", attachments, block.partial),
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const consultExpertTool = new ConsultExpertTool()
