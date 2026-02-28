/**
 * Intent Tree - 意图树类型定义
 *
 * 意图树是 TodoList 的高级形态：每个节点可溯源、与代码绑定、跨对话持久化。
 * 树状结构天然区分"约束"（上层节点）和"约束的实现"（下层节点），
 * 防止 assistant 把历史实现误当约束，导致 patch 堆叠。
 */

/**
 * 意图节点类型（GOAI）：
 *
 * 约束层（goal/outcome）：描述"要什么"，失败不放弃
 * - goal: 用户的最终目标（稳定、主观、方向性）
 * - objective: 可验证的期望结果（可能被修正、只覆盖 goal 的一部分）
 *
 * 实现层（approach/impl）：描述"怎么做"，失败可替换
 * - approach: 可替换的实现手段（失败了换一个）
 * - impl: 原子代码变更（≈ 一个 commit）
 */
export type IntentNodeType = "goal" | "objective" | "approach" | "impl"

/**
 * 意图节点状态：
 * - planned: 已规划，尚未开始
 * - in_progress: 正在实现
 * - done: 已完成
 * - superseded: 被新 approach/impl 替代
 * - pruned: 已废弃/剪枝
 */
export type IntentNodeStatus = "planned" | "in_progress" | "done" | "superseded" | "pruned"

/**
 * 代码绑定信息：将意图节点与具体代码变更关联
 */
export interface IntentCodeBinding {
	/** git commit hash */
	commitHash: string
	/** commit message */
	commitMessage: string
	/** 涉及的文件路径 */
	files: string[]
	/** 变更摘要（增删行数等） */
	diffSummary?: string
	/** 绑定时间 */
	timestamp: string
}

/**
 * 溯源信息：记录节点的创建/修改来源
 */
export interface IntentProvenance {
	/** 对话/任务 ID */
	taskId: string
	/** 时间戳 */
	timestamp: string
	/** 操作描述 */
	action: string
}

/**
 * 意图树节点
 */
export interface IntentNode {
	/** 内部唯一标识（UUID，用于持久化） */
	id: string
	/** 语义化短 ID，对模型友好（如 G1, O1.1, A1.1.1, I1.1.1.1） */
	shortId: string
	/** 节点类型 */
	type: IntentNodeType
	/** 自然语言描述 */
	content: string
	/** 节点状态 */
	status: IntentNodeStatus
	/** 父节点 ID（根节点为 null） */
	parentId: string | null
	/** 子节点 ID 列表 */
	childrenIds: string[]
	/**
	 * 可证伪的假设：说明本节点与父节点之间的因果关系（源自 Theory of Change）。
	 * 例如 outcome 节点："假设完成此 outcome 能推进 goal"；
	 * approach 节点："假设此手段能达成 outcome"。
	 * 当假设被证伪时，该节点应被 superseded 或 pruned。
	 */
	assumption?: string
	/** 代码绑定列表（一个节点可能有多次 commit） */
	codeBindings: IntentCodeBinding[]
	/** 创建信息 */
	createdBy: IntentProvenance
	/** 修改历史 */
	modifiedBy: IntentProvenance[]
	/** 历史最大子节点序号（用于避免 shortId 复用） */
	maxChildIndex?: number
}

/**
 * 意图树持久化格式（JSON 文件的根结构）
 */
export interface IntentTreeData {
	/** 格式版本，用于未来迁移 */
	version: 1
	/** 所有节点，以 id 为 key */
	nodes: Record<string, IntentNode>
	/** 根节点 ID 列表（支持多个顶层目标） */
	rootIds: string[]
	/** shortId → id 的映射，用于快速查找 */
	shortIdIndex: Record<string, string>
	/** 根节点的历史最大子节点序号（用于避免 shortId 复用） */
	rootMaxChildIndex?: number
}

/**
 * 联动状态变更记录：记录因规则触发而自动更新的节点
 */
export interface CascadeUpdate {
	/** 被联动更新的节点 shortId */
	shortId: string
	/** 变更前的状态 */
	oldStatus: IntentNodeStatus
	/** 变更后的状态 */
	newStatus: IntentNodeStatus
	/** 触发原因 */
	reason: string
}

/**
 * addNode 的返回结果，包含类型调整信息
 */
export interface AddNodeResult {
	/** 创建的节点 */
	node: IntentNode
	/** 是否发生了类型调整 */
	typeAdjusted: boolean
	/** 原始请求的类型（如果发生了调整） */
	requestedType?: IntentNodeType
	/** 调整原因（如果发生了调整） */
	adjustmentReason?: string
	/** 联动状态变更列表（规则1：父链 done→planned） */
	cascadeUpdates: CascadeUpdate[]
}

/**
 * updateNode 的返回结果，包含联动变更和警告
 */
export interface UpdateNodeResult {
	/** 更新后的节点 */
	node: IntentNode
	/** 联动状态变更列表 */
	cascadeUpdates: CascadeUpdate[]
	/** 警告信息（如：标记完成时存在未完成子项） */
	warnings: string[]
}

/**
 * reparentNode 的返回结果
 */
export interface ReparentResult {
	success: boolean
	node?: IntentNode
	/** 类型是否被调整 */
	typeAdjusted?: boolean
	requestedType?: IntentNodeType
	adjustmentReason?: string
	/** shortId 变化映射 */
	shortIdChanges: Map<string, { old: string; new: string }>
	/** 错误信息（如果失败） */
	error?: string
}
