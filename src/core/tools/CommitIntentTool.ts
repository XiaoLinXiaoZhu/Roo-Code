import simpleGit from "simple-git"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { IntentCodeBinding } from "../intent-tree"

interface CommitIntentParams {
	nodeId?: string
	message: string
}

export class CommitIntentTool extends BaseTool<"commit_intent"> {
	readonly name = "commit_intent" as const

	async execute(params: CommitIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError, askApproval } = callbacks

		try {
			if (!task.intentTree) {
				task.consecutiveMistakeCount++
				task.recordToolError("commit_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("Intent tree is not initialized yet."))
				return
			}

			// Resolve nodeId: explicit or auto-detect current active node
			let resolvedNodeId = params.nodeId
			if (!resolvedNodeId) {
				const activeNode = task.intentTree.getCurrentActiveNode()
				if (activeNode) {
					resolvedNodeId = activeNode.shortId
				}
			}

			if (!resolvedNodeId) {
				task.consecutiveMistakeCount++
				task.recordToolError("commit_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError(
						"No nodeId provided and no in_progress node found. Specify a nodeId or mark a node as in_progress first.",
					),
				)
				return
			}

			const node = task.intentTree.getNode(resolvedNodeId)
			if (!node) {
				task.consecutiveMistakeCount++
				task.recordToolError("commit_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError(`Node '${resolvedNodeId}' not found.`))
				return
			}

			const commitMessage = `[intent:${node.shortId}] ${params.message}`

			const approvalMsg = JSON.stringify({
				tool: "commitIntent",
				nodeId: node.shortId,
				nodeContent: node.content,
				commitMessage,
			})
			const didApprove = await askApproval("tool", approvalMsg)
			if (!didApprove) {
				pushToolResult("User declined the commit.")
				return
			}

			const git = simpleGit({ baseDir: task.cwd })

			await git.add([".", "--ignore-errors"])

			const status = await git.status()
			if (status.staged.length === 0 && status.files.length === 0) {
				pushToolResult(
					`<intent_commit_result status="no_changes">\n` +
						`  <message>No changes to commit.</message>\n` +
						`</intent_commit_result>`,
				)
				return
			}

			const commitResult = await git.commit(commitMessage)
			const commitHash = commitResult.commit || ""

			let changedFiles: string[] = []
			let diffSummary = ""
			try {
				const diff = await git.diffSummary([`${commitHash}~1`, commitHash])
				changedFiles = diff.files.map((f) => f.file)
				diffSummary = `${diff.files.length} file(s), +${diff.insertions} -${diff.deletions}`
			} catch {
				changedFiles = status.files.map((f) => f.path)
				diffSummary = `${changedFiles.length} file(s)`
			}

			const binding: IntentCodeBinding = {
				commitHash,
				commitMessage,
				files: changedFiles,
				diffSummary,
				timestamp: new Date().toISOString(),
			}

			task.intentTree.bindCode(node.shortId, binding, task.taskId)
			task.intentTree.updateNode(node.shortId, { status: "done" }, task.taskId)
			await task.intentTree.save()

			pushToolResult(
				`<intent_commit_result status="committed">\n` +
					`  <commit hash="${commitHash}" node="${node.shortId}">${commitMessage}</commit>\n` +
					`  <files>${changedFiles.join(", ")}</files>\n` +
					`  <diff_summary>${diffSummary}</diff_summary>\n` +
					`  <tree_summary>\n${task.intentTree.toSummary()}\n  </tree_summary>\n` +
					`</intent_commit_result>`,
			)
		} catch (error) {
			await handleError("commit intent", error as Error)
		}
	}
}

export const commitIntentTool = new CommitIntentTool()
