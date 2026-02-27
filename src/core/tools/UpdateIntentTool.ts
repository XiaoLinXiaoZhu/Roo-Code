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

			// P1: 与核心层校验一致，空字符串和字符串 "null" 等同于未提供
			// 模型有时会传入字符串 "null" 而非省略参数
			const rawContent = params.content?.trim()
			const newContent = rawContent && rawContent !== "null" ? rawContent : undefined
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
			const result = task.intentTree.updateNode(
				params.nodeId,
				{ content: newContent, status: params.status },
				task.taskId,
			)

			if (!result) {
				task.consecutiveMistakeCount++
				task.recordToolError("update_intent")
				task.didToolFailInCurrentTurn = true
				const availableNodes = task.intentTree.getAvailableNodesList()
				pushToolResult(
					formatResponse.toolError(`Node '${params.nodeId}' not found. Available nodes: ${availableNodes}`),
				)
				return
			}

			const updated = result.node

			await task.intentTree.save()

			// 标记 intent-tree 已更新（minor：仅状态/内容变更，工具返回已足够说明）
			task.intentTreeUpdated = "minor"

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
				cascadeUpdates: result.cascadeUpdates,
				warnings: result.warnings,
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

			// 构建返回给 LLM 的 XML 结果（与 toSummary 格式一致）
			const tagName = updated.type
			let response = `<${tagName} id="${updated.shortId}" status="${updated.status}">${updated.content}</${tagName}>`

			// 附加联动变更信息
			if (result.cascadeUpdates.length > 0) {
				const cascadeLines = result.cascadeUpdates
					.map(
						(c) =>
							`  <cascade node="${c.shortId}" from="${c.oldStatus}" to="${c.newStatus}">${c.reason}</cascade>`,
					)
					.join("\n")
				response += `\n<cascade_updates>\n${cascadeLines}\n</cascade_updates>`
			}

			// 附加警告信息
			if (result.warnings.length > 0) {
				response += `\n<warnings>\n${result.warnings.map((w) => `  <warning>${w}</warning>`).join("\n")}\n</warnings>`
			}

			pushToolResult(response)
		} catch (error) {
			await handleError("update intent", error as Error)
		}
	}
}

export const updateIntentTool = new UpdateIntentTool()
