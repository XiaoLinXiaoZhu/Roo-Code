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

			if (!params.status && !params.content) {
				task.consecutiveMistakeCount++
				task.recordToolError("update_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("At least one of 'status' or 'content' must be provided."))
				return
			}

			const approvalMsg = JSON.stringify({ tool: "updateIntent", ...params })
			const didApprove = await askApproval("tool", approvalMsg)
			if (!didApprove) {
				pushToolResult("User declined.")
				return
			}

			const updated = task.intentTree.updateNode(
				params.nodeId,
				{ content: params.content, status: params.status },
				task.taskId,
			)

			if (!updated) {
				task.consecutiveMistakeCount++
				task.recordToolError("update_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError(`Node '${params.nodeId}' not found.`))
				return
			}

			await task.intentTree.save()

			pushToolResult(
				`<intent_result action="update" nodeId="${updated.shortId}" status="${updated.status}">\n` +
					`  <content>${updated.content}</content>\n` +
					`  <tree_summary>\n${task.intentTree.toSummary()}\n  </tree_summary>\n` +
					`</intent_result>`,
			)
		} catch (error) {
			await handleError("update intent", error as Error)
		}
	}
}

export const updateIntentTool = new UpdateIntentTool()
