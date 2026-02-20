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

type ConsultType = "analysis" | "design" | "comparison" | "recommendation"

interface ConsultTypeConfig {
	approach: string[]
	deliverable: string
	todoTemplate: string[]
}

const CONSULT_TYPE_CONFIGS: Record<ConsultType, ConsultTypeConfig> = {
	analysis: {
		approach: [
			"收集相关代码、文档、日志等上下文",
			"识别核心问题和关联因素",
			"深入分析根因，区分表象与本质",
			"评估影响范围和严重程度",
		],
		deliverable: "深度分析报告",
		todoTemplate: ["收集上下文信息", "识别核心问题", "分析根因", "评估影响范围"],
	},
	design: {
		approach: [
			"理解需求和约束条件",
			"调研业界最佳实践和相关模式",
			"设计核心架构和关键接口",
			"考虑扩展性、可维护性、性能等质量属性",
			"识别技术风险和缓解策略",
		],
		deliverable: "架构设计方案",
		todoTemplate: ["理解需求和约束", "调研最佳实践", "设计核心架构", "评估质量属性"],
	},
	comparison: {
		approach: [
			"明确对比维度和评估标准",
			"收集各方案的客观数据",
			"逐维度进行公正对比",
			"分析各方案的适用场景",
			"给出基于场景的推荐",
		],
		deliverable: "方案对比评估",
		todoTemplate: ["明确对比维度", "收集方案数据", "逐维度对比", "分析适用场景"],
	},
	recommendation: {
		approach: [
			"理解当前状态和目标状态",
			"识别可行的行动路径",
			"评估各路径的成本和收益",
			"制定具体、可执行的行动步骤",
			"设定验收标准和检查点",
		],
		deliverable: "具体行动建议",
		todoTemplate: ["理解现状和目标", "识别行动路径", "评估成本收益", "制定行动步骤"],
	},
}

interface ConsultExpertParams {
	/**
	 * 专家领域描述
	 * @example "React performance optimization + virtual DOM internals"
	 */
	domain: string

	/**
	 * 问题陈述：当前状态与期望状态之间的差距
	 */
	problemStatement: string

	/**
	 * 不可改变的约束条件
	 */
	constraints: string

	/**
	 * 可选：当前方法或已尝试的方案（可能需要替换）
	 */
	currentApproach?: string | null

	/**
	 * 不确定的决策、风险、权衡
	 */
	uncertainties: string

	/**
	 * 可选:附件 (文件路径或内容)
	 */
	attachments?: string | null

	/**
	 * 咨询类型（必选）
	 */
	consultType: ConsultType
}

export class ConsultExpertTool extends BaseTool<"consult_expert"> {
	readonly name = "consult_expert" as const
	override readonly isDelegationTool = true

	parseLegacy(params: Partial<Record<string, string>>): ConsultExpertParams {
		return {
			domain: params.domain || "",
			problemStatement: params.problemStatement || "",
			constraints: params.constraints || "",
			currentApproach: params.currentApproach,
			uncertainties: params.uncertainties || "",
			attachments: params.attachments,
			consultType: (params.consultType as ConsultType) || "analysis",
		}
	}

	async execute(params: ConsultExpertParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { domain, problemStatement, constraints, currentApproach, uncertainties, attachments, consultType } =
			params
		const { askApproval, handleError, pushToolResult, toolCallId } = callbacks

		// 验证必需参数
		if (!domain) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("consult_expert", "domain"))
			return
		}

		if (!problemStatement) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("consult_expert", "problemStatement"))
			return
		}

		if (!constraints) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("consult_expert", "constraints"))
			return
		}

		if (!uncertainties) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("consult_expert", "uncertainties"))
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
		const taskMessage = this.buildConsultMessage(
			domain,
			problemStatement,
			constraints,
			currentApproach,
			uncertainties,
			consultType,
			attachments,
		)

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
			problemStatement,
			constraints,
			currentApproach: currentApproach ?? null,
			uncertainties,
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
		problemStatement: string,
		constraints: string,
		currentApproach: string | null | undefined,
		uncertainties: string,
		consultType: ConsultType,
		attachments?: string | null,
	): string {
		const config = CONSULT_TYPE_CONFIGS[consultType]

		let message = `<role>
${domain} 领域专家
</role>

<consultation>
问题陈述：${problemStatement}

约束条件：
${constraints}
${currentApproach ? `\n当前方法（可能需要替换）：\n${currentApproach}` : ""}

需要专家判断的不确定点：
${uncertainties}
</consultation>`

		if (attachments) {
			message += `\n\n<attachments>
${attachments}
</attachments>`
		}

		// 根据 consultType 获取差异化的 approach
		message += `\n\n<approach>
${config.approach.map((step) => `- ${step}`).join("\n")}
</approach>`

		// 获取交付物描述
		message += `\n\n<deliverable>
输出格式：${config.deliverable}

完成后使用 attempt_completion 提交。
</deliverable>`

		return message
	}

	private buildTodos(consultType: ConsultType, attachments?: string | null): TodoItem[] {
		const config = CONSULT_TYPE_CONFIGS[consultType]
		const todos: TodoItem[] = []

		// Step 1: 信息获取
		if (attachments) {
			todos.push({
				id: crypto.randomUUID(),
				content: `读取附件：${attachments}`,
				status: "pending",
			})
		}

		// Step 2: 提供退路（符合诚实透明原则）
		todos.push({
			id: crypto.randomUUID(),
			content: "若超出专业范围或信息不足，调用 attempt_completion 说明边界",
			status: "pending",
		})

		// Step 3-N: 根据 consultType 添加差异化的 TODO 模板
		for (const todoContent of config.todoTemplate) {
			todos.push({
				id: crypto.randomUUID(),
				content: todoContent,
				status: "pending",
			})
		}

		// Step N+1: 交付（末端重申质量要求）
		todos.push({
			id: crypto.randomUUID(),
			content: "attempt_completion 提交结果",
			status: "pending",
		})

		return todos
	}

	override async handlePartial(task: Task, block: ToolUse<"consult_expert">): Promise<void> {
		const domain: string | undefined = block.params.domain
		const problemStatement: string | undefined = block.params.problemStatement
		const constraints: string | undefined = block.params.constraints
		const currentApproach: string | undefined = block.params.currentApproach
		const uncertainties: string | undefined = block.params.uncertainties
		const attachments: string | undefined = block.params.attachments
		const consultType: string | undefined = block.params.consultType

		const partialMessage = JSON.stringify({
			tool: "consultExpert",
			domain,
			problemStatement,
			constraints,
			currentApproach,
			uncertainties,
			attachments,
			consultType,
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const consultExpertTool = new ConsultExpertTool()
