/**
 * IntentTreeDisplay - 意图树的完整展示组件
 */

import React, { useState, useCallback, useMemo } from "react"
import { cn } from "@/lib/utils"
import type { IntentTreeData, IntentNode } from "./types"
import { IntentNodeItem } from "./IntentNodeItem"

interface IntentTreeDisplayProps {
	tree: IntentTreeData
	currentNodeId?: string
	highlightedNodeId?: string
	defaultExpanded?: boolean
	onNodeClick?: (node: IntentNode) => void
	className?: string
}

export const IntentTreeDisplay: React.FC<IntentTreeDisplayProps> = ({
	tree,
	currentNodeId,
	highlightedNodeId,
	defaultExpanded = true,
	onNodeClick,
	className,
}) => {
	// 管理展开状态
	const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
		if (defaultExpanded) {
			// 默认展开所有非 pruned 节点
			return new Set(
				Object.values(tree.nodes)
					.filter((n) => n.status !== "pruned" && n.status !== "superseded")
					.map((n) => n.id),
			)
		}
		return new Set()
	})

	const toggleExpand = useCallback((nodeId: string) => {
		setExpandedNodes((prev) => {
			const next = new Set(prev)
			if (next.has(nodeId)) {
				next.delete(nodeId)
			} else {
				next.add(nodeId)
			}
			return next
		})
	}, [])

	// 递归渲染节点
	const renderNode = useCallback(
		(nodeId: string, depth: number): React.ReactNode => {
			const node = tree.nodes[nodeId]
			if (!node) return null

			const isExpanded = expandedNodes.has(nodeId)
			const hasChildren = node.childrenIds.length > 0
			const isCurrent = node.id === currentNodeId
			const isHighlighted = node.id === highlightedNodeId

			return (
				<div key={node.id}>
					<IntentNodeItem
						node={node}
						depth={depth}
						isCurrent={isCurrent}
						isExpanded={isExpanded}
						hasChildren={hasChildren}
						isHighlighted={isHighlighted}
						onToggle={() => toggleExpand(node.id)}
						onClick={() => onNodeClick?.(node)}
					/>
					{isExpanded && hasChildren && (
						<div className="border-l border-vscode-widget-border ml-4">
							{node.childrenIds.map((childId) => renderNode(childId, depth + 1))}
						</div>
					)}
				</div>
			)
		},
		[tree.nodes, expandedNodes, currentNodeId, highlightedNodeId, toggleExpand, onNodeClick],
	)

	// 统计信息
	const stats = useMemo(() => {
		const nodes = Object.values(tree.nodes)
		return {
			total: nodes.length,
			active: nodes.filter((n) => n.status !== "pruned" && n.status !== "superseded").length,
			inProgress: nodes.filter((n) => n.status === "in_progress").length,
			done: nodes.filter((n) => n.status === "done").length,
		}
	}, [tree.nodes])

	if (tree.rootIds.length === 0) {
		return (
			<div className={cn("text-sm text-vscode-descriptionForeground p-3", className)}>
				<span className="codicon codicon-info mr-1.5" />
				No intent nodes yet.
			</div>
		)
	}

	return (
		<div className={cn("py-1", className)}>
			{/* 统计栏 */}
			<div className="flex items-center gap-3 px-2 py-1.5 text-xs text-vscode-descriptionForeground border-b border-vscode-widget-border mb-1">
				<span>
					<span className="font-medium">{stats.active}</span> active
				</span>
				{stats.inProgress > 0 && (
					<span style={{ color: "var(--vscode-charts-yellow)" }}>
						<span className="font-medium">{stats.inProgress}</span> in progress
					</span>
				)}
				{stats.done > 0 && (
					<span style={{ color: "var(--vscode-charts-green)" }}>
						<span className="font-medium">{stats.done}</span> done
					</span>
				)}
			</div>

			{/* 树状结构 */}
			<div className="space-y-0.5">{tree.rootIds.map((rootId) => renderNode(rootId, 0))}</div>
		</div>
	)
}

export default IntentTreeDisplay
