/**
 * PruneIntentResult - prune_intent 工具的结果展示
 */

import React from "react"
import { ToolUseBlock } from "../common/ToolUseBlock"
import type { PruneIntentResult as PruneIntentResultType } from "./types"

interface PruneIntentResultProps {
	result: PruneIntentResultType
}

export const PruneIntentResult: React.FC<PruneIntentResultProps> = ({ result }) => {
	const { prunedNodes, reason } = result

	return (
		<ToolUseBlock>
			<div className="space-y-2">
				{/* 剪枝数量 */}
				<div className="text-sm">
					Pruned <span className="font-medium">{prunedNodes.length}</span> node
					{prunedNodes.length > 1 ? "s" : ""}:
				</div>

				{/* 被剪枝的节点列表 */}
				<div className="space-y-1 pl-2 border-l-2 border-vscode-errorForeground">
					{prunedNodes.map((node, idx) => (
						<div key={idx} className="flex items-center gap-2 text-sm opacity-60">
							<span style={{ color: "var(--vscode-errorForeground)" }}>✕</span>
							<span
								className="font-mono text-xs px-1 py-0.5 rounded"
								style={{
									backgroundColor:
										"color-mix(in srgb, var(--vscode-errorForeground) 15%, transparent)",
									color: "var(--vscode-errorForeground)",
								}}>
								{node.shortId}
							</span>
							<span className="line-through text-vscode-descriptionForeground truncate">
								{node.content}
							</span>
						</div>
					))}
				</div>

				{/* 剪枝原因 */}
				{reason && (
					<div className="flex items-start gap-2 text-sm">
						<span className="text-vscode-descriptionForeground shrink-0">Reason:</span>
						<span>{reason}</span>
					</div>
				)}
			</div>
		</ToolUseBlock>
	)
}

export default PruneIntentResult
