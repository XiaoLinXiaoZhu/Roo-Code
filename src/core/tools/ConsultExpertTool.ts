import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"

/**
 * ConsultExpertTool - 咨询专家工具（赋能定位）
 *
 * 用于获取领域知识、方法论、最佳实践和标准。
 * 不做具体问题诊断，而是教模型"如何思考一类问题"。
 *
 * 内部实现:
 * - 构建专有系统提示词（邮件场景 + deep-thinking 风格）
 * - 创建一个 expert 模式的子任务
 * - 专家先写入文档，再 attempt_completion 引用文档
 */

type ConsultType = "principles" | "best-practices" | "methodology" | "standards"

interface ConsultExpertParams {
	domain: string
	topic: string
	context: string
	attachments?: string | null
	consult_type: ConsultType
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
			consult_type: (params.consult_type as ConsultType) || "best-practices",
		}
	}

	async execute(params: ConsultExpertParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { domain, topic, context, attachments, consult_type: consultType } = params
		const { askApproval, handleError, pushToolResult } = callbacks

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

		// 构建专有系统提示词
		const systemPrompt = this.buildSystemPrompt(domain, consultType)

		// 构建纯指令消息
		const taskMessage = this.buildTaskMessage(topic, context, attachments)

		try {
			const child = await (provider as any).delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: taskMessage,
				mode: "expert",
				systemPromptOverride: systemPrompt,
			})

			pushToolResult(`已创建专家咨询子任务 ${child.taskId}, 正在分析...`)
		} catch (error: any) {
			await handleError("creating expert consultation subtask", error)
		}
	}

	/**
	 * 构建专有系统提示词
	 *
	 * 设计思路：
	 * - 通过 domain 插槽动态赋予专家身份
	 * - 构建专业邮件来往场景，让模型以回复专业咨询邮件的方式思考
	 * - 按 consultType 注入不同的方法论指导
	 * - 使用 deep-thinking 风格，鼓励 long-cot 推理
	 */
	private buildSystemPrompt(domain: string, consultType: ConsultType): string {
		const typeGuidance = CONSULT_TYPE_GUIDANCE[consultType]

		return `# 身份

你是一位 ${domain} 领域的资深专家顾问。你拥有该领域十年以上的实践经验，曾为多个大型项目提供过技术咨询。

你的角色是 **赋能** —— 传授知识、方法论和心智模型，让咨询者能够独立解决问题。你是导师，不是代劳者。

# 场景

你正在回复一封专业技术咨询邮件。咨询者是一位正在处理实际项目的工程师，他需要你在 ${domain} 领域的专业指导。

作为专家顾问，你的回复应该：
- **深度思考**：不要急于给出答案。先理解咨询者的真实需求，思考问题的本质，然后从第一性原理出发构建回答。
- **结构化表达**：像写一份专业的技术备忘录一样组织你的回复——有清晰的层次、明确的论点、充分的论据。
- **坦诚边界**：如果某个方面超出你的专业范围或信息不足以给出可靠建议，明确说明，而不是勉强回答。

# 方法论指导

${typeGuidance}

# 交付规范

你的回复可能很长且深入。为了防止工具调用超时，请遵循以下流程：

1. **先写入文档**：将你的完整回复写入 \`.roo/expert-output/\` 目录下的 markdown 文件
   - 文件名格式：\`{topic-slug}.md\`（用简短的英文 slug 描述主题）
2. **然后提交引用**：使用 \`attempt_completion\` 提交结果时，在 result 中简要概括要点并引用文档路径

# 反模式（禁止）

- 不要诊断具体 bug 或编写具体实现代码
- 不要给出没有 WHY 的建议（每个建议都要解释原因）
- 不要回避权衡——如果两种方案各有优劣，都要说清楚
- 不要假装确定你不确定的事情`
	}

	/**
	 * 构建纯指令消息（只包含具体问题，不包含行为指导）
	 */
	private buildTaskMessage(topic: string, context: string, attachments?: string | null): string {
		let message = `咨询主题：${topic}

背景：${context}`

		if (attachments) {
			message += `\n\n附件参考：\n${attachments}`
		}

		return message
	}

	override async handlePartial(task: Task, block: ToolUse<"consult_expert">): Promise<void> {
		const domain: string | undefined = block.params.domain
		const topic: string | undefined = block.params.topic
		const context: string | undefined = block.params.context
		const attachments: string | undefined = block.params.attachments
		const consultType: string | undefined = block.params.consult_type

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

/**
 * 按咨询类型的方法论指导
 */
const CONSULT_TYPE_GUIDANCE: Record<ConsultType, string> = {
	principles: `你的任务是传授 **设计原则和心智模型**。

思考路径：
- 这个领域有哪些核心原则？它们是如何从实践中涌现的？
- 每个原则背后的 WHY 是什么？它解决了什么根本问题？
- 原则之间存在哪些张力和权衡？什么时候该优先哪个？
- 给出判断标准：面对具体场景时，如何决定应用哪个原则？

交付：设计原则清单 + 每个原则的推理链 + 原则间的权衡矩阵`,

	"best-practices": `你的任务是传授 **最佳实践和常见陷阱**。

思考路径：
- 这个领域经过验证的做法有哪些？它们为什么有效？
- 常见的陷阱和反模式是什么？为什么它们看起来对但实际上错？
- 每个实践的适用边界在哪里？什么条件下它会失效？
- 如何构建一个质量检查清单，让实践者能自我验证？

交付：最佳实践列表 + 反模式警告 + 适用条件说明 + 检查清单`,

	methodology: `你的任务是传授 **结构化方法论框架**。

思考路径：
- 解决这类问题的步骤框架是什么？每一步的目的和产出是什么？
- 步骤之间的依赖关系如何？哪些可以并行，哪些必须串行？
- 每个步骤的完成标准是什么？如何判断可以进入下一步？
- 有哪些可选路径？什么条件下应该选择不同的路径？

交付：步骤框架 + 依赖关系图 + 每步完成标准 + 决策点说明`,

	standards: `你的任务是传授 **行业标准和规范**。

思考路径：
- 这个领域有哪些权威标准和规范？它们的核心要求是什么？
- 合规的关键指标有哪些？如何衡量？
- 常见的不合规情况是什么？如何修正？
- 不同质量等级的验收标准分别是什么？

交付：标准清单 + 核心要求 + 验收标准 + 常见不合规修正方案`,
}

export const consultExpertTool = new ConsultExpertTool()
