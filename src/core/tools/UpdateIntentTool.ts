import { type ClineSayTool } from "@roo-code/types"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface UpdateIntentParams {
	nodeId: string
	status?: "in_progress" | "done" | "superseded"
	content?: string
}

export class UpdateIntentTool extends BaseTool<"update_intent"> {
	readonly name = "update_intent" as const

	async execute(params: UpdateIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError, askApproval } = callbacks

		try {
			if (!task.intentTree) {
				task.consecutiveMistakeCount++
				task.recordToolError("update_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("Intent tree is not initialized yet."))
				return
			}

			if (!params.nodeId) {
				task.consecutiveMistakeCount++
				task.recordToolError("update_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("'nodeId' is required."))
				return
			}

			// P1: 与核心层校验一致，空字符串等同于未提供
			const newContent = params.content?.trim() || undefined
			const hasValidContent = newContent !== undefined
			const hasValidStatus = params.status !== undefined

			if (!hasValidContent && !hasValidStatus) {
				task.consecutiveMistakeCount++
				task.recordToolError("update_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError("At least one of 'status' or 'content' (non-empty) must be provided."),
				)
				return
			}

			// 获取更新前的节点状态
			const oldNode = task.intentTree.getNode(params.nodeId)
			if (!oldNode) {
				task.consecutiveMistakeCount++
				task.recordToolError("update_intent")
				task.didToolFailInCurrentTurn = true
				const availableNodes = task.intentTree.getAvailableNodesList()
				pushToolResult(
					formatResponse.toolError(`Node '${params.nodeId}' not found. Available nodes: ${availableNodes}`),
				)
				return
			}

			const oldContent = oldNode.content
			const oldStatus = oldNode.status

			// 执行更新
			const updated = task.intentTree.updateNode(
				params.nodeId,
				{ content: newContent, status: params.status },
				task.taskId,
			)

			if (!updated) {
				task.consecutiveMistakeCount++
				task.recordToolError("update_intent")
				task.didToolFailInCurrentTurn = true
				const availableNodes = task.intentTree.getAvailableNodesList()
				pushToolResult(
					formatResponse.toolError(`Node '${params.nodeId}' not found. Available nodes: ${availableNodes}`),
				)
				return
			}

			await task.intentTree.save()

			// 标记 intent-tree 已更新，下次 environment 会包含最新树
			task.intentTreeUpdated = true

			// 构建变更列表
			const changes: Array<{ field: "content" | "status"; oldValue: string; newValue: string }> = []
			if (hasValidContent && oldContent !== newContent) {
				changes.push({ field: "content", oldValue: oldContent, newValue: newContent! })
			}
			if (hasValidStatus && oldStatus !== params.status) {
				changes.push({ field: "status", oldValue: oldStatus, newValue: params.status! })
			}

			// 构建 UI 展示用的 JSON 结果
			const uiResult = {
				action: "update" as const,
				node: {
					id: updated.id,
					shortId: updated.shortId,
					type: updated.type,
					content: updated.content,
					status: updated.status,
					parentId: updated.parentId,
					childrenIds: updated.childrenIds,
					codeBindings: updated.codeBindings,
				},
				changes,
				tree: task.intentTree.getData(),
			}

			// 构建消息，将结果放入 content 字段
			const sharedMessageProps: ClineSayTool = {
				tool: "updateIntent",
				content: JSON.stringify(uiResult),
			}

			const completeMessage = JSON.stringify(sharedMessageProps)
			const didApprove = await askApproval("tool", completeMessage)

			if (!didApprove) {
				pushToolResult("User declined.")
				return
			}

			// 构建返回给 LLM 的 XML 结果（不包含 tree_summary，通过 environment 提供）
			pushToolResult(
				`<intent_result action="update" nodeId="${updated.shortId}" status="${updated.status}">\n` +
					`  <content>${updated.content}</content>\n` +
					`</intent_result>`,
			)
		} catch (error) {
			await handleError("update intent", error as Error)
		}
	}
}

export const updateIntentTool = new UpdateIntentTool()
