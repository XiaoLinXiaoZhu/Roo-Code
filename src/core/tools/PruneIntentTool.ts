import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface PruneIntentParams {
	nodeId: string
	reason?: string
}

export class PruneIntentTool extends BaseTool<"prune_intent"> {
	readonly name = "prune_intent" as const

	async execute(params: PruneIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError, askApproval } = callbacks

		try {
			if (!task.intentTree) {
				task.consecutiveMistakeCount++
				task.recordToolError("prune_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("Intent tree is not initialized yet."))
				return
			}

			if (!params.nodeId) {
				task.consecutiveMistakeCount++
				task.recordToolError("prune_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("'nodeId' is required."))
				return
			}

			const approvalMsg = JSON.stringify({ tool: "pruneIntent", ...params })
			const didApprove = await askApproval("tool", approvalMsg)
			if (!didApprove) {
				pushToolResult("User declined.")
				return
			}

			const commits = task.intentTree.getSubtreeCommits(params.nodeId)
			const prunedIds = task.intentTree.pruneSubtree(params.nodeId, task.taskId, params.reason)

			if (prunedIds.length === 0) {
				task.consecutiveMistakeCount++
				task.recordToolError("prune_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError(`Node '${params.nodeId}' not found or already pruned.`))
				return
			}

			await task.intentTree.save()

			let result =
				`<intent_result action="prune" prunedCount="${prunedIds.length}">\n` +
				`  <pruned_nodes>${prunedIds.join(", ")}</pruned_nodes>\n`

			if (params.reason) {
				result += `  <reason>${params.reason}</reason>\n`
			}

			if (commits.length > 0) {
				result += `  <associated_commits hint="these commits may need to be reverted">\n`
				for (const c of commits) {
					result += `    <commit hash="${c.commitHash}">${c.commitMessage}</commit>\n`
				}
				result += `  </associated_commits>\n`
			}

			result += `  <tree_summary>\n${task.intentTree.toSummary()}\n  </tree_summary>\n`
			result += `</intent_result>`

			pushToolResult(result)
		} catch (error) {
			await handleError("prune intent", error as Error)
		}
	}
}

export const pruneIntentTool = new PruneIntentTool()
