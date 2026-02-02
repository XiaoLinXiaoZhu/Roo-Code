/**
 * Output Formatters for Symbol Navigation
 *
 * Formats definition and reference results into LLM-friendly Markdown
 * and structured UI formats.
 */

import * as path from "path"
import type {
	DefinitionResult,
	ReferencesResult,
	SymbolLocation,
	FallbackReason,
	DefinitionResultUI,
	ReferencesResultUI,
	LocationUI,
	FileReferencesUI,
	DataSourceUI,
	SymbolMetadataUI,
	DataSource,
	ConfidenceLevel,
} from "./types"

/**
 * Get relative path from workspace root
 */
function getRelativePath(absolutePath: string, workspaceRoot?: string): string {
	if (!workspaceRoot) {
		return absolutePath
	}
	return path.relative(workspaceRoot, absolutePath)
}

/**
 * Get language identifier from file extension
 */
function getLanguageFromPath(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase()
	const languageMap: Record<string, string> = {
		".ts": "typescript",
		".tsx": "tsx",
		".js": "javascript",
		".jsx": "jsx",
		".py": "python",
		".rs": "rust",
		".go": "go",
		".java": "java",
		".c": "c",
		".cpp": "cpp",
		".h": "c",
		".hpp": "cpp",
		".cs": "csharp",
		".rb": "ruby",
		".php": "php",
		".swift": "swift",
		".kt": "kotlin",
		".scala": "scala",
		".vue": "vue",
		".html": "html",
		".css": "css",
		".json": "json",
		".md": "markdown",
		".yaml": "yaml",
		".yml": "yaml",
	}
	return languageMap[ext] || ""
}

/**
 * Format fallback reason as human-readable message
 */
function formatFallbackMessage(reason: FallbackReason, source: string): string {
	const messages: Record<FallbackReason, string> = {
		lsp_timeout: "LSP timed out. Using fallback analysis.",
		lsp_no_result: "LSP returned no results. Using fallback analysis.",
		lsp_error: "LSP encountered an error. Using fallback analysis.",
		no_language_server: "No language server available for this file type.",
		file_not_in_workspace: "File is outside the workspace.",
	}

	const confidenceMap: Record<string, string> = {
		lsp: "High",
		"tree-sitter": "Medium",
		"semantic-search": "Low",
		"regex-search": "Low",
	}

	return `> ⚠️ **Fallback Mode**: ${messages[reason] || "Unknown reason"}\n> Confidence: **${confidenceMap[source] || "Unknown"}** - ${source === "tree-sitter" ? "Syntax-based matching, may miss type information." : "Results may be incomplete."}`
}

/**
 * Format a definition result as Markdown
 */
export function formatDefinitionMarkdown(result: DefinitionResult, workspaceRoot?: string): string {
	const lines: string[] = []

	// Header
	lines.push(`# Definition of \`${result.symbol}\``)
	lines.push("")

	// Fallback warning if applicable
	if (result.fallbackReason) {
		lines.push(formatFallbackMessage(result.fallbackReason, result.source))
		lines.push("")
	}

	// No results case
	if (result.definitions.length === 0) {
		lines.push("**No definitions found.**")
		lines.push("")
		lines.push("Possible reasons:")
		lines.push("- The symbol may be a built-in or from an external library")
		lines.push("- The language server may not be running")
		lines.push("- The position may not be on a valid symbol")
		return lines.join("\n")
	}

	// Multiple definitions warning
	if (result.definitions.length > 1) {
		lines.push(`> ℹ️ **Multiple definitions found** (${result.definitions.length}). This is common for:`)
		lines.push("> - Overloaded functions")
		lines.push("> - Interface merging")
		lines.push("> - Type + Value with same name")
		lines.push("")
	}

	// Format each definition
	result.definitions.forEach((def, index) => {
		if (result.definitions.length > 1) {
			lines.push(`## Definition ${index + 1}`)
		} else {
			lines.push("## Location")
		}

		const relativePath = getRelativePath(def.uri, workspaceRoot)
		const lineRange =
			def.range.start.line === def.range.end.line
				? `Line ${def.range.start.line}`
				: `Lines ${def.range.start.line}-${def.range.end.line}`

		lines.push(`- **File**: ${relativePath}`)
		lines.push(`- **${lineRange}**`)

		if (result.metadata?.type) {
			lines.push(`- **Type**: ${result.metadata.type}`)
		}
		if (result.metadata?.exported !== undefined) {
			lines.push(`- **Exported**: ${result.metadata.exported ? "yes" : "no"}`)
		}
		lines.push("")

		// Code preview
		if (def.preview) {
			const language = getLanguageFromPath(def.uri)
			lines.push("## Code")
			lines.push("```" + language)
			lines.push(def.preview)
			lines.push("```")
			lines.push("")
		}
	})

	// Metadata
	if (result.source !== "lsp") {
		lines.push("---")
		lines.push(`*Source: ${result.source} | Confidence: ${result.confidence}*`)
	}

	return lines.join("\n")
}

/**
 * Format a references result as Markdown
 */
export function formatReferencesMarkdown(result: ReferencesResult, workspaceRoot?: string): string {
	const lines: string[] = []

	// Header
	lines.push(`# References to \`${result.symbol}\``)
	lines.push("")

	// Fallback warning if applicable
	if (result.fallbackReason) {
		lines.push(formatFallbackMessage(result.fallbackReason, result.source))
		lines.push("")
	}

	// No results case
	if (result.references.length === 0) {
		lines.push("**No references found.**")
		lines.push("")
		lines.push("Possible reasons:")
		lines.push("- The symbol may not be used anywhere")
		lines.push("- The language server may not be running")
		lines.push("- The position may not be on a valid symbol")
		return lines.join("\n")
	}

	// Summary
	const fileCount = result.groupedByFile.size
	lines.push(`**Total**: ${result.totalCount} references in ${fileCount} file${fileCount > 1 ? "s" : ""}`)
	if (result.truncated) {
		lines.push(`*(Showing first ${result.references.length} results)*`)
	}
	lines.push("")

	// Group references by file
	for (const [filePath, locations] of result.groupedByFile) {
		const relativePath = getRelativePath(filePath, workspaceRoot)
		const language = getLanguageFromPath(filePath)

		lines.push(`## ${relativePath} (${locations.length} reference${locations.length > 1 ? "s" : ""})`)
		lines.push("```" + language)

		// Sort by line number
		const sortedLocations = [...locations].sort((a, b) => a.range.start.line - b.range.start.line)

		for (const loc of sortedLocations) {
			const lineNum = String(loc.range.start.line).padStart(4, " ")
			const preview = loc.preview?.split("\n")[0] || ""
			lines.push(`${lineNum} | ${preview}`)
		}

		lines.push("```")
		lines.push("")
	}

	// Truncation notice
	if (result.truncated) {
		const remaining = result.totalCount - result.references.length
		lines.push("---")
		lines.push(`*[+${remaining} more references not shown]*`)
		lines.push("")
	}

	// Metadata
	if (result.source !== "lsp") {
		lines.push("---")
		lines.push(`*Source: ${result.source} | Confidence: ${result.confidence}*`)
	}

	return lines.join("\n")
}

// ============================================================================
// UI Structured Formatters
// ============================================================================

/**
 * Get human-readable description for data source
 */
function getDataSourceDescription(
	source: DataSource,
	confidence: ConfidenceLevel,
	fallbackReason?: FallbackReason,
): string {
	if (source === "lsp") {
		return "Language Server Protocol - accurate type-aware results"
	}

	const fallbackMessages: Record<string, string> = {
		lsp_timeout: "LSP timed out",
		lsp_no_result: "LSP returned no results",
		lsp_error: "LSP encountered an error",
		no_language_server: "No language server available",
		file_not_in_workspace: "File is outside workspace",
	}

	const sourceDescriptions: Record<string, string> = {
		"tree-sitter": "Syntax-based analysis",
		"semantic-search": "Semantic search",
		"regex-search": "Text pattern matching",
	}

	const reason = fallbackReason ? fallbackMessages[fallbackReason] || "Unknown reason" : ""
	const sourceDesc = sourceDescriptions[source] || source

	return reason ? `${sourceDesc} (${reason})` : sourceDesc
}

/**
 * Convert SymbolLocation to LocationUI
 */
function toLocationUI(location: SymbolLocation, workspaceRoot?: string): LocationUI {
	return {
		filePath: getRelativePath(location.uri, workspaceRoot),
		line: location.range.start.line,
		column: location.range.start.character,
		preview: location.preview || "",
		language: getLanguageFromPath(location.uri) || undefined,
	}
}

/**
 * Build DataSourceUI from result metadata
 */
function buildDataSourceUI(
	source: DataSource,
	confidence: ConfidenceLevel,
	fallbackReason?: FallbackReason,
): DataSourceUI {
	return {
		source,
		confidence,
		fallbackReason,
		description: getDataSourceDescription(source, confidence, fallbackReason),
	}
}

/**
 * Format a DefinitionResult into structured UI format
 *
 * Extracts key information (file paths, line numbers, code previews, metadata)
 * into a structured object suitable for UI rendering.
 */
export function formatDefinitionUI(result: DefinitionResult, workspaceRoot?: string): DefinitionResultUI {
	// Handle no results case
	if (result.definitions.length === 0) {
		return {
			symbol: result.symbol,
			success: false,
			error: "No definitions found. The symbol may be a built-in, from an external library, or the language server may not be running.",
			definitions: [],
			dataSource: buildDataSourceUI(result.source, result.confidence, result.fallbackReason),
		}
	}

	// Convert definitions to LocationUI format
	const definitions: LocationUI[] = result.definitions.map((def) => toLocationUI(def, workspaceRoot))

	// Build metadata if available
	let metadata: SymbolMetadataUI | undefined
	if (result.metadata) {
		metadata = {
			type: result.metadata.type || "unknown",
			exported: result.metadata.exported ?? false,
			async: result.metadata.async ?? false,
			documentation: result.metadata.documentation,
		}
	}

	return {
		symbol: result.symbol,
		success: true,
		definitions,
		metadata,
		dataSource: buildDataSourceUI(result.source, result.confidence, result.fallbackReason),
	}
}

/**
 * Format a DefinitionResult into XML format for LLM consumption
 *
 * Uses self-explanatory XML tags for clear, unambiguous output.
 */
export function formatDefinitionForLLM(result: DefinitionResult, workspaceRoot?: string): string {
	const lines: string[] = []

	// Handle no results case
	if (result.definitions.length === 0) {
		lines.push(`<definition_result symbol="${result.symbol}" success="false">`)
		lines.push(
			`<error>No definitions found. The symbol may be a built-in, from an external library, or the language server may not be running.</error>`,
		)
		if (result.fallbackReason) {
			lines.push(
				`<data_source source="${result.source}" confidence="${result.confidence}" fallback="${result.fallbackReason}" />`,
			)
		}
		lines.push(`</definition_result>`)
		return lines.join("\n")
	}

	lines.push(`<definition_result symbol="${result.symbol}" success="true">`)

	// Add metadata if available
	if (result.metadata) {
		const meta = result.metadata
		const attrs = [`type="${meta.type || "unknown"}"`]
		if (meta.exported !== undefined) attrs.push(`exported="${meta.exported}"`)
		if (meta.async !== undefined) attrs.push(`async="${meta.async}"`)
		lines.push(`<metadata ${attrs.join(" ")} />`)
	}

	// Format each definition
	for (const def of result.definitions) {
		const relativePath = getRelativePath(def.uri, workspaceRoot)
		const line = def.range.start.line
		lines.push(`<definition file="${relativePath}" line="${line}">`)
		if (def.preview) {
			lines.push(def.preview)
		}
		lines.push(`</definition>`)
	}

	// Add data source info only if not LSP (fallback case)
	if (result.source !== "lsp") {
		lines.push(
			`<data_source source="${result.source}" confidence="${result.confidence}"${result.fallbackReason ? ` fallback="${result.fallbackReason}"` : ""} />`,
		)
	}

	lines.push(`</definition_result>`)
	return lines.join("\n")
}

/**
 * Format a ReferencesResult into structured UI format
 *
 * Extracts key information (file paths, line numbers, code previews)
 * grouped by file, suitable for UI rendering.
 */
export function formatReferencesUI(result: ReferencesResult, workspaceRoot?: string): ReferencesResultUI {
	// Handle no results case
	if (result.references.length === 0) {
		return {
			symbol: result.symbol,
			success: false,
			error: "No references found. The symbol may not be used anywhere, or the language server may not be running.",
			fileGroups: [],
			pagination: {
				totalCount: 0,
				returnedCount: 0,
				truncated: false,
			},
			dataSource: buildDataSourceUI(result.source, result.confidence, result.fallbackReason),
		}
	}

	// Convert grouped references to FileReferencesUI format
	const fileGroups: FileReferencesUI[] = []

	for (const [filePath, locations] of result.groupedByFile) {
		// Sort locations by line number
		const sortedLocations = [...locations].sort((a, b) => a.range.start.line - b.range.start.line)

		fileGroups.push({
			filePath: getRelativePath(filePath, workspaceRoot),
			language: getLanguageFromPath(filePath) || undefined,
			references: sortedLocations.map((loc) => ({
				line: loc.range.start.line,
				column: loc.range.start.character,
				preview: loc.preview?.split("\n")[0] || "",
			})),
		})
	}

	// Sort file groups by file path for consistent ordering
	fileGroups.sort((a, b) => a.filePath.localeCompare(b.filePath))

	return {
		symbol: result.symbol,
		success: true,
		fileGroups,
		pagination: {
			totalCount: result.totalCount,
			returnedCount: result.references.length,
			truncated: result.truncated,
		},
		dataSource: buildDataSourceUI(result.source, result.confidence, result.fallbackReason),
	}
}

/**
 * Format a ReferencesResult into XML format for LLM consumption
 *
 * Uses self-explanatory XML tags for clear, unambiguous output.
 */
export function formatReferencesForLLM(result: ReferencesResult, workspaceRoot?: string): string {
	const lines: string[] = []

	// Handle no results case
	if (result.references.length === 0) {
		lines.push(`<references_result symbol="${result.symbol}" success="false">`)
		lines.push(
			`<error>No references found. The symbol may not be used anywhere, or the language server may not be running.</error>`,
		)
		if (result.fallbackReason) {
			lines.push(
				`<data_source source="${result.source}" confidence="${result.confidence}" fallback="${result.fallbackReason}" />`,
			)
		}
		lines.push(`</references_result>`)
		return lines.join("\n")
	}

	// Build header with pagination info
	const fileCount = result.groupedByFile.size
	lines.push(
		`<references_result symbol="${result.symbol}" success="true" total="${result.totalCount}" returned="${result.references.length}" files="${fileCount}"${result.truncated ? ' truncated="true"' : ""}>`,
	)

	// Group references by file
	const sortedFiles = [...result.groupedByFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))

	for (const [filePath, locations] of sortedFiles) {
		const relativePath = getRelativePath(filePath, workspaceRoot)
		const sortedLocations = [...locations].sort((a, b) => a.range.start.line - b.range.start.line)

		lines.push(`<file path="${relativePath}" count="${sortedLocations.length}">`)
		for (const loc of sortedLocations) {
			const lineNum = loc.range.start.line
			const preview = loc.preview?.split("\n")[0]?.trim() || ""
			if (preview) {
				lines.push(`<ref line="${lineNum}">${preview}</ref>`)
			} else {
				lines.push(`<ref line="${lineNum}" />`)
			}
		}
		lines.push(`</file>`)
	}

	// Add data source info only if not LSP (fallback case)
	if (result.source !== "lsp") {
		lines.push(
			`<data_source source="${result.source}" confidence="${result.confidence}"${result.fallbackReason ? ` fallback="${result.fallbackReason}"` : ""} />`,
		)
	}

	lines.push(`</references_result>`)
	return lines.join("\n")
}
