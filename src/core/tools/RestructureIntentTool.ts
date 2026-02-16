import { type ClineSayTool } from "@roo-code/types"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface RestructureIntentParams {
	operation: "reparent" | "promote" | "extract_common_parent"
	nodeId?: string
	newParentId?: string | null
	nodeIds?: string[]
	commonContent?: string
}

export class RestructureIntentTool extends BaseTool<"restructure_intent"> {
	readonly name = "restructure_intent" as const

	async execute(params: RestructureIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError, askApproval } = callbacks

		try {
			if (!task.intentTree) {
				task.consecutiveMistakeCount++
				task.recordToolError("restructure_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("Intent tree is not initialized yet."))
				return
			}

			if (!params.operation) {
				task.consecutiveMistakeCount++
				task.recordToolError("restructure_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError(
						"'operation' is required. Must be one of: reparent, promote, extract_common_parent",
					),
				)
				return
			}

			switch (params.operation) {
				case "reparent":
					await this.handleReparent(params, task, callbacks)
					break
				case "promote":
					await this.handlePromote(params, task, callbacks)
					break
				case "extract_common_parent":
					await this.handleExtractCommonParent(params, task, callbacks)
					break
				default:
					task.consecutiveMistakeCount++
					task.recordToolError("restructure_intent")
					task.didToolFailInCurrentTurn = true
					pushToolResult(
						formatResponse.toolError(
							`Unknown operation '${params.operation}'. Must be one of: reparent, promote, extract_common_parent`,
						),
					)
			}
		} catch (error) {
			await handleError("restructure intent", error as Error)
		}
	}

	private async handleReparent(params: RestructureIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, askApproval } = callbacks

		if (!params.nodeId) {
			task.consecutiveMistakeCount++
			task.recordToolError("restructure_intent")
			task.didToolFailInCurrentTurn = true
			pushToolResult(formatResponse.toolError("'nodeId' is required for reparent operation."))
			return
		}

		// 规范化 newParentId：空字符串视为 null（移动到根节点）
		const newParentId = params.newParentId === "" ? null : (params.newParentId ?? null)

		const result = task.intentTree!.reparentNode(params.nodeId, newParentId, task.taskId)

		if (!result.success) {
			task.consecutiveMistakeCount++
			task.recordToolError("restructure_intent")
			task.didToolFailInCurrentTurn = true
			pushToolResult(formatResponse.toolError(result.error ?? "Reparent failed."))
			return
		}

		await task.intentTree!.save()

		// 标记 intent-tree 已更新（structural：reparent 可能导致 shortId 大规模变化，需要注入完整树）
		task.intentTreeUpdated = "structural"

		// 获取新父节点信息
		let newParentNode = null
		if (newParentId) {
			const parent = task.intentTree!.getNode(newParentId)
			if (parent) {
				newParentNode = {
					id: parent.id,
					shortId: parent.shortId,
					type: parent.type,
					content: parent.content,
				}
			}
		}

		// 构建 UI 展示用的 JSON 结果
		const shortIdChanges: Array<{ old: string; new: string }> = []
		for (const [, change] of result.shortIdChanges) {
			shortIdChanges.push(change)
		}

		const uiResult = {
			action: "restructure" as const,
			operation: "reparent" as const,
			node: {
				id: result.node!.id,
				shortId: result.node!.shortId,
				type: result.node!.type,
				content: result.node!.content,
				status: result.node!.status,
				parentId: result.node!.parentId,
				childrenIds: result.node!.childrenIds,
				codeBindings: result.node!.codeBindings,
			},
			newParent: newParentNode,
			typeAdjusted: result.typeAdjusted,
			requestedType: result.requestedType,
			adjustmentReason: result.adjustmentReason,
			shortIdChanges,
			tree: task.intentTree!.getData(),
		}

		// 构建消息，将结果放入 content 字段
		const sharedMessageProps: ClineSayTool = {
			tool: "restructureIntent",
			content: JSON.stringify(uiResult),
		}

		const completeMessage = JSON.stringify(sharedMessageProps)
		const didApprove = await askApproval("tool", completeMessage)

		if (!didApprove) {
			pushToolResult("User declined.")
			return
		}

		// 构建返回给 LLM 的 XML 结果
		let response = `<intent_result action="reparent" nodeId="${result.node!.shortId}" type="${result.node!.type}">\n`

		if (result.typeAdjusted) {
			response +=
				`  <type_adjustment from="${result.requestedType}" to="${result.node!.type}">\n` +
				`    ${result.adjustmentReason}\n` +
				`  </type_adjustment>\n`
		}

		if (result.shortIdChanges.size > 0) {
			response += `  <shortid_changes>\n`
			for (const [, change] of result.shortIdChanges) {
				response += `    <change from="${change.old}" to="${change.new}" />\n`
			}
			response += `  </shortid_changes>\n`
		}

		// 不包含 tree_summary，通过 environment 提供
		response += `</intent_result>`

		pushToolResult(response)
	}

	private async handlePromote(params: RestructureIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, askApproval } = callbacks

		if (!params.nodeId) {
			task.consecutiveMistakeCount++
			task.recordToolError("restructure_intent")
			task.didToolFailInCurrentTurn = true
			pushToolResult(formatResponse.toolError("'nodeId' is required for promote operation."))
			return
		}

		const node = task.intentTree!.getNode(params.nodeId)
		if (!node) {
			task.consecutiveMistakeCount++
			task.recordToolError("restructure_intent")
			task.didToolFailInCurrentTurn = true
			const availableNodes = task.intentTree!.getAvailableNodesList()
			pushToolResult(
				formatResponse.toolError(`Node '${params.nodeId}' not found. Available nodes: ${availableNodes}`),
			)
			return
		}

		if (!node.parentId) {
			task.consecutiveMistakeCount++
			task.recordToolError("restructure_intent")
			task.didToolFailInCurrentTurn = true
			pushToolResult(
				formatResponse.toolError(`Node '${params.nodeId}' is already a root node, cannot promote further.`),
			)
			return
		}

		const parent = task.intentTree!.getNode(node.parentId)
		if (!parent) {
			task.consecutiveMistakeCount++
			task.recordToolError("restructure_intent")
			task.didToolFailInCurrentTurn = true
			pushToolResult(formatResponse.toolError(`Parent node not found.`))
			return
		}

		const grandparentId = parent.parentId

		const result = task.intentTree!.reparentNode(params.nodeId, grandparentId, task.taskId)

		if (!result.success) {
			task.consecutiveMistakeCount++
			task.recordToolError("restructure_intent")
			task.didToolFailInCurrentTurn = true
			pushToolResult(formatResponse.toolError(result.error ?? "Promote failed."))
			return
		}

		await task.intentTree!.save()

		// 标记 intent-tree 已更新（structural：promote 可能导致 shortId 大规模变化，需要注入完整树）
		task.intentTreeUpdated = "structural"

		// 获取新父节点信息
		let newParentNode = null
		if (grandparentId) {
			const grandparent = task.intentTree!.getNode(grandparentId)
			if (grandparent) {
				newParentNode = {
					id: grandparent.id,
					shortId: grandparent.shortId,
					type: grandparent.type,
					content: grandparent.content,
				}
			}
		}

		// 构建 UI 展示用的 JSON 结果
		const shortIdChanges: Array<{ old: string; new: string }> = []
		for (const [, change] of result.shortIdChanges) {
			shortIdChanges.push(change)
		}

		const uiResult = {
			action: "restructure" as const,
			operation: "promote" as const,
			node: {
				id: result.node!.id,
				shortId: result.node!.shortId,
				type: result.node!.type,
				content: result.node!.content,
				status: result.node!.status,
				parentId: result.node!.parentId,
				childrenIds: result.node!.childrenIds,
				codeBindings: result.node!.codeBindings,
			},
			newParent: newParentNode,
			typeAdjusted: result.typeAdjusted,
			requestedType: result.requestedType,
			adjustmentReason: result.adjustmentReason,
			shortIdChanges,
			tree: task.intentTree!.getData(),
		}

		// 构建消息，将结果放入 content 字段
		const sharedMessageProps: ClineSayTool = {
			tool: "restructureIntent",
			content: JSON.stringify(uiResult),
		}

		const completeMessage = JSON.stringify(sharedMessageProps)
		const didApprove = await askApproval("tool", completeMessage)

		if (!didApprove) {
			pushToolResult("User declined.")
			return
		}

		// 构建返回给 LLM 的 XML 结果
		let response = `<intent_result action="promote" nodeId="${result.node!.shortId}" type="${result.node!.type}" promotedTo="${grandparentId ?? "root"}">\n`

		if (result.typeAdjusted) {
			response +=
				`  <type_adjustment from="${result.requestedType}" to="${result.node!.type}">\n` +
				`    ${result.adjustmentReason}\n` +
				`  </type_adjustment>\n`
		}

		if (result.shortIdChanges.size > 0) {
			response += `  <shortid_changes>\n`
			for (const [, change] of result.shortIdChanges) {
				response += `    <change from="${change.old}" to="${change.new}" />\n`
			}
			response += `  </shortid_changes>\n`
		}

		// 不包含 tree_summary，通过 environment 提供
		response += `</intent_result>`

		pushToolResult(response)
	}

	private async handleExtractCommonParent(
		params: RestructureIntentParams,
		task: Task,
		callbacks: ToolCallbacks,
	): Promise<void> {
		const { pushToolResult, askApproval } = callbacks

		if (!params.nodeIds || params.nodeIds.length < 2) {
			task.consecutiveMistakeCount++
			task.recordToolError("restructure_intent")
			task.didToolFailInCurrentTurn = true
			pushToolResult(
				formatResponse.toolError(
					"'nodeIds' must contain at least 2 node IDs for extract_common_parent operation.",
				),
			)
			return
		}

		if (!params.commonContent || params.commonContent.trim() === "") {
			task.consecutiveMistakeCount++
			task.recordToolError("restructure_intent")
			task.didToolFailInCurrentTurn = true
			pushToolResult(formatResponse.toolError("'commonContent' is required for extract_common_parent operation."))
			return
		}

		// 验证所有节点存在
		const nodes = params.nodeIds.map((id) => task.intentTree!.getNode(id))
		const missingIndex = nodes.findIndex((n) => !n)
		if (missingIndex !== -1) {
			task.consecutiveMistakeCount++
			task.recordToolError("restructure_intent")
			task.didToolFailInCurrentTurn = true
			const availableNodes = task.intentTree!.getAvailableNodesList()
			pushToolResult(
				formatResponse.toolError(
					`Node '${params.nodeIds[missingIndex]}' not found. Available nodes: ${availableNodes}`,
				),
			)
			return
		}

		// 推断新父节点类型
		const TYPE_ORDER = ["goal", "objective", "approach", "impl"] as const
		const validNodes = nodes.filter((n): n is NonNullable<typeof n> => n !== undefined)
		const nodeTypeIndices = validNodes.map((n) => TYPE_ORDER.indexOf(n.type as (typeof TYPE_ORDER)[number]))
		const highestTypeIndex = Math.min(...nodeTypeIndices)
		const newParentType = highestTypeIndex > 0 ? TYPE_ORDER[highestTypeIndex - 1] : "goal"

		// 创建新的父节点
		const newParentResult = task.intentTree!.addNode({
			type: newParentType,
			content: params.commonContent.trim(),
			parentId: null,
			taskId: task.taskId,
		})

		// 将所有指定节点 reparent 到新父节点下
		const reparentResults: Array<{ nodeId: string; success: boolean; error?: string }> = []
		const allShortIdChanges = new Map<string, { old: string; new: string }>()

		for (const nodeId of params.nodeIds) {
			const result = task.intentTree!.reparentNode(nodeId, newParentResult.node.id, task.taskId)
			reparentResults.push({
				nodeId,
				success: result.success,
				error: result.error,
			})
			if (result.success) {
				for (const [id, change] of result.shortIdChanges) {
					allShortIdChanges.set(id, change)
				}
			}
		}

		await task.intentTree!.save()

		// 标记 intent-tree 已更新（structural：extract_common_parent 重组树结构，需要注入完整树）
		task.intentTreeUpdated = "structural"

		// 构建 UI 展示用的 JSON 结果
		const shortIdChanges: Array<{ old: string; new: string }> = []
		for (const [, change] of allShortIdChanges) {
			shortIdChanges.push(change)
		}

		const uiResult = {
			action: "restructure" as const,
			operation: "extract_common_parent" as const,
			node: {
				id: newParentResult.node.id,
				shortId: newParentResult.node.shortId,
				type: newParentResult.node.type,
				content: newParentResult.node.content,
				status: newParentResult.node.status,
				parentId: newParentResult.node.parentId,
				childrenIds: newParentResult.node.childrenIds,
				codeBindings: newParentResult.node.codeBindings,
			},
			newParent: null,
			reparentResults,
			shortIdChanges,
			tree: task.intentTree!.getData(),
		}

		// 构建消息，将结果放入 content 字段
		const sharedMessageProps: ClineSayTool = {
			tool: "restructureIntent",
			content: JSON.stringify(uiResult),
		}

		const completeMessage = JSON.stringify(sharedMessageProps)
		const didApprove = await askApproval("tool", completeMessage)

		if (!didApprove) {
			pushToolResult("User declined.")
			return
		}

		// 构建返回给 LLM 的 XML 结果
		const failedReparents = reparentResults.filter((r) => !r.success)

		let response =
			`<intent_result action="extract_common_parent" newParentId="${newParentResult.node.shortId}">\n` +
			`  <new_parent type="${newParentResult.node.type}">${newParentResult.node.content}</new_parent>\n` +
			`  <reparented_nodes>\n`

		for (const result of reparentResults) {
			if (result.success) {
				const node = task.intentTree!.getNode(result.nodeId)
				response += `    <node oldId="${result.nodeId}" newId="${node?.shortId ?? result.nodeId}" />\n`
			} else {
				response += `    <node id="${result.nodeId}" error="${result.error}" />\n`
			}
		}
		response += `  </reparented_nodes>\n`

		if (failedReparents.length > 0) {
			response += `  <warning>Some nodes could not be reparented. See errors above.</warning>\n`
		}

		if (allShortIdChanges.size > 0) {
			response += `  <shortid_changes>\n`
			for (const [, change] of allShortIdChanges) {
				response += `    <change from="${change.old}" to="${change.new}" />\n`
			}
			response += `  </shortid_changes>\n`
		}

		// 不包含 tree_summary，通过 environment 提供
		response += `</intent_result>`

		pushToolResult(response)
	}
}

export const restructureIntentTool = new RestructureIntentTool()
