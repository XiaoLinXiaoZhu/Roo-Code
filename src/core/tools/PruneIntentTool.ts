import { type ClineSayTool } from "@roo-code/types"

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

			// P3: 规范化 reason，空字符串等同于未提供
			const reason = params.reason?.trim() || undefined

			// 获取要剪枝的节点信息（用于 UI 展示）
			const nodeToprune = task.intentTree.getNode(params.nodeId)
			if (!nodeToprune) {
				task.consecutiveMistakeCount++
				task.recordToolError("prune_intent")
				task.didToolFailInCurrentTurn = true
				const availableNodes = task.intentTree.getAvailableNodesList()
				pushToolResult(
					formatResponse.toolError(`Node '${params.nodeId}' not found. Available nodes: ${availableNodes}`),
				)
				return
			}

			// 收集要剪枝的节点信息（包括子节点）
			const nodesToPrune: Array<{ shortId: string; content: string }> = []
			const collectNodes = (nodeId: string) => {
				const node = task.intentTree!.getNode(nodeId)
				if (node && node.status !== "pruned") {
					nodesToPrune.push({ shortId: node.shortId, content: node.content })
					for (const childId of node.childrenIds) {
						collectNodes(childId)
					}
				}
			}
			collectNodes(params.nodeId)

			// 执行剪枝
			const commits = task.intentTree.getSubtreeCommits(params.nodeId)
			const prunedIds = task.intentTree.pruneSubtree(params.nodeId, task.taskId, reason)

			if (prunedIds.length === 0) {
				task.consecutiveMistakeCount++
				task.recordToolError("prune_intent")
				task.didToolFailInCurrentTurn = true
				const availableNodes = task.intentTree.getAvailableNodesList()
				pushToolResult(
					formatResponse.toolError(
						`Node '${params.nodeId}' not found or already pruned. Available nodes: ${availableNodes}`,
					),
				)
				return
			}

			await task.intentTree.save()

			// 构建 UI 展示用的 JSON 结果
			const uiResult = {
				action: "prune" as const,
				prunedNodes: nodesToPrune,
				reason,
				associatedCommits: commits,
				tree: task.intentTree.getData(),
			}

			// 构建消息，将结果放入 content 字段
			const sharedMessageProps: ClineSayTool = {
				tool: "pruneIntent",
				content: JSON.stringify(uiResult),
			}

			const completeMessage = JSON.stringify(sharedMessageProps)
			const didApprove = await askApproval("tool", completeMessage)

			if (!didApprove) {
				pushToolResult("User declined.")
				return
			}

			// 构建返回给 LLM 的 XML 结果
			let result =
				`<intent_result action="prune" prunedCount="${prunedIds.length}">\n` +
				`  <pruned_nodes>${prunedIds.join(", ")}</pruned_nodes>\n`

			if (reason) {
				result += `  <reason>${reason}</reason>\n`
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
