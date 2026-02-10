import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface AddIntentParams {
	type: "goal" | "subgoal" | "path" | "impl"
	content: string
	parentId?: string
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

			if (!params.type || !params.content) {
				task.consecutiveMistakeCount++
				task.recordToolError("add_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("'type' and 'content' are required."))
				return
			}

			const approvalMsg = JSON.stringify({ tool: "addIntent", ...params })
			const didApprove = await askApproval("tool", approvalMsg)
			if (!didApprove) {
				pushToolResult("User declined.")
				return
			}

			const node = task.intentTree.addNode({
				type: params.type,
				content: params.content,
				parentId: params.parentId ?? null,
				taskId: task.taskId,
			})

			await task.intentTree.save()

			pushToolResult(
				`<intent_result action="add" nodeId="${node.shortId}" type="${node.type}" status="${node.status}">\n` +
					`  <content>${node.content}</content>\n` +
					`  <tree_summary>\n${task.intentTree.toSummary()}\n  </tree_summary>\n` +
					`</intent_result>`,
			)
		} catch (error) {
			await handleError("add intent", error as Error)
		}
	}
}

export const addIntentTool = new AddIntentTool()
