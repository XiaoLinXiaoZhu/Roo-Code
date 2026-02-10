/**
 * IntentTree - 意图树核心类
 *
 * 职责：
 * - 管理意图节点的增删改查
 * - 语义化短 ID（G1, S1.1, P1.1.1）方便模型引用
 * - 持久化到 JSON 文件（跨对话）
 * - 生成摘要用于注入 prompt
 * - 与 git 集成（通过 commit_intent 绑定 commit hash）
 */

import * as fs from "fs/promises"
import * as path from "path"
import { v4 as uuidv4 } from "uuid"

import type { IntentNode, IntentNodeType, IntentNodeStatus, IntentCodeBinding, IntentTreeData } from "./types"

/**
 * 创建空的意图树数据
 */
function createEmptyTreeData(): IntentTreeData {
	return {
		version: 1,
		nodes: {},
		rootIds: [],
		shortIdIndex: {},
	}
}

/**
 * 节点类型前缀映射
 */
const TYPE_PREFIX: Record<IntentNodeType, string> = {
	goal: "G",
	subgoal: "S",
	path: "P",
	impl: "I",
}

export class IntentTree {
	private data: IntentTreeData
	private filePath: string
	private dirty = false
	private modificationCounter = 0
	private nodeLastModOrder = new Map<string, number>()

	constructor(filePath: string, data?: IntentTreeData) {
		this.filePath = filePath
		this.data = data ?? createEmptyTreeData()
		// 确保旧数据有 shortIdIndex
		if (!this.data.shortIdIndex) {
			this.data.shortIdIndex = {}
			this.rebuildShortIdIndex()
		}
	}

	// ========================================================================
	// 持久化
	// ========================================================================

	/**
	 * 从 JSON 文件加载意图树。如果文件不存在则创建空树。
	 */
	static async load(filePath: string): Promise<IntentTree> {
		try {
			const raw = await fs.readFile(filePath, "utf-8")
			const data = JSON.parse(raw) as IntentTreeData
			// 简单版本校验
			if (data.version !== 1) {
				console.warn(`[IntentTree] Unknown version ${data.version}, creating empty tree`)
				return new IntentTree(filePath)
			}
			return new IntentTree(filePath, data)
		} catch (err: any) {
			if (err.code === "ENOENT") {
				// 文件不存在，正常情况
				return new IntentTree(filePath)
			}
			console.error(`[IntentTree] Failed to load from ${filePath}:`, err)
			return new IntentTree(filePath)
		}
	}

	/**
	 * 保存意图树到 JSON 文件
	 */
	async save(): Promise<void> {
		if (!this.dirty) {
			return
		}
		const dir = path.dirname(this.filePath)
		await fs.mkdir(dir, { recursive: true })
		await fs.writeFile(this.filePath, JSON.stringify(this.data, null, "\t"), "utf-8")
		this.dirty = false
	}

	// ========================================================================
	// 短 ID 生成
	// ========================================================================

	/**
	 * 生成语义化短 ID。
	 * 规则：
	 * - 根节点：{前缀}{序号}，如 G1, G2
	 * - 子节点：{父shortId}.{序号}，如 S1.1, P1.1.1
	 * 序号基于同父同类型的兄弟节点数量递增。
	 */
	private generateShortId(type: IntentNodeType, parentId: string | null): string {
		const prefix = TYPE_PREFIX[type]

		if (!parentId) {
			// 根节点：计算同类型根节点数量
			const sameTypeRootCount = this.data.rootIds
				.map((id) => this.data.nodes[id])
				.filter((n) => n && n.type === type).length
			return `${prefix}${sameTypeRootCount + 1}`
		}

		const parent = this.data.nodes[parentId]
		if (!parent) {
			// 父节点不存在，当作根节点处理
			const sameTypeRootCount = this.data.rootIds
				.map((id) => this.data.nodes[id])
				.filter((n) => n && n.type === type).length
			return `${prefix}${sameTypeRootCount + 1}`
		}

		// 子节点：计算同父节点下的子节点数量（不区分类型，按添加顺序递增）
		const siblingCount = parent.childrenIds.length
		return `${parent.shortId}.${siblingCount + 1}`
	}

	/**
	 * 重建 shortId 索引（用于加载旧数据时的兼容）
	 */
	private rebuildShortIdIndex(): void {
		this.data.shortIdIndex = {}
		for (const [id, node] of Object.entries(this.data.nodes)) {
			if (node.shortId) {
				this.data.shortIdIndex[node.shortId] = id
			}
		}
	}

	// ========================================================================
	// 节点查找（支持 shortId 和 UUID）
	// ========================================================================

	/**
	 * 通过 shortId 或 UUID 解析为内部 UUID
	 */
	resolveId(idOrShortId: string): string | null {
		// 先尝试直接作为 UUID 查找
		if (this.data.nodes[idOrShortId]) {
			return idOrShortId
		}
		// 再尝试作为 shortId 查找
		const uuid = this.data.shortIdIndex[idOrShortId]
		if (uuid && this.data.nodes[uuid]) {
			return uuid
		}
		// 大小写不敏感匹配
		const upper = idOrShortId.toUpperCase()
		for (const [shortId, uuid2] of Object.entries(this.data.shortIdIndex)) {
			if (shortId.toUpperCase() === upper) {
				return uuid2
			}
		}
		return null
	}

	// ========================================================================
	// 节点操作
	// ========================================================================

	/**
	 * 添加节点
	 */
	addNode(params: { type: IntentNodeType; content: string; parentId: string | null; taskId: string }): IntentNode {
		const id = uuidv4()
		const now = new Date().toISOString()

		// 解析 parentId（支持 shortId）
		let resolvedParentId: string | null = null
		if (params.parentId) {
			resolvedParentId = this.resolveId(params.parentId)
			if (!resolvedParentId) {
				console.warn(`[IntentTree] Parent '${params.parentId}' not found, adding as root`)
			}
		}

		const shortId = this.generateShortId(params.type, resolvedParentId)

		const node: IntentNode = {
			id,
			shortId,
			type: params.type,
			content: params.content,
			status: "planned",
			parentId: resolvedParentId,
			childrenIds: [],
			codeBindings: [],
			createdBy: {
				taskId: params.taskId,
				timestamp: now,
				action: "created",
			},
			modifiedBy: [],
		}

		// 写入节点
		this.data.nodes[id] = node
		this.data.shortIdIndex[shortId] = id

		// 挂到父节点或根列表
		if (resolvedParentId) {
			const parent = this.data.nodes[resolvedParentId]
			if (parent) {
				parent.childrenIds.push(id)
			}
		} else {
			this.data.rootIds.push(id)
		}

		this.dirty = true
		return node
	}

	/**
	 * 更新节点内容/状态。nodeId 支持 shortId。
	 */
	updateNode(
		nodeId: string,
		updates: { content?: string; status?: IntentNodeStatus },
		taskId: string,
	): IntentNode | null {
		const resolvedId = this.resolveId(nodeId)
		if (!resolvedId) {
			return null
		}

		const node = this.data.nodes[resolvedId]
		if (!node) {
			return null
		}

		const now = new Date().toISOString()
		const changes: string[] = []

		if (updates.content !== undefined) {
			node.content = updates.content
			changes.push("content")
		}
		if (updates.status !== undefined) {
			node.status = updates.status
			changes.push(`status→${updates.status}`)
		}

		if (changes.length > 0) {
			node.modifiedBy.push({
				taskId,
				timestamp: now,
				action: `updated: ${changes.join(", ")}`,
			})
			this.modificationCounter++
			this.nodeLastModOrder.set(resolvedId, this.modificationCounter)
			this.dirty = true
		}

		return node
	}

	/**
	 * 绑定代码变更到节点。nodeId 支持 shortId。
	 */
	bindCode(nodeId: string, binding: IntentCodeBinding, taskId: string): IntentNode | null {
		const resolvedId = this.resolveId(nodeId)
		if (!resolvedId) {
			return null
		}

		const node = this.data.nodes[resolvedId]
		if (!node) {
			return null
		}

		node.codeBindings.push(binding)
		node.modifiedBy.push({
			taskId,
			timestamp: new Date().toISOString(),
			action: `bound commit ${binding.commitHash.substring(0, 7)}`,
		})

		this.dirty = true
		return node
	}

	/**
	 * 剪枝：将节点及其所有子孙标记为 pruned。nodeId 支持 shortId。
	 */
	pruneSubtree(nodeId: string, taskId: string, reason?: string): string[] {
		const resolvedId = this.resolveId(nodeId)
		if (!resolvedId) {
			return []
		}

		const pruned: string[] = []
		const queue = [resolvedId]

		while (queue.length > 0) {
			const id = queue.shift()!
			const node = this.data.nodes[id]
			if (!node || node.status === "pruned") {
				continue
			}

			node.status = "pruned"
			node.modifiedBy.push({
				taskId,
				timestamp: new Date().toISOString(),
				action: reason ? `pruned: ${reason}` : "pruned",
			})
			pruned.push(node.shortId)
			queue.push(...node.childrenIds)
		}

		this.dirty = true
		return pruned
	}

	// ========================================================================
	// 查询
	// ========================================================================

	/**
	 * 获取节点。nodeId 支持 shortId。
	 */
	getNode(nodeId: string): IntentNode | undefined {
		const resolvedId = this.resolveId(nodeId)
		if (!resolvedId) {
			return undefined
		}
		return this.data.nodes[resolvedId]
	}

	getRootNodes(): IntentNode[] {
		return this.data.rootIds.map((id) => this.data.nodes[id]).filter((n): n is IntentNode => n !== undefined)
	}

	getChildren(nodeId: string): IntentNode[] {
		const resolvedId = this.resolveId(nodeId)
		if (!resolvedId) {
			return []
		}
		const node = this.data.nodes[resolvedId]
		if (!node) {
			return []
		}
		return node.childrenIds.map((id) => this.data.nodes[id]).filter((n): n is IntentNode => n !== undefined)
	}

	/**
	 * 获取节点的所有 commit hash（包括子孙节点）。nodeId 支持 shortId。
	 */
	getSubtreeCommits(nodeId: string): IntentCodeBinding[] {
		const resolvedId = this.resolveId(nodeId)
		if (!resolvedId) {
			return []
		}

		const bindings: IntentCodeBinding[] = []
		const queue = [resolvedId]

		while (queue.length > 0) {
			const id = queue.shift()!
			const node = this.data.nodes[id]
			if (!node) {
				continue
			}
			bindings.push(...node.codeBindings)
			queue.push(...node.childrenIds)
		}

		return bindings
	}

	/**
	 * 获取当前活跃的 in_progress 节点（最近修改的优先）。
	 * 使用内存中的修改计数器确保排序稳定（时间戳可能相同）。
	 */
	getCurrentActiveNode(): IntentNode | null {
		const inProgress = Object.values(this.data.nodes)
			.filter((n) => n.status === "in_progress")
			.sort((a, b) => {
				const aOrder = this.nodeLastModOrder.get(a.id) ?? 0
				const bOrder = this.nodeLastModOrder.get(b.id) ?? 0
				return bOrder - aOrder // 最近修改的在前
			})
		return inProgress[0] ?? null
	}

	/**
	 * 获取所有 active 节点（非 pruned/superseded）
	 */
	getActiveNodes(): IntentNode[] {
		return Object.values(this.data.nodes).filter((n) => n.status !== "pruned" && n.status !== "superseded")
	}

	/**
	 * 判断树是否为空
	 */
	isEmpty(): boolean {
		return this.data.rootIds.length === 0
	}

	// ========================================================================
	// 摘要生成（用于注入 prompt）
	// ========================================================================

	/**
	 * 生成意图树的文本摘要，用于注入用户消息。
	 * 只包含 active 节点，树状缩进展示层级关系。
	 * shortId 用方括号包裹方便模型引用。
	 */
	toSummary(): string {
		if (this.isEmpty()) {
			return ""
		}

		const currentNode = this.getCurrentActiveNode()
		const lines: string[] = []
		for (const rootId of this.data.rootIds) {
			this.renderNode(rootId, 0, lines, currentNode?.id)
		}
		return lines.join("\n")
	}

	private renderNode(nodeId: string, depth: number, lines: string[], currentId?: string): void {
		const node = this.data.nodes[nodeId]
		if (!node) {
			return
		}

		const indent = "  ".repeat(depth)
		const statusIcon = this.statusIcon(node.status)
		const codeRef = node.codeBindings.length > 0 ? ` [${node.codeBindings.length} commit(s)]` : ""
		const currentMarker = node.id === currentId ? " ← CURRENT" : ""

		lines.push(`${indent}[${node.shortId}] ${statusIcon} ${node.content}${codeRef}${currentMarker}`)

		// 只展开 active 节点的子树
		if (node.status !== "pruned" && node.status !== "superseded") {
			for (const childId of node.childrenIds) {
				this.renderNode(childId, depth + 1, lines, currentId)
			}
		}
	}

	private statusIcon(status: IntentNodeStatus): string {
		switch (status) {
			case "planned":
				return "○"
			case "in_progress":
				return "◐"
			case "done":
				return "●"
			case "superseded":
				return "◇"
			case "pruned":
				return "✕"
		}
	}

	// ========================================================================
	// 内部数据访问（用于测试）
	// ========================================================================

	/** @internal */
	getData(): IntentTreeData {
		return this.data
	}
}
