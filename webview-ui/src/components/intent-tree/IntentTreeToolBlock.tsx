/**
 * IntentTreeToolBlock - Intent Tree 工具调用的主容器组件
 *
 * 根据不同的工具操作类型，展示对应的结果组件，
 * 并可选地展示更新后的完整意图树。
 */

import React, { useState } from "react"
import { ToolUseBlock, ToolUseBlockHeader } from "../common/ToolUseBlock"
import type {
	IntentToolAction,
	IntentTreeData,
	AddIntentResult as AddIntentResultType,
	UpdateIntentResult as UpdateIntentResultType,
	PruneIntentResult as PruneIntentResultType,
	CommitIntentResult as CommitIntentResultType,
	RestructureIntentResult as RestructureIntentResultType,
} from "./types"
import { TOOL_TITLES } from "./constants"
import { IntentTreeDisplay } from "./IntentTreeDisplay"
import { AddIntentResult } from "./AddIntentResult"
import { UpdateIntentResult } from "./UpdateIntentResult"
import { PruneIntentResult } from "./PruneIntentResult"
import { CommitIntentResult } from "./CommitIntentResult"
import { RestructureIntentResult } from "./RestructureIntentResult"

type ToolResult =
	| AddIntentResultType
	| UpdateIntentResultType
	| PruneIntentResultType
	| CommitIntentResultType
	| RestructureIntentResultType

interface IntentTreeToolBlockProps {
	action: IntentToolAction
	result: ToolResult
	tree?: IntentTreeData
	showTree?: boolean
	error?: string
	availableNodes?: string
}

export const IntentTreeToolBlock: React.FC<IntentTreeToolBlockProps> = ({
	action,
	result,
	tree,
	showTree = true,
	error,
	availableNodes,
}) => {
	const [isTreeExpanded, setIsTreeExpanded] = useState(false)

	// 错误状态
	if (error) {
		return (
			<ToolUseBlock>
				<ToolUseBlockHeader>
					<span className="codicon codicon-error mr-1.5" style={{ color: "var(--vscode-errorForeground)" }} />
					<span className="font-bold">{TOOL_TITLES[action]} - Error</span>
				</ToolUseBlockHeader>

				<div className="mt-2 space-y-2">
					<div
						className="p-2 rounded text-sm"
						style={{
							backgroundColor: "color-mix(in srgb, var(--vscode-errorForeground) 10%, transparent)",
						}}>
						<span
							className="codicon codicon-error mr-1.5"
							style={{ color: "var(--vscode-errorForeground)" }}
						/>
						{error}
					</div>

					{availableNodes && (
						<div className="text-sm">
							<div className="text-vscode-descriptionForeground mb-1">Available nodes:</div>
							<div className="font-mono text-xs p-2 rounded bg-vscode-editor-background">
								{availableNodes}
							</div>
						</div>
					)}
				</div>
			</ToolUseBlock>
		)
	}

	// 根据 action 类型渲染对应的结果组件
	const renderResult = () => {
		switch (action) {
			case "add":
				return <AddIntentResult result={result as AddIntentResultType} />
			case "update":
				return <UpdateIntentResult result={result as UpdateIntentResultType} />
			case "prune":
				return <PruneIntentResult result={result as PruneIntentResultType} />
			case "commit":
				return <CommitIntentResult result={result as CommitIntentResultType} />
			case "restructure":
				return <RestructureIntentResult result={result as RestructureIntentResultType} />
			default:
				return null
		}
	}

	// 获取高亮节点 ID（用于在树中高亮显示刚操作的节点）
	const getHighlightedNodeId = (): string | undefined => {
		if ("node" in result && result.node) {
			return result.node.id
		}
		return undefined
	}

	return (
		<div className="space-y-2">
			{/* 操作结果 */}
			{renderResult()}

			{/* 可折叠的意图树展示 */}
			{showTree && tree && tree.rootIds.length > 0 && (
				<ToolUseBlock>
					<ToolUseBlockHeader className="cursor-pointer" onClick={() => setIsTreeExpanded(!isTreeExpanded)}>
						<span
							className={`codicon codicon-chevron-${isTreeExpanded ? "down" : "right"} mr-1.5 transition-transform`}
						/>
						<span
							className="codicon codicon-list-tree mr-1.5"
							style={{ color: "var(--vscode-charts-purple)" }}
						/>
						<span className="font-bold">Intent Tree</span>
						<span className="text-vscode-descriptionForeground ml-2 text-xs">
							({Object.keys(tree.nodes).length} nodes)
						</span>
					</ToolUseBlockHeader>

					{isTreeExpanded && (
						<div className="mt-2 border-t border-vscode-widget-border">
							<IntentTreeDisplay tree={tree} highlightedNodeId={getHighlightedNodeId()} />
						</div>
					)}
				</ToolUseBlock>
			)}
		</div>
	)
}

export default IntentTreeToolBlock
