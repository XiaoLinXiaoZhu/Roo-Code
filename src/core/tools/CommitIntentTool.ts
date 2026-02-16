import simpleGit from "simple-git"
import { type ClineSayTool } from "@roo-code/types"

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

			// P0: message 必须非空
			if (!params.message || params.message.trim() === "") {
				task.consecutiveMistakeCount++
				task.recordToolError("commit_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("'message' is required and cannot be empty."))
				return
			}
			const message = params.message.trim()

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
				const availableNodes = task.intentTree.getAvailableNodesList()
				pushToolResult(
					formatResponse.toolError(`Node '${resolvedNodeId}' not found. Available nodes: ${availableNodes}`),
				)
				return
			}

			const commitMessage = `[intent:${node.shortId}] ${message}`

			const git = simpleGit({ baseDir: task.cwd })

			// TODO: git.add 在 askApproval 之前执行，若用户拒绝则 staging 已被污染。
			// 当前 intent 工具在默认自动通过组中，用户无法拒绝，暂不影响。
			// 后续若 intent 工具移出自动通过组，需将 askApproval 提前到 git.add 之前。
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

			// If target node is not impl, auto-create an impl child node for the commit
			let targetNode = node
			if (node.type !== "impl") {
				const result = task.intentTree.addNode({
					type: "impl",
					content: message,
					parentId: node.id,
					taskId: task.taskId,
				})
				targetNode = result.node
			}

			task.intentTree.bindCode(targetNode.shortId, binding, task.taskId)
			task.intentTree.updateNode(targetNode.shortId, { status: "done" }, task.taskId)
			await task.intentTree.save()

			// 标记 intent-tree 已更新（minor：绑定 commit + 状态变更，工具返回已足够说明）
			task.intentTreeUpdated = "minor"

			// 构建 UI 展示用的 JSON 结果
			const uiResult = {
				action: "commit" as const,
				node: {
					id: targetNode.id,
					shortId: targetNode.shortId,
					type: targetNode.type,
					content: targetNode.content,
					status: targetNode.status,
					parentId: targetNode.parentId,
					childrenIds: targetNode.childrenIds,
					codeBindings: targetNode.codeBindings,
				},
				binding,
				autoCreated: targetNode !== node,
				originalNodeId: targetNode !== node ? node.shortId : undefined,
				tree: task.intentTree.getData(),
			}

			// 构建消息，将结果放入 content 字段
			const sharedMessageProps: ClineSayTool = {
				tool: "commitIntent",
				content: JSON.stringify(uiResult),
			}

			const completeMessage = JSON.stringify(sharedMessageProps)
			const didApprove = await askApproval("tool", completeMessage)

			if (!didApprove) {
				pushToolResult("User declined the commit.")
				return
			}

			// 构建返回给 LLM 的 XML 结果（不包含 tree_summary，通过 environment 提供）
			const autoCreatedInfo = targetNode !== node ? ` (auto-created under ${node.shortId})` : ""
			pushToolResult(
				`<intent_commit_result status="committed">\n` +
					`  <commit hash="${commitHash}" node="${targetNode.shortId}"${autoCreatedInfo}>${commitMessage}</commit>\n` +
					`  <files>${changedFiles.join(", ")}</files>\n` +
					`  <diff_summary>${diffSummary}</diff_summary>\n` +
					`</intent_commit_result>`,
			)
		} catch (error) {
			await handleError("commit intent", error as Error)
		}
	}
}

export const commitIntentTool = new CommitIntentTool()
