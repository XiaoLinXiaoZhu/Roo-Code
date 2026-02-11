/**
 * CommitIntentResult - commit_intent 工具的结果展示
 */

import React, { useState } from "react"
import { ToolUseBlock } from "../common/ToolUseBlock"
import type { CommitIntentResult as CommitIntentResultType } from "./types"
import { TYPE_ICONS, TYPE_COLORS } from "./constants"

interface CommitIntentResultProps {
	result: CommitIntentResultType
}

export const CommitIntentResult: React.FC<CommitIntentResultProps> = ({ result }) => {
	const { node, binding } = result
	const typeColor = TYPE_COLORS[node.type]
	const typeIcon = TYPE_ICONS[node.type]
	const [showFiles, setShowFiles] = useState(false)

	const shortHash = binding.commitHash.substring(0, 7)

	return (
		<ToolUseBlock>
			<div className="space-y-2">
				{/* 绑定的节点 */}
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
						<span className="text-sm truncate">{node.content}</span>
					</div>
				</div>

				{/* Commit 信息 */}
				<div
					className="p-2 rounded"
					style={{ backgroundColor: "color-mix(in srgb, var(--vscode-charts-orange) 10%, transparent)" }}>
					<div className="flex items-center gap-2">
						<span
							className="font-mono text-xs px-1.5 py-0.5 rounded"
							style={{
								backgroundColor: "var(--vscode-charts-orange)",
								color: "var(--vscode-editor-background)",
								fontWeight: 600,
							}}>
							{shortHash}
						</span>
						<span className="text-sm flex-1 truncate">{binding.commitMessage}</span>
					</div>

					{/* 文件列表 */}
					{binding.files.length > 0 && (
						<div className="mt-2">
							<button
								className="flex items-center gap-1 text-xs text-vscode-descriptionForeground hover:text-vscode-foreground"
								onClick={() => setShowFiles(!showFiles)}>
								<span className={`codicon codicon-chevron-${showFiles ? "down" : "right"} text-xs`} />
								<span className="codicon codicon-file mr-0.5" />
								{binding.files.length} file{binding.files.length > 1 ? "s" : ""}
							</button>

							{showFiles && (
								<div className="mt-1 pl-4 space-y-0.5">
									{binding.files.map((file, idx) => (
										<div
											key={idx}
											className="text-xs font-mono text-vscode-descriptionForeground truncate">
											{file}
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* Diff 摘要 */}
					{binding.diffSummary && (
						<div className="mt-1 text-xs text-vscode-descriptionForeground">{binding.diffSummary}</div>
					)}
				</div>
			</div>
		</ToolUseBlock>
	)
}

export default CommitIntentResult
