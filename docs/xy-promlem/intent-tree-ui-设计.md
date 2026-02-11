# Intent Tree 前端 UI 设计文档

> 本文档描述 Intent Tree 工具调用在前端的可视化展示方案。

## 一、设计目标

### 1.1 核心需求

让用户能够：

1. **看到意图树的整体结构** - 理解当前任务的目标层级
2. **追踪工具调用过程** - 每次 add/update/prune 等操作的实时反馈
3. **理解节点间的关系** - goal → subgoal → path → impl 的层级关系
4. **查看代码绑定** - 哪些 commit 与哪个意图节点关联

### 1.2 设计原则

- **复用现有架构**：基于 `ToolUseBlock` 组件体系
- **渐进式展示**：默认折叠，按需展开详情
- **状态可视化**：用图标/颜色区分节点类型和状态
- **操作反馈**：类型调整、shortId 变化等信息要显式展示

---

## 二、组件架构

```
IntentTreeToolBlock (工具调用容器)
├── IntentTreeDisplay (树状结构展示)
│   └── IntentNodeItem (单个节点)
│       ├── NodeTypeIcon (类型图标)
│       ├── NodeStatusBadge (状态徽章)
│       ├── NodeContent (内容文本)
│       └── CodeBindingsList (代码绑定列表)
├── AddIntentResult (add_intent 结果)
├── UpdateIntentResult (update_intent 结果)
├── PruneIntentResult (prune_intent 结果)
├── CommitIntentResult (commit_intent 结果)
└── RestructureIntentResult (restructure_intent 结果)
```

---

## 三、视觉设计

### 3.1 节点类型图标与颜色

| 类型    | 图标                      | 颜色                     | 含义         |
| ------- | ------------------------- | ------------------------ | ------------ |
| goal    | 🎯 / `codicon-target`     | `--vscode-charts-purple` | 最终目标     |
| subgoal | 📍 / `codicon-milestone`  | `--vscode-charts-blue`   | 可验证子目标 |
| path    | 🛤️ / `codicon-git-branch` | `--vscode-charts-orange` | 实现路径     |
| impl    | ⚙️ / `codicon-gear`       | `--vscode-charts-green`  | 具体实现     |

### 3.2 节点状态样式

| 状态        | 图标 | 样式              | 含义   |
| ----------- | ---- | ----------------- | ------ |
| planned     | ○    | 空心圆，灰色文字  | 已规划 |
| in_progress | ◐    | 半填充，黄色高亮  | 进行中 |
| done        | ●    | 实心圆，绿色      | 已完成 |
| superseded  | ◇    | 菱形，删除线      | 被替代 |
| pruned      | ✕    | 叉号，淡化+删除线 | 已废弃 |

### 3.3 shortId 徽章

```
[G1] [S1.1] [P1.1.1] [I1.1.1.1]
```

- 使用 monospace 字体
- 背景色与节点类型对应
- 圆角矩形样式

---

## 四、各工具的 UI 展示

### 4.1 `add_intent` - 添加节点

**展示内容**：

- 新创建的节点信息
- 类型调整提示（如果发生）
- 在树中的位置高亮

**UI 示例**：

```
┌─────────────────────────────────────────────────┐
│ 🎯 Add Intent                                   │
├─────────────────────────────────────────────────┤
│ Created: [S1.1] 减少数据库查询次数              │
│ Parent:  [G1] 优化系统性能                      │
│                                                 │
│ ⚠️ Type adjusted: goal → subgoal               │
│    Reason: 子节点类型不能高于父节点类型         │
└─────────────────────────────────────────────────┘
```

**组件 Props**：

```typescript
interface AddIntentResultProps {
	node: IntentNode
	parentNode?: IntentNode
	typeAdjusted: boolean
	requestedType?: IntentNodeType
	adjustmentReason?: string
}
```

### 4.2 `update_intent` - 更新节点

**展示内容**：

- 更新的节点
- 变更的字段（content/status）
- 变更前后对比

**UI 示例**：

```
┌─────────────────────────────────────────────────┐
│ ✏️ Update Intent                                │
├─────────────────────────────────────────────────┤
│ Node: [P1.1.1] 使用 Redis 缓存                  │
│                                                 │
│ Changes:                                        │
│   status: planned → in_progress                 │
│   content: "使用缓存" → "使用 Redis 缓存"       │
└─────────────────────────────────────────────────┘
```

**组件 Props**：

```typescript
interface UpdateIntentResultProps {
	node: IntentNode
	changes: {
		field: "content" | "status"
		oldValue: string
		newValue: string
	}[]
}
```

### 4.3 `prune_intent` - 剪枝

**展示内容**：

- 被剪枝的节点列表
- 剪枝原因
- 影响的子树范围

**UI 示例**：

```
┌─────────────────────────────────────────────────┐
│ ✂️ Prune Intent                                 │
├─────────────────────────────────────────────────┤
│ Pruned 3 nodes:                                 │
│   ✕ [P1.2] 使用 Memcached                       │
│   ✕ [I1.2.1] 安装 Memcached                     │
│   ✕ [I1.2.2] 配置连接池                         │
│                                                 │
│ Reason: 改用 Redis 方案                         │
└─────────────────────────────────────────────────┘
```

**组件 Props**：

```typescript
interface PruneIntentResultProps {
	prunedNodes: { shortId: string; content: string }[]
	reason?: string
}
```

### 4.4 `commit_intent` - 绑定代码

**展示内容**：

- 绑定的节点
- commit 信息
- 涉及的文件列表

**UI 示例**：

```
┌─────────────────────────────────────────────────┐
│ 🔗 Commit Intent                                │
├─────────────────────────────────────────────────┤
│ Node: [I1.1.1.1] 添加 Redis 缓存层              │
│                                                 │
│ Commit: a1b2c3d                                 │
│ Message: feat: add Redis cache for user queries │
│                                                 │
│ Files:                                          │
│   + src/cache/redis.ts                          │
│   M src/services/user.ts                        │
│   M src/config.ts                               │
└─────────────────────────────────────────────────┘
```

**组件 Props**：

```typescript
interface CommitIntentResultProps {
	node: IntentNode
	binding: {
		commitHash: string
		commitMessage: string
		files: string[]
		diffSummary?: string
	}
}
```

### 4.5 `restructure_intent` - 结构重组

**展示内容**：

- 操作类型（reparent/promote/extract）
- 移动的节点
- shortId 变化映射
- 类型调整（如果发生）

**UI 示例**：

```
┌─────────────────────────────────────────────────┐
│ 🔀 Restructure Intent                           │
├─────────────────────────────────────────────────┤
│ Operation: reparent                             │
│ Node: [S1.1] → moved to root                    │
│                                                 │
│ ShortId Changes:                                │
│   P1.1.1 → P1.1                                 │
│   I1.1.1.1 → I1.1.1                             │
│                                                 │
│ ⚠️ Type adjusted: subgoal → goal               │
└─────────────────────────────────────────────────┘
```

**组件 Props**：

```typescript
interface RestructureIntentResultProps {
	operation: "reparent" | "promote" | "extract_common_parent"
	node: IntentNode
	newParent?: IntentNode | null
	shortIdChanges: { old: string; new: string }[]
	typeAdjusted?: boolean
	adjustmentReason?: string
}
```

---

## 五、树状结构展示组件

### 5.1 IntentTreeDisplay

完整的意图树可视化，支持：

- 折叠/展开子树
- 高亮当前活跃节点
- 显示节点状态和代码绑定数量

**UI 示例**：

```
┌─────────────────────────────────────────────────┐
│ 📊 Intent Tree                            [−]   │
├─────────────────────────────────────────────────┤
│ 🎯 [G1] ● 优化系统性能                          │
│   📍 [S1.1] ◐ 减少数据库查询次数 ← CURRENT     │
│     🛤️ [P1.1.1] ○ 使用 Redis 缓存              │
│       ⚙️ [I1.1.1.1] ○ 添加缓存层 [2 commits]   │
│     🛤️ [P1.1.2] ✕ 使用 Memcached (pruned)      │
│   📍 [S1.2] ○ 优化 SQL 查询                     │
└─────────────────────────────────────────────────┘
```

**组件 Props**：

```typescript
interface IntentTreeDisplayProps {
	tree: IntentTreeData
	currentNodeId?: string
	expandedNodes?: Set<string>
	onNodeClick?: (nodeId: string) => void
	onToggleExpand?: (nodeId: string) => void
}
```

### 5.2 IntentNodeItem

单个节点的展示组件：

```typescript
interface IntentNodeItemProps {
	node: IntentNode
	depth: number
	isCurrent: boolean
	isExpanded: boolean
	onToggle: () => void
	onClick: () => void
}
```

**渲染逻辑**：

```tsx
const IntentNodeItem: React.FC<IntentNodeItemProps> = ({ node, depth, isCurrent, isExpanded, onToggle, onClick }) => {
	const typeIcon = TYPE_ICONS[node.type]
	const statusIcon = STATUS_ICONS[node.status]
	const typeColor = TYPE_COLORS[node.type]

	return (
		<div
			className={cn(
				"flex items-center py-1 cursor-pointer hover:bg-vscode-list-hoverBackground",
				isCurrent && "bg-vscode-list-activeSelectionBackground",
				node.status === "pruned" && "opacity-50 line-through",
			)}
			style={{ paddingLeft: depth * 16 }}
			onClick={onClick}>
			{/* 展开/折叠按钮 */}
			{node.childrenIds.length > 0 && (
				<span
					className="codicon codicon-chevron-right mr-1"
					style={{ transform: isExpanded ? "rotate(90deg)" : "none" }}
					onClick={(e) => {
						e.stopPropagation()
						onToggle()
					}}
				/>
			)}

			{/* 类型图标 */}
			<span className={`codicon ${typeIcon} mr-1`} style={{ color: typeColor }} />

			{/* shortId 徽章 */}
			<span
				className="font-mono text-xs px-1 rounded mr-2"
				style={{ backgroundColor: `${typeColor}20`, color: typeColor }}>
				[{node.shortId}]
			</span>

			{/* 状态图标 */}
			<span className="mr-1">{statusIcon}</span>

			{/* 内容 */}
			<span className="flex-1 truncate">{node.content}</span>

			{/* 代码绑定数量 */}
			{node.codeBindings.length > 0 && (
				<span className="text-xs text-vscode-descriptionForeground ml-2">
					[{node.codeBindings.length} commit(s)]
				</span>
			)}

			{/* 当前标记 */}
			{isCurrent && <span className="text-xs text-vscode-charts-yellow ml-2">← CURRENT</span>}
		</div>
	)
}
```

---

## 六、交互设计

### 6.1 工具调用时的展示流程

1. **调用开始**：显示工具名称和参数
2. **执行中**：显示 loading 状态
3. **执行完成**：显示结果组件 + 更新后的树状结构

### 6.2 节点交互

| 操作         | 行为                 |
| ------------ | -------------------- |
| 单击节点     | 展开/折叠详情面板    |
| 双击 shortId | 复制到剪贴板         |
| 悬停         | 显示完整内容 tooltip |
| 点击 commit  | 跳转到 git diff 视图 |

### 6.3 错误反馈

当操作失败时，显示可用节点列表：

```
┌─────────────────────────────────────────────────┐
│ ❌ Error: Node 'G3' not found                   │
├─────────────────────────────────────────────────┤
│ Available nodes:                                │
│   [G1] goal: 优化系统性能                       │
│   [G2] goal: 修复登录bug                        │
│   [S1.1] subgoal: 减少数据库查询次数            │
└─────────────────────────────────────────────────┘
```

---

## 七、数据流

### 7.1 消息类型

```typescript
// Extension → WebView
interface IntentTreeMessage {
  type: 'intentTreeUpdate'
  data: {
    action: 'add' | 'update' | 'prune' | 'commit' | 'restructure'
    result: AddIntentResult | UpdateIntentResult | ...
    tree: IntentTreeData  // 更新后的完整树
  }
}

// WebView → Extension
interface IntentTreeAction {
  type: 'intentTreeAction'
  action: 'copyShortId' | 'viewCommit' | 'expandNode'
  payload: { nodeId: string; ... }
}
```

### 7.2 状态管理

```typescript
// 在 ChatRow 或专用 context 中管理
const [intentTree, setIntentTree] = useState<IntentTreeData | null>(null)
const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

// 监听消息更新
useEvent("message", (event) => {
	if (event.data.type === "intentTreeUpdate") {
		setIntentTree(event.data.tree)
		// 自动展开新增节点的路径
		if (event.data.action === "add") {
			expandPathToNode(event.data.result.node.id)
		}
	}
})
```

---

## 八、文件结构

```
webview-ui/src/components/
├── intent-tree/
│   ├── IntentTreeDisplay.tsx      # 树状结构展示
│   ├── IntentNodeItem.tsx         # 单个节点
│   ├── AddIntentResult.tsx        # add_intent 结果
│   ├── UpdateIntentResult.tsx     # update_intent 结果
│   ├── PruneIntentResult.tsx      # prune_intent 结果
│   ├── CommitIntentResult.tsx     # commit_intent 结果
│   ├── RestructureIntentResult.tsx # restructure_intent 结果
│   ├── IntentTreeToolBlock.tsx    # 工具调用容器
│   ├── constants.ts               # 图标、颜色常量
│   └── types.ts                   # 前端类型定义
└── chat/
    └── ChatRow.tsx                # 集成 IntentTreeToolBlock
```

---

## 九、实现优先级

### Phase 1: 基础展示

1. `IntentNodeItem` - 单节点渲染
2. `IntentTreeDisplay` - 树状结构
3. `AddIntentResult` - 最常用的操作

### Phase 2: 完整工具支持

4. `UpdateIntentResult`
5. `PruneIntentResult`
6. `CommitIntentResult`

### Phase 3: 高级功能

7. `RestructureIntentResult`
8. 节点详情面板
9. 代码绑定跳转

---

## 十、样式常量

```typescript
// constants.ts

export const TYPE_ICONS: Record<IntentNodeType, string> = {
	goal: "codicon-target",
	subgoal: "codicon-milestone",
	path: "codicon-git-branch",
	impl: "codicon-gear",
}

export const TYPE_COLORS: Record<IntentNodeType, string> = {
	goal: "var(--vscode-charts-purple)",
	subgoal: "var(--vscode-charts-blue)",
	path: "var(--vscode-charts-orange)",
	impl: "var(--vscode-charts-green)",
}

export const STATUS_ICONS: Record<IntentNodeStatus, string> = {
	planned: "○",
	in_progress: "◐",
	done: "●",
	superseded: "◇",
	pruned: "✕",
}

export const STATUS_COLORS: Record<IntentNodeStatus, string> = {
	planned: "var(--vscode-descriptionForeground)",
	in_progress: "var(--vscode-charts-yellow)",
	done: "var(--vscode-charts-green)",
	superseded: "var(--vscode-charts-orange)",
	pruned: "var(--vscode-errorForeground)",
}
```
