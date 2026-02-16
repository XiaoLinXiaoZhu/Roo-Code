import { type ClineSayTool } from "@roo-code/types"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface AddIntentParams {
	type: "goal" | "objective" | "approach" | "impl"
	content: string
	parentId?: string
	assumption: string
}

export class AddIntentTool extends BaseTool<"add_intent"> {
	readonly name = "add_intent" as const

	async execute(params: AddIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError, askApproval } = callbacks

		try {
			if (!task.intentTree) {
				task.consecutiveMistakeCount++
				task.recordToolError("add_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("Intent tree is not initialized yet."))
				return
			}

			// P2: 显式校验 content 非空
			if (!params.type || !params.content || params.content.trim() === "") {
				task.consecutiveMistakeCount++
				task.recordToolError("add_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError("'type' and 'content' are required. 'content' cannot be empty."),
				)
				return
			}
			const intentContent = params.content.trim()
			const isNewRoot = !params.parentId

			// P3: 创建 new_root 时，如果树非空，检查 assumption 是否有意义
			if (isNewRoot && !task.intentTree.isEmpty()) {
				if (!params.assumption || params.assumption.trim().length < 10) {
					task.consecutiveMistakeCount++
					task.recordToolError("add_intent")
					task.didToolFailInCurrentTurn = true
					const existingNodes = task.intentTree.toSummary()
					pushToolResult(
						formatResponse.toolError(
							`Creating a new root requires a meaningful assumption explaining why existing nodes don't fit.\n\n` +
								`Current tree:\n${existingNodes}\n\n` +
								`Please provide assumption referencing specific nodes you considered.`,
						),
					)
					return
				}
			}

			// 先执行操作获取结果
			const result = task.intentTree.addNode({
				type: params.type,
				content: intentContent,
				parentId: params.parentId ?? null,
				taskId: task.taskId,
			})

			// 将 assumption 写入节点
			if (params.assumption) {
				result.node.assumption = params.assumption.trim()
			}

			await task.intentTree.save()

			// 标记 intent-tree 已更新（minor：新增节点，工具返回已包含完整节点信息和父节点位置）
			task.intentTreeUpdated = "minor"

			// 获取父节点信息（如果有）
			let parentNode = null
			if (result.node.parentId) {
				const parent = task.intentTree.getNode(result.node.parentId)
				if (parent) {
					parentNode = {
						id: parent.id,
						shortId: parent.shortId,
						type: parent.type,
						content: parent.content,
					}
				}
			}

			// 构建 UI 展示用的 JSON 结果
			const uiResult = {
				action: "add" as const,
				node: {
					id: result.node.id,
					shortId: result.node.shortId,
					type: result.node.type,
					content: result.node.content,
					status: result.node.status,
					parentId: result.node.parentId,
					childrenIds: result.node.childrenIds,
					codeBindings: result.node.codeBindings,
				},
				parentNode,
				typeAdjusted: result.typeAdjusted,
				requestedType: result.requestedType,
				adjustmentReason: result.adjustmentReason,
				tree: task.intentTree.getData(),
			}

			// 构建消息，将结果放入 content 字段
			const sharedMessageProps: ClineSayTool = {
				tool: "addIntent",
				content: JSON.stringify(uiResult),
			}

			const completeMessage = JSON.stringify(sharedMessageProps)
			const didApprove = await askApproval("tool", completeMessage)

			if (!didApprove) {
				// 用户拒绝，需要回滚（但目前没有回滚机制，先记录）
				pushToolResult("User declined.")
				return
			}

			// 构建返回给 LLM 的 XML 结果（与 toSummary 格式一致）
			const tagName = result.node.type
			let response = `<${tagName} id="${result.node.shortId}" status="${result.node.status}">${result.node.content}`

			// 如果类型被调整，显式通知模型
			if (result.typeAdjusted) {
				response += `\n  <type_adjustment from="${result.requestedType}" to="${result.node.type}">${result.adjustmentReason}</type_adjustment>`
			}

			response += `</${tagName}>`

			pushToolResult(response)
		} catch (error) {
			await handleError("add intent", error as Error)
		}
	}
}

export const addIntentTool = new AddIntentTool()
