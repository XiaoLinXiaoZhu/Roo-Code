/**
 * UpdateIntentResult - update_intent 工具的结果展示
 */

import React from "react"
import { ToolUseBlock } from "../common/ToolUseBlock"
import type { UpdateIntentResult as UpdateIntentResultType } from "./types"
import { TYPE_ICONS, TYPE_COLORS, STATUS_ICONS, STATUS_COLORS, STATUS_LABELS } from "./constants"

interface UpdateIntentResultProps {
	result: UpdateIntentResultType
}

export const UpdateIntentResult: React.FC<UpdateIntentResultProps> = ({ result }) => {
	const { node, changes } = result
	const typeColor = TYPE_COLORS[node.type]
	const typeIcon = TYPE_ICONS[node.type]

	return (
		<ToolUseBlock>
			<div className="space-y-2">
				{/* 更新的节点 */}
				<div className="flex items-start gap-2">
					<span className="text-vscode-descriptionForeground text-sm w-14 shrink-0">Node:</span>
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

				{/* 变更列表 */}
				{changes.length > 0 && (
					<div className="flex items-start gap-2">
						<span className="text-vscode-descriptionForeground text-sm w-14 shrink-0">Changes:</span>
						<div className="space-y-1">
							{changes.map((change, idx) => (
								<div key={idx} className="flex items-center gap-2 text-sm">
									<span className="text-vscode-descriptionForeground font-mono">{change.field}:</span>
									{change.field === "status" ? (
										<>
											<span
												style={{
													color: STATUS_COLORS[change.oldValue as keyof typeof STATUS_COLORS],
												}}>
												{STATUS_ICONS[change.oldValue as keyof typeof STATUS_ICONS]}{" "}
												{STATUS_LABELS[change.oldValue as keyof typeof STATUS_LABELS]}
											</span>
											<span className="codicon codicon-arrow-right text-xs" />
											<span
												style={{
													color: STATUS_COLORS[change.newValue as keyof typeof STATUS_COLORS],
												}}>
												{STATUS_ICONS[change.newValue as keyof typeof STATUS_ICONS]}{" "}
												{STATUS_LABELS[change.newValue as keyof typeof STATUS_LABELS]}
											</span>
										</>
									) : (
										<>
											<span className="text-vscode-descriptionForeground line-through">
												{change.oldValue.length > 30
													? change.oldValue.slice(0, 30) + "..."
													: change.oldValue}
											</span>
											<span className="codicon codicon-arrow-right text-xs" />
											<span>
												{change.newValue.length > 30
													? change.newValue.slice(0, 30) + "..."
													: change.newValue}
											</span>
										</>
									)}
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</ToolUseBlock>
	)
}

export default UpdateIntentResult
