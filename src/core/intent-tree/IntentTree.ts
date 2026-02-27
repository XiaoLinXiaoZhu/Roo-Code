/**
 * IntentTree - 意图树核心类
 *
 * 职责：
 * - 管理意图节点的增删改查
 * - 语义化短 ID（G1, O1.1, A1.1.1）方便模型引用
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
	CascadeUpdate,
	UpdateNodeResult,
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
	objective: "O",
	approach: "A",
	impl: "I",
}

/**
 * 类型层级顺序：goal → objective → approach → impl
 * 用于自动顺延不合法的类型
 */
const TYPE_ORDER: IntentNodeType[] = ["goal", "objective", "approach", "impl"]

/**
 * 根据父节点类型，调整子节点类型（自动顺延）
 * 规则：子节点类型不能与父节点相同或更高（goal 最高，impl 最低）
 * - goal 下创建 goal → objective
 * - objective 下创建 goal → approach（但 objective 下可以创建 objective，表示更细粒度的分解）
 * - approach 下创建 goal/objective/approach → impl
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
	// 特例：impl 下可以创建 impl（表示 patch）
	// 特例：objective 下可以创建 objective（表示更细粒度的分解）
	if (
		requestedIndex <= parentIndex &&
		parentType !== "impl" &&
		!(parentType === "objective" && requestedType === "objective")
	) {
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
		// 兼容旧数据：补全节点中可能缺失的数组字段
		for (const node of Object.values(this.data.nodes)) {
			if (!node.modifiedBy) node.modifiedBy = []
			if (!node.childrenIds) node.childrenIds = []
			if (!node.codeBindings) node.codeBindings = []
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
	 * - 子节点：{自己的类型前缀}{父节点序号}.{子序号}，如 O1.1, A1.1.1
	 *   - 前缀是自己的类型（G/O/A/I）
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
		// 例如：G1 下的第一个 objective 是 O1.1，G1 下的第二个 objective 是 O1.2
		const maxChildIndex = parent.maxChildIndex ?? 0
		parent.maxChildIndex = maxChildIndex + 1

		// 提取父节点 shortId 中的数字部分（去掉类型前缀）
		const parentNumericPart = parent.shortId.replace(/^[GOAI]/, "")
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

		// 规则1：添加子节点后，将父链上 done 的祖先回退为 planned
		const cascadeUpdates = this.cascadeParentPlannedOnAdd(id, params.taskId)

		return {
			node,
			typeAdjusted: typeAdjustment.adjusted,
			requestedType: typeAdjustment.adjusted ? params.type : undefined,
			adjustmentReason: typeAdjustment.reason,
			cascadeUpdates,
		}
	}

	/**
	 * 更新节点内容/状态。nodeId 支持 shortId。
	 * 返回 UpdateNodeResult，包含联动变更和警告。
	 */
	updateNode(
		nodeId: string,
		updates: { content?: string; status?: IntentNodeStatus },
		taskId: string,
	): UpdateNodeResult | null {
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

		// 状态联动
		let cascadeUpdates: CascadeUpdate[] = []
		let warnings: string[] = []

		if (updates.status === "done") {
			// 规则4：检查未完成子项，生成警告
			warnings = this.checkIncompleteChildren(resolvedId)
			// 规则2：递归向上冒泡完成
			cascadeUpdates = this.cascadeDoneUpward(resolvedId, taskId)
		} else if (updates.status === "in_progress") {
			// 规则3：递归向上传播进行中
			cascadeUpdates = this.cascadeInProgressUpward(resolvedId, taskId)
		}

		return { node, cascadeUpdates, warnings }
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
	// 状态联动（cascade）
	// ========================================================================

	/**
	 * 规则1：添加子节点后，将父链上所有 done 状态的祖先回退为 planned。
	 * 理由：如果一个节点已完成但又新增了子任务，说明它实际上还没完成。
	 */
	private cascadeParentPlannedOnAdd(childNodeId: string, taskId: string): CascadeUpdate[] {
		const updates: CascadeUpdate[] = []
		const child = this.data.nodes[childNodeId]
		if (!child?.parentId) return updates

		let currentId: string | null = child.parentId
		while (currentId) {
			const ancestor: IntentNode | undefined = this.data.nodes[currentId]
			if (!ancestor) break

			if (ancestor.status === "done") {
				const oldStatus = ancestor.status
				ancestor.status = "planned"
				ancestor.modifiedBy.push({
					taskId,
					timestamp: new Date().toISOString(),
					action: `cascade: done→planned (child added: ${child.shortId})`,
				})
				updates.push({
					shortId: ancestor.shortId,
					oldStatus,
					newStatus: "planned",
					reason: `子节点 ${child.shortId} 被添加，父项重新标记为未完成`,
				})
			}

			currentId = ancestor.parentId
		}

		if (updates.length > 0) this.dirty = true
		return updates
	}

	/**
	 * 规则2：标记完成后，递归向上冒泡——如果父节点的所有子节点都已终结，则父节点也标记为 done。
	 * "已终结"包括 done、pruned、superseded。
	 */
	private cascadeDoneUpward(nodeId: string, taskId: string): CascadeUpdate[] {
		const updates: CascadeUpdate[] = []
		const node = this.data.nodes[nodeId]
		if (!node?.parentId) return updates

		let currentParentId: string | null = node.parentId
		while (currentParentId) {
			const parent: IntentNode | undefined = this.data.nodes[currentParentId]
			if (!parent) break

			// 如果父节点已经是 pruned 或 superseded，不参与冒泡
			if (parent.status === "pruned" || parent.status === "superseded") break

			// 检查所有子节点是否都已终结
			const allChildrenTerminated = parent.childrenIds.every((cid: string) => {
				const child = this.data.nodes[cid]
				if (!child) return true
				return child.status === "done" || child.status === "pruned" || child.status === "superseded"
			})

			if (allChildrenTerminated && parent.status !== "done") {
				const oldStatus = parent.status
				parent.status = "done"
				parent.modifiedBy.push({
					taskId,
					timestamp: new Date().toISOString(),
					action: `cascade: ${oldStatus}→done (all children terminated)`,
				})
				updates.push({
					shortId: parent.shortId,
					oldStatus,
					newStatus: "done",
					reason: `所有子节点已终结，自动标记为完成`,
				})
				// 继续向上检查
				currentParentId = parent.parentId
			} else {
				break
			}
		}

		if (updates.length > 0) this.dirty = true
		return updates
	}

	/**
	 * 规则3：标记进行中后，递归向上传播——将父链上 planned 和 done 的祖先都设为 in_progress。
	 * done→in_progress 表示"重新打开"语义。
	 */
	private cascadeInProgressUpward(nodeId: string, taskId: string): CascadeUpdate[] {
		const updates: CascadeUpdate[] = []
		const node = this.data.nodes[nodeId]
		if (!node?.parentId) return updates

		let currentId: string | null = node.parentId
		while (currentId) {
			const parent: IntentNode | undefined = this.data.nodes[currentId]
			if (!parent) break

			// pruned/superseded 不参与传播
			if (parent.status === "pruned" || parent.status === "superseded") break

			if (parent.status === "planned" || parent.status === "done") {
				const oldStatus = parent.status
				parent.status = "in_progress"
				parent.modifiedBy.push({
					taskId,
					timestamp: new Date().toISOString(),
					action: `cascade: ${oldStatus}→in_progress (child ${node.shortId} started)`,
				})
				updates.push({
					shortId: parent.shortId,
					oldStatus,
					newStatus: "in_progress",
					reason: `子节点 ${node.shortId} 进入进行中，父项同步更新`,
				})
			}

			// 如果父节点已经是 in_progress，仍然继续向上检查（更上层可能是 planned/done）
			currentId = parent.parentId
		}

		if (updates.length > 0) this.dirty = true
		return updates
	}

	/**
	 * 规则4：检查节点是否有未完成的子项，返回警告信息。
	 * 不阻止操作，仅生成警告。
	 */
	private checkIncompleteChildren(nodeId: string): string[] {
		const warnings: string[] = []
		const node = this.data.nodes[nodeId]
		if (!node || node.childrenIds.length === 0) return warnings

		const incompleteChildren = node.childrenIds
			.map((cid) => this.data.nodes[cid])
			.filter((child): child is IntentNode => {
				if (!child) return false
				return child.status === "planned" || child.status === "in_progress"
			})

		if (incompleteChildren.length > 0) {
			const childList = incompleteChildren.map((c) => `${c.shortId}(${c.status})`).join(", ")
			warnings.push(`Warning: 节点存在 ${incompleteChildren.length} 个未完成的子项: ${childList}`)
		}

		return warnings
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
			const parentNumericPart = parent.shortId.replace(/^[GOAI]/, "")
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
	 * 生成意图树的 XML 摘要，用于注入用户消息。
	 * 使用类型作为标签名（goal/objective/approach/impl），显式属性标注状态。
	 * 只包含 active 节点，树状缩进展示层级关系。
	 */
	toSummary(): string {
		if (this.isEmpty()) {
			return ""
		}

		const currentNode = this.getCurrentActiveNode()
		const lines: string[] = []
		for (const rootId of this.data.rootIds) {
			this.renderNodeXml(rootId, 0, lines, currentNode?.id)
		}
		return lines.join("\n")
	}

	private renderNodeXml(nodeId: string, depth: number, lines: string[], currentId?: string): void {
		const node = this.data.nodes[nodeId]
		if (!node) {
			return
		}

		const indent = "  ".repeat(depth)
		const tagName = node.type
		const statusIcon = this.statusIcon(node.status)
		const isCurrent = node.id === currentId
		const hasCommits = node.codeBindings.length > 0

		// 构建属性字符串
		const attrs = [`id="${node.shortId}"`, `status="${statusIcon}"`]
		if (hasCommits) {
			attrs.push(`commits="${node.codeBindings.length}"`)
		}
		if (isCurrent) {
			attrs.push('current="true"')
		}

		// 清洗内容，防止与标签名冲突
		const content = this.sanitizeContent(node.content)

		// 检查是否有子节点需要渲染
		const hasActiveChildren =
			node.status !== "pruned" && node.status !== "superseded" && node.childrenIds.length > 0

		if (hasActiveChildren) {
			// 有子节点：开标签 + 内容 + 子节点 + 闭标签
			lines.push(`${indent}<${tagName} ${attrs.join(" ")}>${content}`)
			for (const childId of node.childrenIds) {
				this.renderNodeXml(childId, depth + 1, lines, currentId)
			}
			lines.push(`${indent}</${tagName}>`)
		} else {
			// 无子节点：自闭合标签
			lines.push(`${indent}<${tagName} ${attrs.join(" ")}>${content}</${tagName}>`)
		}
	}

	/**
	 * 清洗内容，防止与 XML 标签名冲突。
	 * 只处理真正危险的模式（与 goal/objective/approach/impl 标签冲突）。
	 */
	private sanitizeContent(content: string): string {
		return content
			.replace(/<\/?(?:goal|outcome|approach|impl)\b[^>]*>/gi, (match) => {
				// 将 < 和 > 替换为 ‹ 和 ›，保持视觉相似但不会解析为标签
				return match.replace(/</g, "‹").replace(/>/g, "›")
			})
			.replace(/<\/?(?:goal|outcome|approach|impl)\b/gi, (match) => {
				// 处理没有闭合 > 的情况（如 </goal 后面没有 >）
				return match.replace(/</g, "‹")
			})
	}

	private statusIcon(status: IntentNodeStatus): string {
		switch (status) {
			case "planned":
				return "📋"
			case "in_progress":
				return "🔧"
			case "done":
				return "✅"
			case "superseded":
				return "🔄"
			case "pruned":
				return "❌"
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
