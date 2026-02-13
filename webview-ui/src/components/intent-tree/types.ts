/**
 * Intent Tree 前端类型定义
 * 与后端 types.ts 保持同步
 */

export type IntentNodeType = "goal" | "objective" | "approach" | "impl"

export type IntentNodeStatus = "planned" | "in_progress" | "done" | "superseded" | "pruned"

export interface IntentCodeBinding {
	commitHash: string
	commitMessage: string
	files: string[]
	diffSummary?: string
	timestamp: string
}

export interface IntentNode {
	id: string
	shortId: string
	type: IntentNodeType
	content: string
	status: IntentNodeStatus
	parentId: string | null
	childrenIds: string[]
	codeBindings: IntentCodeBinding[]
}

export interface IntentTreeData {
	version: 1
	nodes: Record<string, IntentNode>
	rootIds: string[]
	shortIdIndex: Record<string, string>
}

// ============================================================================
// 工具调用结果类型
// ============================================================================

export interface AddIntentResult {
	node: IntentNode
	parentNode?: IntentNode
	typeAdjusted: boolean
	requestedType?: IntentNodeType
	adjustmentReason?: string
}

export interface UpdateIntentResult {
	node: IntentNode
	changes: {
		field: "content" | "status"
		oldValue: string
		newValue: string
	}[]
}

export interface PruneIntentResult {
	prunedNodes: { shortId: string; content: string }[]
	reason?: string
}

export interface CommitIntentResult {
	node: IntentNode
	binding: IntentCodeBinding
}

export interface RestructureIntentResult {
	operation: "reparent" | "promote" | "extract_common_parent"
	node: IntentNode
	newParent?: IntentNode | null
	shortIdChanges: { old: string; new: string }[]
	typeAdjusted?: boolean
	requestedType?: IntentNodeType
	adjustmentReason?: string
}

// ============================================================================
// 消息类型
// ============================================================================

export type IntentToolAction = "add" | "update" | "prune" | "commit" | "restructure"

export interface IntentTreeUpdateMessage {
	type: "intentTreeUpdate"
	data: {
		action: IntentToolAction
		result: AddIntentResult | UpdateIntentResult | PruneIntentResult | CommitIntentResult | RestructureIntentResult
		tree: IntentTreeData
	}
}
