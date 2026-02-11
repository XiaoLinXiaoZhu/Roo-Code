import { type ClineSayTool } from "@roo-code/types"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface AddIntentParams {
	type: "goal" | "subgoal" | "path" | "impl"
	content: string
	parentId?: string
	placement: "new_root" | "child_of"
	placementReason: string
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

			// P3: 验证 placement 和 parentId 的一致性
			if (params.placement === "new_root" && params.parentId) {
				task.consecutiveMistakeCount++
				task.recordToolError("add_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError(
						`Inconsistent parameters: placement is 'new_root' but parentId is provided. ` +
							`Either use placement='child_of' with parentId, or remove parentId for new_root.`,
					),
				)
				return
			}

			if (params.placement === "child_of" && !params.parentId) {
				task.consecutiveMistakeCount++
				task.recordToolError("add_intent")
				task.didToolFailInCurrentTurn = true
				const existingNodes = task.intentTree.toSummary()
				pushToolResult(
					formatResponse.toolError(
						`placement is 'child_of' but parentId is missing.\n\n` +
							`Current tree:\n${existingNodes}\n\n` +
							`Please specify which node this should be a child of.`,
					),
				)
				return
			}

			// P4: 创建 new_root 时，如果树非空，检查 placementReason 是否有意义
			if (params.placement === "new_root" && !task.intentTree.isEmpty()) {
				if (!params.placementReason || params.placementReason.trim().length < 10) {
					task.consecutiveMistakeCount++
					task.recordToolError("add_intent")
					task.didToolFailInCurrentTurn = true
					const existingNodes = task.intentTree.toSummary()
					pushToolResult(
						formatResponse.toolError(
							`Creating a new root requires a meaningful placementReason explaining why existing nodes don't fit.\n\n` +
								`Current tree:\n${existingNodes}\n\n` +
								`Please provide placementReason referencing specific nodes you considered.`,
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

			await task.intentTree.save()

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

			// 构建返回给 LLM 的 XML 结果
			let response =
				`<intent_result action="add" nodeId="${result.node.shortId}" type="${result.node.type}" status="${result.node.status}">\n` +
				`  <content>${result.node.content}</content>\n`

			// 如果类型被调整，显式通知模型
			if (result.typeAdjusted) {
				response +=
					`  <type_adjustment from="${result.requestedType}" to="${result.node.type}">\n` +
					`    ${result.adjustmentReason}\n` +
					`  </type_adjustment>\n`
			}

			response += `  <tree_summary>\n${task.intentTree.toSummary()}\n  </tree_summary>\n` + `</intent_result>`

			pushToolResult(response)
		} catch (error) {
			await handleError("add intent", error as Error)
		}
	}
}

export const addIntentTool = new AddIntentTool()
