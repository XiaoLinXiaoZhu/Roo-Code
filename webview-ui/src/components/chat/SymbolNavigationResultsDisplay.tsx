import React, { useState } from "react"
import { Trans } from "react-i18next"
import { vscode } from "@src/utils/vscode"
import { ToolUseBlock, ToolUseBlockHeader } from "../common/ToolUseBlock"
import CodeBlock from "../common/CodeBlock"
import { SquareArrowOutUpRight } from "lucide-react"
import { PathTooltip } from "../ui/PathTooltip"
import { formatPathTooltip } from "@src/utils/formatPathTooltip"

interface LocationUI {
	filePath: string
	line: number
	column: number
	preview?: string
	language?: string
}

interface DefinitionResultUI {
	success: boolean
	error?: string
	symbol: string
	definitions: LocationUI[]
	metadata?: {
		type?: string
		exported?: boolean
		async?: boolean
		documentation?: string
	}
	dataSource: {
		source: string
		confidence: string
		fallbackReason?: string
	}
}

interface FileReferencesUI {
	filePath: string
	language?: string
	references: LocationUI[]
}

interface ReferencesResultUI {
	success: boolean
	error?: string
	symbol: string
	fileGroups: FileReferencesUI[]
	pagination: {
		total: number
		returned: number
		truncated: boolean
	}
	dataSource: {
		source: string
		confidence: string
		fallbackReason?: string
	}
}

interface SymbolNavigationResultsDisplayProps {
	type: "definition" | "references"
	data: DefinitionResultUI | ReferencesResultUI
}

const SymbolNavigationResultsDisplay: React.FC<SymbolNavigationResultsDisplayProps> = ({ type, data }) => {
	const [expanded, setExpanded] = useState(true)

	const handleOpenFile = (file: string, line: number) => {
		vscode.postMessage({
			type: "openFile",
			text: file,
			values: { line: line + 1 }, // Convert 0-based to 1-based
		})
	}

	if (type === "definition") {
		const defData = data as DefinitionResultUI

		// Handle error state
		if (!defData.success) {
			return (
				<div className="flex flex-col gap-2">
					<div className="px-3 py-2 bg-[var(--vscode-inputValidation-errorBackground)] border border-[var(--vscode-inputValidation-errorBorder)] rounded text-sm text-[var(--vscode-errorForeground)]">
						{defData.error || <Trans i18nKey="chat:symbolNavigation.definitionError" />}
					</div>
				</div>
			)
		}

		const hasMultipleDefinitions = defData.definitions.length > 1

		return (
			<div className="flex flex-col gap-2">
				{defData.definitions.length === 0 ? (
					<div className="px-3 py-2 bg-[var(--vscode-editor-background)] border border-[var(--vscode-editorGroup-border)] rounded text-sm text-[var(--vscode-descriptionForeground)]">
						<Trans i18nKey="chat:symbolNavigation.noDefinitionsFound" />
					</div>
				) : (
					defData.definitions.map((def, idx) => (
						<ToolUseBlock key={idx}>
							<ToolUseBlockHeader
								className="group cursor-pointer"
								onClick={() => handleOpenFile(def.filePath, def.line)}>
								<span className="text-xs text-[var(--vscode-descriptionForeground)] mr-2">
									{hasMultipleDefinitions ? `Definition ${idx + 1}` : "Definition"}
								</span>
								<PathTooltip content={formatPathTooltip(def.filePath)}>
									<span className="whitespace-nowrap overflow-hidden text-ellipsis text-left mr-2 rtl">
										{formatPathTooltip(def.filePath)}
									</span>
								</PathTooltip>
								<span className="text-xs text-[var(--vscode-descriptionForeground)]">
									:{def.line + 1}:{def.column + 1}
								</span>
								<div style={{ flexGrow: 1 }}></div>
								<SquareArrowOutUpRight
									className="w-4 shrink-0 codicon codicon-link-external opacity-0 group-hover:opacity-100 transition-opacity"
									style={{ fontSize: 13.5, margin: "1px 0" }}
								/>
							</ToolUseBlockHeader>
							{def.preview && (
								<div className="px-3 py-2 border-t border-[var(--vscode-editorGroup-border)]">
									<CodeBlock
										source={def.preview}
										language={def.language || "plaintext"}
										collapsedHeight={200}
										initialWindowShade={true}
									/>
								</div>
							)}
						</ToolUseBlock>
					))
				)}

				{/* Metadata */}
				{defData.metadata && (
					<div className="px-3 py-2 text-xs text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-editor-background)] border border-[var(--vscode-editorGroup-border)] rounded">
						{defData.metadata.type && <div>Type: {defData.metadata.type}</div>}
						{defData.metadata.exported !== undefined && (
							<div>Exported: {defData.metadata.exported ? "yes" : "no"}</div>
						)}
						{defData.metadata.async && <div>Async: yes</div>}
					</div>
				)}

				{/* Data Source Info */}
				<div className="px-3 py-2 text-xs text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-editor-background)] border border-[var(--vscode-editorGroup-border)] rounded">
					Source: {defData.dataSource.source} | Confidence: {defData.dataSource.confidence}
					{defData.dataSource.fallbackReason && (
						<div className="mt-1 text-[var(--vscode-editorWarning-foreground)]">
							⚠️ {defData.dataSource.fallbackReason}
						</div>
					)}
				</div>
			</div>
		)
	}

	// References display
	const refData = data as ReferencesResultUI

	// Handle error state
	if (!refData.success) {
		return (
			<div className="flex flex-col gap-2">
				<div className="px-3 py-2 bg-[var(--vscode-inputValidation-errorBackground)] border border-[var(--vscode-inputValidation-errorBorder)] rounded text-sm text-[var(--vscode-errorForeground)]">
					{refData.error || <Trans i18nKey="chat:symbolNavigation.referencesError" />}
				</div>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-2">
			{/* Summary */}
			<div className="px-3 py-2 bg-[var(--vscode-editor-background)] border border-[var(--vscode-editorGroup-border)] rounded text-sm">
				<Trans
					i18nKey="chat:symbolNavigation.referencesFound"
					count={refData.pagination.total}
					values={{
						count: refData.pagination.total,
						files: refData.fileGroups.length,
					}}
				/>
				{refData.pagination.truncated && (
					<div className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">
						(Showing first {refData.pagination.returned} results)
					</div>
				)}
			</div>

			{/* References grouped by file */}
			{refData.fileGroups.length === 0 ? (
				<div className="px-3 py-2 bg-[var(--vscode-editor-background)] border border-[var(--vscode-editorGroup-border)] rounded text-sm text-[var(--vscode-descriptionForeground)]">
					<Trans i18nKey="chat:symbolNavigation.noReferencesFound" />
				</div>
			) : (
				refData.fileGroups.map((fileRef, fileIdx) => (
					<div key={fileIdx} className="flex flex-col gap-1">
						<div className="px-3 py-2 bg-[var(--vscode-editor-background)] border border-[var(--vscode-editorGroup-border)] rounded text-sm font-semibold">
							<PathTooltip content={formatPathTooltip(fileRef.filePath)}>
								<span className="cursor-pointer hover:underline">
									{formatPathTooltip(fileRef.filePath)}
								</span>
							</PathTooltip>
							<span className="text-xs text-[var(--vscode-descriptionForeground)] ml-2">
								({fileRef.references.length} reference{fileRef.references.length > 1 ? "s" : ""})
							</span>
						</div>

						{fileRef.references.map((ref, refIdx) => (
							<ToolUseBlock key={refIdx}>
								<ToolUseBlockHeader
									className="group cursor-pointer"
									onClick={() => handleOpenFile(fileRef.filePath, ref.line)}>
									<span className="text-xs text-[var(--vscode-descriptionForeground)] mr-2">
										Line {ref.line + 1}
									</span>
									{ref.preview && (
										<span className="text-xs text-[var(--vscode-descriptionForeground)] truncate">
											{ref.preview}
										</span>
									)}
									<div style={{ flexGrow: 1 }}></div>
									<SquareArrowOutUpRight
										className="w-4 shrink-0 codicon codicon-link-external opacity-0 group-hover:opacity-100 transition-opacity"
										style={{ fontSize: 13.5, margin: "1px 0" }}
									/>
								</ToolUseBlockHeader>
							</ToolUseBlock>
						))}
					</div>
				))
			)}

			{/* Data Source Info */}
			<div className="px-3 py-2 text-xs text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-editor-background)] border border-[var(--vscode-editorGroup-border)] rounded">
				Source: {refData.dataSource.source} | Confidence: {refData.dataSource.confidence}
				{refData.dataSource.fallbackReason && (
					<div className="mt-1 text-[var(--vscode-editorWarning-foreground)]">
						⚠️ {refData.dataSource.fallbackReason}
					</div>
				)}
			</div>
		</div>
	)
}

export default SymbolNavigationResultsDisplay
