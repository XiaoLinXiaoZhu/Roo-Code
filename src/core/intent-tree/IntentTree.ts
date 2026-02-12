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

import type {
	IntentNode,
	IntentNodeType,
	IntentNodeStatus,
	IntentCodeBinding,
	IntentTreeData,
	AddNodeResult,
	ReparentResult,
} from "./types"

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

/**
 * 类型层级顺序：goal → subgoal → path → impl
 * 用于自动顺延不合法的类型
 */
const TYPE_ORDER: IntentNodeType[] = ["goal", "subgoal", "path", "impl"]

/**
 * 根据父节点类型，调整子节点类型（自动顺延）
 * 规则：子节点类型不能与父节点相同或更高（goal 最高，impl 最低）
 * - goal 下创建 goal → subgoal
 * - subgoal 下创建 goal/subgoal → path
 * - path 下创建 goal/subgoal/path → impl
 * - impl 下可以创建 impl（表示 patch）
 *
 * @returns 调整后的类型和调整原因（如果发生了调整）
 */
function adjustChildType(
	requestedType: IntentNodeType,
	parentType: IntentNodeType | null,
): {
	type: IntentNodeType
	adjusted: boolean
	reason?: string
} {
	if (!parentType) {
		// 根节点：任何类型都允许
		return { type: requestedType, adjusted: false }
	}

	const parentIndex = TYPE_ORDER.indexOf(parentType)
	const requestedIndex = TYPE_ORDER.indexOf(requestedType)

	// 如果请求的类型层级 <= 父节点层级，顺延到父节点的下一级
	// 特例：impl 下可以创建 impl
	if (requestedIndex <= parentIndex && parentType !== "impl") {
		const adjustedType = TYPE_ORDER[parentIndex + 1]
		return {
			type: adjustedType,
			adjusted: true,
			reason: `子节点类型不能高于或等于父节点类型 (${parentType})，已自动调整为 ${adjustedType}`,
		}
	}

	return { type: requestedType, adjusted: false }
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
	 * - 根节点：{前缀}{序号}，如 G1, G2（使用递增计数器避免复用）
	 * - 子节点：{自己的类型前缀}{父节点序号}.{子序号}，如 S1.1, P1.1.1
	 *   - 前缀是自己的类型（G/S/P/I）
	 *   - 序号继承父节点的层级结构
	 */
	private generateShortId(type: IntentNodeType, parentId: string | null): string {
		const prefix = TYPE_PREFIX[type]

		if (!parentId) {
			// 根节点：使用递增计数器（按类型分别计数）
			const maxIndex = this.data.rootMaxChildIndex ?? 0
			this.data.rootMaxChildIndex = maxIndex + 1
			return `${prefix}${maxIndex + 1}`
		}

		const parent = this.data.nodes[parentId]
		if (!parent) {
			// 父节点不存在，当作根节点处理
			const maxIndex = this.data.rootMaxChildIndex ?? 0
			this.data.rootMaxChildIndex = maxIndex + 1
			return `${prefix}${maxIndex + 1}`
		}

		// 子节点：使用自己的类型前缀 + 父节点的层级序号 + 子序号
		// 例如：G1 下的第一个 subgoal 是 S1.1，G1 下的第二个 subgoal 是 S1.2
		const maxChildIndex = parent.maxChildIndex ?? 0
		parent.maxChildIndex = maxChildIndex + 1

		// 提取父节点 shortId 中的数字部分（去掉类型前缀）
		const parentNumericPart = parent.shortId.replace(/^[GSPI]/, "")
		return `${prefix}${parentNumericPart}.${maxChildIndex + 1}`
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
	resolveId(idOrShortId: string | undefined | null): string | null {
		if (!idOrShortId) {
			return null
		}
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
	 * 添加节点，返回包含类型调整信息的结果
	 * @throws Error 当指定的 parentId 不存在时抛出错误
	 */
	addNode(params: { type: IntentNodeType; content: string; parentId: string | null; taskId: string }): AddNodeResult {
		const id = uuidv4()
		const now = new Date().toISOString()

		// 解析 parentId（支持 shortId）
		let resolvedParentId: string | null = null
		let parentType: IntentNodeType | null = null
		if (params.parentId) {
			resolvedParentId = this.resolveId(params.parentId)
			if (!resolvedParentId) {
				// 不再静默降级，而是抛出错误让调用方处理
				throw new Error(
					`Parent node '${params.parentId}' not found. Available nodes: ${this.getAvailableNodesList()}`,
				)
			}
			const parent = this.data.nodes[resolvedParentId]
			if (parent) {
				parentType = parent.type
			}
		}

		// 根据父节点类型调整子节点类型（自动顺延）
		const typeAdjustment = adjustChildType(params.type, parentType)

		const shortId = this.generateShortId(typeAdjustment.type, resolvedParentId)

		const node: IntentNode = {
			id,
			shortId,
			type: typeAdjustment.type,
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

		return {
			node,
			typeAdjusted: typeAdjustment.adjusted,
			requestedType: typeAdjustment.adjusted ? params.type : undefined,
			adjustmentReason: typeAdjustment.reason,
		}
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

		// 忽略空字符串，防止意外清空内容
		if (updates.content !== undefined && updates.content !== "") {
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
	 * @returns 更新后的节点，如果节点不存在或 binding 无效则返回 null
	 */
	bindCode(nodeId: string, binding: IntentCodeBinding, taskId: string): IntentNode | null {
		// 校验 binding 参数
		if (!binding || !binding.commitHash || binding.commitHash.trim() === "") {
			console.warn("[IntentTree] bindCode: invalid binding - commitHash is required")
			return null
		}

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

	/**
	 * 获取所有可用节点的简要列表（用于错误反馈）
	 */
	getAvailableNodesList(): string {
		const nodes = this.getActiveNodes()
		if (nodes.length === 0) {
			return "No nodes available."
		}
		return nodes
			.map((n) => `${n.shortId} (${n.type}: ${n.content.substring(0, 30)}${n.content.length > 30 ? "..." : ""})`)
			.join(", ")
	}

	// ========================================================================
	// 结构重组操作
	// ========================================================================

	/**
	 * 重新挂载节点到新的父节点
	 */
	reparentNode(nodeId: string, newParentId: string | null, taskId: string): ReparentResult {
		const resolvedId = this.resolveId(nodeId)
		if (!resolvedId) {
			return {
				success: false,
				shortIdChanges: new Map(),
				error: `Node '${nodeId}' not found. Available nodes: ${this.getAvailableNodesList()}`,
			}
		}

		const node = this.data.nodes[resolvedId]
		if (!node) {
			return {
				success: false,
				shortIdChanges: new Map(),
				error: `Node '${nodeId}' not found.`,
			}
		}

		// 解析新父节点
		let resolvedNewParentId: string | null = null
		let newParentType: IntentNodeType | null = null
		if (newParentId) {
			resolvedNewParentId = this.resolveId(newParentId)
			if (!resolvedNewParentId) {
				return {
					success: false,
					shortIdChanges: new Map(),
					error: `New parent '${newParentId}' not found. Available nodes: ${this.getAvailableNodesList()}`,
				}
			}
			const newParent = this.data.nodes[resolvedNewParentId]
			if (newParent) {
				newParentType = newParent.type
			}

			// 检查是否会形成循环（新父节点不能是当前节点的子孙）
			if (this.isDescendant(resolvedNewParentId, resolvedId)) {
				return {
					success: false,
					shortIdChanges: new Map(),
					error: `Cannot reparent: '${newParentId}' is a descendant of '${nodeId}'.`,
				}
			}
		}

		const oldParentId = node.parentId

		// 1. 从旧父节点移除
		if (oldParentId) {
			const oldParent = this.data.nodes[oldParentId]
			if (oldParent) {
				oldParent.childrenIds = oldParent.childrenIds.filter((id) => id !== resolvedId)
			}
		} else {
			this.data.rootIds = this.data.rootIds.filter((id) => id !== resolvedId)
		}

		// 2. 添加到新父节点
		if (resolvedNewParentId) {
			const newParent = this.data.nodes[resolvedNewParentId]
			if (newParent) {
				newParent.childrenIds.push(resolvedId)
			}
			node.parentId = resolvedNewParentId
		} else {
			this.data.rootIds.push(resolvedId)
			node.parentId = null
		}

		// 3. 检查并调整类型
		const oldType = node.type
		const typeAdjustment = adjustChildType(node.type, newParentType)
		let typeAdjusted = false
		let adjustmentReason: string | undefined

		if (typeAdjustment.adjusted) {
			node.type = typeAdjustment.type
			typeAdjusted = true
			adjustmentReason = typeAdjustment.reason
		}

		// 4. 重新计算 shortId
		const shortIdChanges = this.recalculateShortIds()

		// 5. 记录修改历史
		node.modifiedBy.push({
			taskId,
			timestamp: new Date().toISOString(),
			action: `reparented from ${oldParentId ?? "root"} to ${resolvedNewParentId ?? "root"}${typeAdjusted ? `, type ${oldType}→${node.type}` : ""}`,
		})

		this.dirty = true

		return {
			success: true,
			node,
			typeAdjusted,
			requestedType: typeAdjusted ? oldType : undefined,
			adjustmentReason,
			shortIdChanges,
		}
	}

	/**
	 * 检查 potentialDescendant 是否是 ancestorId 的子孙节点
	 */
	private isDescendant(potentialDescendantId: string, ancestorId: string): boolean {
		const queue = [ancestorId]
		while (queue.length > 0) {
			const id = queue.shift()!
			const node = this.data.nodes[id]
			if (!node) continue
			for (const childId of node.childrenIds) {
				if (childId === potentialDescendantId) {
					return true
				}
				queue.push(childId)
			}
		}
		return false
	}

	/**
	 * 重新计算所有节点的 shortId
	 * 返回 oldShortId -> newShortId 的映射
	 */
	recalculateShortIds(): Map<string, { old: string; new: string }> {
		const changes = new Map<string, { old: string; new: string }>()

		// 清空索引
		this.data.shortIdIndex = {}

		// 重置根节点计数器
		const typeCounters: Record<string, number> = {}

		// 按 DFS 顺序重新分配 shortId
		for (const rootId of this.data.rootIds) {
			const node = this.data.nodes[rootId]
			if (!node) continue

			const prefix = TYPE_PREFIX[node.type]
			typeCounters[prefix] = (typeCounters[prefix] ?? 0) + 1
			const newShortId = `${prefix}${typeCounters[prefix]}`

			if (node.shortId !== newShortId) {
				changes.set(node.id, { old: node.shortId, new: newShortId })
			}
			node.shortId = newShortId
			this.data.shortIdIndex[newShortId] = node.id

			this.recalculateChildrenShortIds(node, changes)
		}

		// 同步计数器，使后续 addNode 的增量逻辑与重建后的状态一致。
		// rootMaxChildIndex 是全局的（不区分类型），设为根节点总数。
		this.data.rootMaxChildIndex = this.data.rootIds.length

		return changes
	}

	private recalculateChildrenShortIds(parent: IntentNode, changes: Map<string, { old: string; new: string }>): void {
		let childIndex = 0
		for (const childId of parent.childrenIds) {
			const child = this.data.nodes[childId]
			if (!child) continue

			childIndex++
			// 使用子节点自己的类型前缀 + 父节点的数字部分 + 子序号
			const prefix = TYPE_PREFIX[child.type]
			const parentNumericPart = parent.shortId.replace(/^[GSPI]/, "")
			const newShortId = `${prefix}${parentNumericPart}.${childIndex}`

			if (child.shortId !== newShortId) {
				changes.set(child.id, { old: child.shortId, new: newShortId })
			}
			child.shortId = newShortId
			this.data.shortIdIndex[newShortId] = child.id

			this.recalculateChildrenShortIds(child, changes)
		}

		// 同步父节点的 maxChildIndex，使后续 addNode 从正确的基线递增
		parent.maxChildIndex = childIndex
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
