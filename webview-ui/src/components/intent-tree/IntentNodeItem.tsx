/**
 * IntentNodeItem - 单个意图节点的展示组件
 */

import React from "react"
import { cn } from "@/lib/utils"
import type { IntentNode } from "./types"
import { TYPE_ICONS, TYPE_COLORS, STATUS_ICONS, STATUS_COLORS } from "./constants"

interface IntentNodeItemProps {
	node: IntentNode
	depth: number
	isCurrent?: boolean
	isExpanded?: boolean
	hasChildren?: boolean
	onToggle?: () => void
	onClick?: () => void
	isHighlighted?: boolean
}

export const IntentNodeItem: React.FC<IntentNodeItemProps> = ({
	node,
	depth,
	isCurrent = false,
	isExpanded = false,
	hasChildren = false,
	onToggle,
	onClick,
	isHighlighted = false,
}) => {
	const typeIcon = TYPE_ICONS[node.type]
	const typeColor = TYPE_COLORS[node.type]
	const statusIcon = STATUS_ICONS[node.status]
	const statusColor = STATUS_COLORS[node.status]
	const isPruned = node.status === "pruned" || node.status === "superseded"

	return (
		<div
			className={cn(
				"flex items-center py-1 px-2 cursor-pointer rounded-sm transition-colors",
				"hover:bg-vscode-list-hoverBackground",
				isCurrent && "bg-vscode-list-activeSelectionBackground",
				isHighlighted && "ring-1 ring-vscode-focusBorder",
				isPruned && "opacity-50",
			)}
			style={{ paddingLeft: 8 + depth * 16 }}
			onClick={onClick}>
			{/* 展开/折叠按钮 */}
			<span className="w-4 h-4 flex items-center justify-center mr-1">
				{hasChildren && (
					<span
						className={cn(
							"codicon codicon-chevron-right text-xs transition-transform",
							isExpanded && "rotate-90",
						)}
						onClick={(e) => {
							e.stopPropagation()
							onToggle?.()
						}}
					/>
				)}
			</span>

			{/* 类型图标 */}
			<span className={`codicon ${typeIcon} mr-1.5`} style={{ color: typeColor, fontSize: 14 }} />

			{/* shortId 徽章 */}
			<span
				className="font-mono text-xs px-1.5 py-0.5 rounded mr-2"
				style={{
					backgroundColor: `color-mix(in srgb, ${typeColor} 15%, transparent)`,
					color: typeColor,
					fontWeight: 500,
				}}>
				{node.shortId}
			</span>

			{/* 状态图标 */}
			<span className="mr-1.5 text-sm" style={{ color: statusColor }}>
				{statusIcon}
			</span>

			{/* 内容 */}
			<span
				className={cn("flex-1 truncate text-sm", isPruned && "line-through")}
				style={{ color: isPruned ? "var(--vscode-disabledForeground)" : "var(--vscode-foreground)" }}
				title={node.content}>
				{node.content}
			</span>

			{/* 代码绑定数量 */}
			{node.codeBindings.length > 0 && (
				<span className="text-xs text-vscode-descriptionForeground ml-2 flex items-center">
					<span className="codicon codicon-git-commit mr-0.5" style={{ fontSize: 12 }} />
					{node.codeBindings.length}
				</span>
			)}

			{/* 当前标记 */}
			{isCurrent && (
				<span
					className="text-xs ml-2 px-1.5 py-0.5 rounded"
					style={{
						backgroundColor: "var(--vscode-charts-yellow)",
						color: "var(--vscode-editor-background)",
						fontWeight: 500,
					}}>
					CURRENT
				</span>
			)}
		</div>
	)
}

export default IntentNodeItem
