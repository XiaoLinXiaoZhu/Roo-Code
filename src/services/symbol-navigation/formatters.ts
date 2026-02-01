/**
 * Output Formatters for Symbol Navigation
 *
 * Formats definition and reference results into LLM-friendly Markdown.
 */

import * as path from "path"
import type { DefinitionResult, ReferencesResult, SymbolLocation, FallbackReason } from "./types"

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
