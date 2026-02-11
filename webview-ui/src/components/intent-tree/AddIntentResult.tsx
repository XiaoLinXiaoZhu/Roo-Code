/**
 * AddIntentResult - add_intent 工具的结果展示
 */

import React from "react"
import { ToolUseBlock } from "../common/ToolUseBlock"
import type { AddIntentResult as AddIntentResultType } from "./types"
import { TYPE_ICONS, TYPE_COLORS, TYPE_LABELS } from "./constants"

interface AddIntentResultProps {
	result: AddIntentResultType
}

export const AddIntentResult: React.FC<AddIntentResultProps> = ({ result }) => {
	const { node, parentNode, typeAdjusted, requestedType, adjustmentReason } = result
	const typeColor = TYPE_COLORS[node.type]
	const typeIcon = TYPE_ICONS[node.type]

	return (
		<ToolUseBlock>
			<div className="space-y-2">
				{/* 创建的节点 */}
				<div className="flex items-start gap-2">
					<span className="text-vscode-descriptionForeground text-sm w-16 shrink-0">Created:</span>
					<div className="flex items-center gap-1.5">
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

				{/* 父节点 */}
				{parentNode && (
					<div className="flex items-start gap-2">
						<span className="text-vscode-descriptionForeground text-sm w-16 shrink-0">Parent:</span>
						<div className="flex items-center gap-1.5">
							<span
								className={`codicon ${TYPE_ICONS[parentNode.type]}`}
								style={{ color: TYPE_COLORS[parentNode.type] }}
							/>
							<span
								className="font-mono text-xs px-1.5 py-0.5 rounded"
								style={{
									backgroundColor: `color-mix(in srgb, ${TYPE_COLORS[parentNode.type]} 15%, transparent)`,
									color: TYPE_COLORS[parentNode.type],
									fontWeight: 500,
								}}>
								{parentNode.shortId}
							</span>
							<span className="text-sm text-vscode-descriptionForeground truncate">
								{parentNode.content}
							</span>
						</div>
					</div>
				)}

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
			</div>
		</ToolUseBlock>
	)
}

export default AddIntentResult
