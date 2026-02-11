/**
 * RestructureIntentResult - restructure_intent 工具的结果展示
 */

import React, { useState } from "react"
import { ToolUseBlock } from "../common/ToolUseBlock"
import type { RestructureIntentResult as RestructureIntentResultType } from "./types"
import { TYPE_ICONS, TYPE_COLORS, TYPE_LABELS } from "./constants"

interface RestructureIntentResultProps {
	result: RestructureIntentResultType
}

const OPERATION_LABELS: Record<string, string> = {
	reparent: "Reparent",
	promote: "Promote",
	extract_common_parent: "Extract Common Parent",
}

export const RestructureIntentResult: React.FC<RestructureIntentResultProps> = ({ result }) => {
	const { operation, node, newParent, shortIdChanges, typeAdjusted, requestedType, adjustmentReason } = result
	const typeColor = TYPE_COLORS[node.type]
	const typeIcon = TYPE_ICONS[node.type]
	const [showChanges, setShowChanges] = useState(shortIdChanges.length <= 5)

	return (
		<ToolUseBlock>
			<div className="space-y-2">
				{/* 操作类型 */}
				<div className="flex items-center gap-2 text-sm">
					<span className="text-vscode-descriptionForeground w-16 shrink-0">Operation:</span>
					<span className="font-medium">{OPERATION_LABELS[operation]}</span>
				</div>

				{/* 移动的节点 */}
				<div className="flex items-start gap-2">
					<span className="text-vscode-descriptionForeground text-sm w-16 shrink-0">Node:</span>
					<div className="flex items-center gap-1.5 flex-wrap">
						<span className={`codicon ${typeIcon}`} style={{ color: typeColor }} />
						<span
							className="font-mono text-xs px-1.5 py-0.5 rounded"
							style={{
								backgroundColor: `color-mix(in srgb, ${typeColor} 15%, transparent)`,
								color: typeColor,
								fontWeight: 500,
							}}>
							{node.shortId}
						</span>
						<span className="text-sm">{node.content}</span>
					</div>
				</div>

				{/* 新父节点 */}
				<div className="flex items-start gap-2">
					<span className="text-vscode-descriptionForeground text-sm w-16 shrink-0">Moved to:</span>
					{newParent ? (
						<div className="flex items-center gap-1.5">
							<span
								className={`codicon ${TYPE_ICONS[newParent.type]}`}
								style={{ color: TYPE_COLORS[newParent.type] }}
							/>
							<span
								className="font-mono text-xs px-1.5 py-0.5 rounded"
								style={{
									backgroundColor: `color-mix(in srgb, ${TYPE_COLORS[newParent.type]} 15%, transparent)`,
									color: TYPE_COLORS[newParent.type],
									fontWeight: 500,
								}}>
								{newParent.shortId}
							</span>
							<span className="text-sm text-vscode-descriptionForeground truncate">
								{newParent.content}
							</span>
						</div>
					) : (
						<span className="text-sm font-medium" style={{ color: "var(--vscode-charts-purple)" }}>
							Root level
						</span>
					)}
				</div>

				{/* 类型调整警告 */}
				{typeAdjusted && requestedType && (
					<div
						className="flex items-start gap-2 p-2 rounded"
						style={{ backgroundColor: "color-mix(in srgb, var(--vscode-charts-yellow) 10%, transparent)" }}>
						<span className="codicon codicon-warning" style={{ color: "var(--vscode-charts-yellow)" }} />
						<div className="text-sm">
							<div>
								<span className="font-medium">Type adjusted:</span>{" "}
								<span style={{ color: TYPE_COLORS[requestedType] }}>{TYPE_LABELS[requestedType]}</span>
								<span className="mx-1">→</span>
								<span style={{ color: typeColor }}>{TYPE_LABELS[node.type]}</span>
							</div>
							{adjustmentReason && (
								<div className="text-vscode-descriptionForeground mt-0.5">{adjustmentReason}</div>
							)}
						</div>
					</div>
				)}

				{/* ShortId 变化 */}
				{shortIdChanges.length > 0 && (
					<div className="space-y-1">
						<button
							className="flex items-center gap-1 text-xs text-vscode-descriptionForeground hover:text-vscode-foreground"
							onClick={() => setShowChanges(!showChanges)}>
							<span className={`codicon codicon-chevron-${showChanges ? "down" : "right"} text-xs`} />
							<span className="codicon codicon-replace mr-0.5" />
							{shortIdChanges.length} shortId change{shortIdChanges.length > 1 ? "s" : ""}
						</button>

						{showChanges && (
							<div className="pl-4 space-y-0.5">
								{shortIdChanges.map((change, idx) => (
									<div key={idx} className="flex items-center gap-2 text-xs font-mono">
										<span className="text-vscode-descriptionForeground">{change.old}</span>
										<span className="codicon codicon-arrow-right text-xs" />
										<span style={{ color: "var(--vscode-charts-purple)" }}>{change.new}</span>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</ToolUseBlock>
	)
}

export default RestructureIntentResult
