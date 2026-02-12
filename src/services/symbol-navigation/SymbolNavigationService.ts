/**
 * Symbol Navigation Service
 *
 * Provides find_definition and find_usages functionality using VSCode LSP API
 * with fallback to tree-sitter when LSP is unavailable.
 */

import * as vscode from "vscode"
import * as path from "path"
import { parseSourceCodeDefinitionsForFile } from "../tree-sitter"
import {
	FallbackReason,
	type ISymbolNavigationService,
	type DefinitionResult,
	type ReferencesResult,
	type SymbolLocation,
	type FindReferencesOptions,
} from "./types"

/**
 * Timeout utility using Promise.race pattern
 */
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutValue?: T): Promise<T | undefined> {
	let timeoutId: NodeJS.Timeout

	const timeoutPromise = new Promise<T | undefined>((resolve) => {
		timeoutId = setTimeout(() => resolve(timeoutValue), ms)
	})

	return Promise.race([
		promise.then((result) => {
			clearTimeout(timeoutId)
			return result
		}),
		timeoutPromise,
	])
}

/**
 * Adaptive timeout manager that adjusts based on recent latencies
 */
class AdaptiveTimeout {
	private recentLatencies: number[] = []
	private readonly maxSamples = 10
	private readonly baseTimeout = 5000
	private readonly maxTimeout = 15000
	private readonly firstCallTimeout = 10000

	getTimeout(isFirstCall: boolean = false): number {
		if (isFirstCall || this.recentLatencies.length === 0) {
			return this.firstCallTimeout
		}

		// P95 latency * 2 as timeout
		const sorted = [...this.recentLatencies].sort((a, b) => a - b)
		const p95Index = Math.floor(sorted.length * 0.95)
		const p95 = sorted[p95Index] || sorted[sorted.length - 1]

		return Math.min(Math.max(p95 * 2, this.baseTimeout), this.maxTimeout)
	}

	recordLatency(ms: number): void {
		this.recentLatencies.push(ms)
		if (this.recentLatencies.length > this.maxSamples) {
			this.recentLatencies.shift()
		}
	}
}

/**
 * Extended Location that carries the full definition range from LocationLink.targetRange
 */
interface LocationWithFullRange extends vscode.Location {
	fullRange?: vscode.Range
}

/**
 * Normalize LSP results to a consistent Location array format
 *
 * VSCode LSP API can return:
 * - undefined
 * - Location
 * - Location[]
 * - LocationLink[]
 */
function normalizeLocations(
	result: vscode.Location | vscode.Location[] | vscode.LocationLink[] | undefined,
): LocationWithFullRange[] {
	if (!result) return []
	if (!Array.isArray(result)) return [result]

	return result.map((item) => {
		if ("targetUri" in item) {
			// LocationLink → Location
			// selectionRange for cursor positioning, targetRange for full definition preview
			const selectionRange = item.targetSelectionRange || item.targetRange
			const loc = new vscode.Location(item.targetUri, selectionRange) as LocationWithFullRange
			loc.fullRange = item.targetRange // Preserve full definition range
			return loc
		}
		return item
	})
}

/**
 * Convert Thenable to Promise
 */
function thenableToPromise<T>(thenable: Thenable<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		thenable.then(resolve, reject)
	})
}

/**
 * Convert VSCode Location to SymbolLocation
 */

/**
 * Preview mode determines how much context to include
 */
type PreviewMode = "definition" | "reference"

/**
 * Number of context lines to include before and after the definition
 */
const CONTEXT_LINES = 5

/**
 * Number of context lines for reference mode (shorter)
 */
const REFERENCE_CONTEXT_LINES = 2

/**
 * Maximum number of lines to include in a definition preview
 * to prevent excessive token consumption
 */
const MAX_PREVIEW_LINES = 80

/**
 * Timeout for DocumentSymbol API calls (ms)
 */
const DOCUMENT_SYMBOL_TIMEOUT = 3000

/**
 * Get the full definition range from DocumentSymbol API
 *
 * Uses vscode.executeDocumentSymbolProvider to find the smallest symbol
 * that contains the given position, returning its full range.
 */
async function getFullRangeFromDocumentSymbols(
	uri: vscode.Uri,
	position: vscode.Position,
): Promise<vscode.Range | undefined> {
	try {
		const result = await withTimeout(
			thenableToPromise(
				vscode.commands.executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", uri),
			),
			DOCUMENT_SYMBOL_TIMEOUT,
		)

		if (!result || result.length === 0) return undefined
		return findSmallestEnclosingSymbol(result, position)
	} catch {
		return undefined
	}
}

/**
 * Recursively find the smallest DocumentSymbol whose range contains the position.
 * This ensures that for nested definitions (e.g., a method inside a class),
 * we return the method's range rather than the entire class.
 */
function findSmallestEnclosingSymbol(
	symbols: vscode.DocumentSymbol[],
	position: vscode.Position,
): vscode.Range | undefined {
	for (const sym of symbols) {
		if (sym.range.contains(position)) {
			// Try to find a more precise match in children first
			const childMatch = sym.children?.length ? findSmallestEnclosingSymbol(sym.children, position) : undefined
			return childMatch || sym.range
		}
	}
	return undefined
}

/**
 * Convert VSCode Location to SymbolLocation with intelligent preview extraction.
 *
 * For definition mode, uses a three-tier priority chain:
 * 1. LocationLink.targetRange (full definition range from LSP, zero cost)
 * 2. DocumentSymbol API (one extra call, finds enclosing symbol range)
 * 3. +/-CONTEXT_LINES fallback (existing behavior)
 *
 * For reference mode, uses a fixed +/-REFERENCE_CONTEXT_LINES window.
 */
async function locationToSymbolLocation(
	location: LocationWithFullRange,
	mode: PreviewMode = "definition",
): Promise<SymbolLocation> {
	const uri = location.uri.fsPath
	const range = {
		start: { line: location.range.start.line + 1, character: location.range.start.character },
		end: { line: location.range.end.line + 1, character: location.range.end.character },
	}

	// Try to get code preview
	let preview: string | undefined
	let previewTruncated = false
	try {
		const document = await vscode.workspace.openTextDocument(location.uri)

		let startLine: number
		let endLine: number

		if (mode === "reference") {
			// Reference mode: short context window
			startLine = Math.max(0, location.range.start.line - REFERENCE_CONTEXT_LINES)
			endLine = Math.min(location.range.end.line + REFERENCE_CONTEXT_LINES, document.lineCount - 1)
		} else {
			// Definition mode: try to get full definition range

			// Priority 1: Use fullRange from LocationLink.targetRange
			let fullRange: vscode.Range | undefined = location.fullRange

			// Priority 2: Use DocumentSymbol API to find enclosing symbol
			if (!fullRange) {
				fullRange = await getFullRangeFromDocumentSymbols(location.uri, location.range.start)
			}

			if (fullRange) {
				startLine = fullRange.start.line
				endLine = fullRange.end.line
			} else {
				// Priority 3: Fallback to +/-CONTEXT_LINES
				startLine = Math.max(0, location.range.start.line - CONTEXT_LINES)
				endLine = Math.min(location.range.end.line + CONTEXT_LINES, document.lineCount - 1)
			}
		}

		// Truncation protection
		const totalLines = endLine - startLine + 1
		let actualEndLine = endLine
		if (totalLines > MAX_PREVIEW_LINES) {
			actualEndLine = startLine + MAX_PREVIEW_LINES - 1
			previewTruncated = true
		}

		const lines: string[] = []
		for (let i = startLine; i <= actualEndLine; i++) {
			// Add line number prefix for clarity
			const lineNum = i + 1 // Convert to 1-based
			const lineText = document.lineAt(i).text
			lines.push(`${lineNum.toString().padStart(4, " ")} | ${lineText}`)
		}

		// Add truncation indicator
		if (previewTruncated) {
			const remaining = endLine - actualEndLine
			lines.push(`     | ... (+${remaining} more lines)`)
		}

		preview = lines.join("\n")
	} catch {
		// Ignore preview errors
	}

	return { uri, range, preview, previewTruncated }
}

/**
 * Extract symbol name from a position in a document
 */
async function getSymbolAtPosition(uri: vscode.Uri, position: vscode.Position): Promise<string | undefined> {
	try {
		const document = await vscode.workspace.openTextDocument(uri)
		const wordRange = document.getWordRangeAtPosition(position)
		if (wordRange) {
			return document.getText(wordRange)
		}
	} catch {
		// Ignore errors
	}
	return undefined
}

/**
 * Symbol Navigation Service Implementation
 */
export class SymbolNavigationService implements ISymbolNavigationService {
	private readonly adaptiveTimeout = new AdaptiveTimeout()
	private isFirstCall = true

	/**
	 * Find the definition of a symbol
	 *
	 * @param file - File path
	 * @param symbol - Symbol name to find
	 * @param surroundingCode - Optional surrounding code to search for (will locate symbol within this code)
	 * @param startLine - Optional starting line (1-based, default: 1)
	 */
	async findDefinition(
		file: string,
		symbol: string,
		surroundingCode?: string,
		startLine?: number,
	): Promise<DefinitionResult> {
		// Locate the symbol in the file
		const location = await this.locateSymbolInFile(file, symbol, surroundingCode, startLine)

		if (!location) {
			return {
				symbol,
				definitions: [],
				source: "lsp",
				confidence: "low",
				fallbackReason: FallbackReason.LSP_NO_RESULT,
			}
		}

		const uri = vscode.Uri.file(path.resolve(file))
		const position = new vscode.Position(location.line - 1, location.character) // Convert 1-based line to 0-based

		// Try LSP first
		const lspResult = await this.tryLspDefinition(uri, position)

		if (lspResult.success && lspResult.locations.length > 0) {
			this.isFirstCall = false
			return {
				symbol,
				definitions: lspResult.locations,
				source: "lsp",
				confidence: "high",
			}
		}

		// Fallback to tree-sitter
		const treeSitterResult = await this.tryTreeSitterDefinition(file, symbol)

		if (treeSitterResult.success && treeSitterResult.locations.length > 0) {
			return {
				symbol,
				definitions: treeSitterResult.locations,
				source: "tree-sitter",
				confidence: "medium",
				fallbackReason: lspResult.fallbackReason,
			}
		}

		// Return empty result
		return {
			symbol,
			definitions: [],
			source: "lsp",
			confidence: "low",
			fallbackReason: lspResult.fallbackReason || FallbackReason.LSP_NO_RESULT,
		}
	}

	/**
	 * Find all references to a symbol
	 *
	 * @param file - File path
	 * @param symbol - Symbol name to find
	 * @param surroundingCode - Optional surrounding code to search for (will locate symbol within this code)
	 * @param startLine - Optional starting line (1-based, default: 1)
	 * @param options - Optional search options
	 */
	async findReferences(
		file: string,
		symbol: string,
		surroundingCode?: string,
		startLine?: number,
		options?: FindReferencesOptions,
	): Promise<ReferencesResult> {
		// Locate the symbol in the file
		const location = await this.locateSymbolInFile(file, symbol, surroundingCode, startLine)

		if (!location) {
			return {
				symbol,
				references: [],
				totalCount: 0,
				truncated: false,
				source: "lsp",
				confidence: "low",
				fallbackReason: FallbackReason.LSP_NO_RESULT,
				groupedByFile: new Map(),
			}
		}

		const uri = vscode.Uri.file(path.resolve(file))
		const position = new vscode.Position(location.line - 1, location.character) // Convert 1-based line to 0-based
		const maxResults = options?.maxResults ?? 50
		const includeDeclaration = options?.includeDeclaration ?? true

		// Try LSP at current position
		let lspResult = await this.tryLspReferences(uri, position, includeDeclaration)

		// If no results, try to find definition first and search references from there
		if (!lspResult.success || lspResult.locations.length === 0) {
			const definitionResult = await this.findDefinition(file, symbol, surroundingCode, startLine)

			if (definitionResult.definitions.length > 0) {
				const def = definitionResult.definitions[0]
				const defUri = vscode.Uri.file(path.resolve(def.uri))
				const defPosition = new vscode.Position(def.range.start.line - 1, def.range.start.character)

				// Retry references from definition location
				lspResult = await this.tryLspReferences(defUri, defPosition, includeDeclaration)
			}
		}

		if (lspResult.success && lspResult.locations.length > 0) {
			this.isFirstCall = false

			// Group by file
			const groupedByFile = new Map<string, SymbolLocation[]>()
			for (const loc of lspResult.locations) {
				const filePath = loc.uri
				if (!groupedByFile.has(filePath)) {
					groupedByFile.set(filePath, [])
				}
				groupedByFile.get(filePath)!.push(loc)
			}

			// Truncate if needed
			const truncated = lspResult.locations.length > maxResults
			const references = truncated ? lspResult.locations.slice(0, maxResults) : lspResult.locations

			return {
				symbol,
				references,
				totalCount: lspResult.locations.length,
				truncated,
				source: "lsp",
				confidence: "high",
				groupedByFile,
			}
		}

		// Fallback: return empty result with fallback reason
		// Note: tree-sitter doesn't support reference finding, only definition extraction
		return {
			symbol,
			references: [],
			totalCount: 0,
			truncated: false,
			source: "lsp",
			confidence: "low",
			fallbackReason: lspResult.fallbackReason || FallbackReason.LSP_NO_RESULT,
			groupedByFile: new Map(),
		}
	}

	/**
	 * Locate a symbol in a file
	 *
	 * @param file - File path
	 * @param symbol - Symbol name to find
	 * @param surroundingCode - Optional surrounding code to search for (will locate symbol within this code)
	 * @param startLine - Optional starting line (1-based, default: 1)
	 * @returns Position with 1-based line and 0-based character, or null if not found
	 */
	private async locateSymbolInFile(
		file: string,
		symbol: string,
		surroundingCode?: string,
		startLine: number = 1,
	): Promise<{ line: number; character: number } | null> {
		try {
			const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.resolve(file)))
			const lineCount = document.lineCount
			const startLineIndex = Math.max(0, startLine - 1) // Convert 1-based to 0-based

			if (surroundingCode) {
				// Search for surrounding code first, then locate symbol within it
				for (let i = startLineIndex; i < lineCount; i++) {
					const lineText = document.lineAt(i).text
					const codeIndex = lineText.indexOf(surroundingCode)

					if (codeIndex !== -1) {
						// Found the surrounding code, now find symbol within it
						const symbolIndex = lineText.indexOf(symbol, codeIndex)

						if (
							symbolIndex !== -1 &&
							symbolIndex >= codeIndex &&
							symbolIndex < codeIndex + surroundingCode.length
						) {
							// Symbol found within the surrounding code
							return {
								line: i + 1, // Convert back to 1-based
								character: symbolIndex, // 0-based
							}
						}
					}
				}
			} else {
				// Search for the first occurrence of symbol from startLine
				for (let i = startLineIndex; i < lineCount; i++) {
					const lineText = document.lineAt(i).text
					const symbolIndex = lineText.indexOf(symbol)

					if (symbolIndex !== -1) {
						return {
							line: i + 1, // Convert to 1-based
							character: symbolIndex, // 0-based
						}
					}
				}
			}

			return null
		} catch (error) {
			console.error("Error locating symbol in file:", error)
			return null
		}
	}

	/**
	 * Try to get definition using VSCode LSP API
	 */
	private async tryLspDefinition(
		uri: vscode.Uri,
		position: vscode.Position,
	): Promise<{ success: boolean; locations: SymbolLocation[]; fallbackReason?: FallbackReason }> {
		const timeout = this.adaptiveTimeout.getTimeout(this.isFirstCall)
		const startTime = Date.now()

		try {
			const result = await withTimeout(
				thenableToPromise(
					vscode.commands.executeCommand<
						vscode.Location | vscode.Location[] | vscode.LocationLink[] | undefined
					>("vscode.executeDefinitionProvider", uri, position),
				),
				timeout,
			)

			const latency = Date.now() - startTime
			this.adaptiveTimeout.recordLatency(latency)

			if (result === undefined) {
				// Timeout
				return { success: false, locations: [], fallbackReason: FallbackReason.LSP_TIMEOUT }
			}

			const locations = normalizeLocations(result)

			if (locations.length === 0) {
				return { success: false, locations: [], fallbackReason: FallbackReason.LSP_NO_RESULT }
			}

			// Convert to SymbolLocation
			const symbolLocations = await Promise.all(
				locations.map((loc) => locationToSymbolLocation(loc, "definition")),
			)

			return { success: true, locations: symbolLocations }
		} catch (error) {
			console.error("LSP definition error:", error)
			return { success: false, locations: [], fallbackReason: FallbackReason.LSP_ERROR }
		}
	}

	/**
	 * Try to get references using VSCode LSP API
	 */
	private async tryLspReferences(
		uri: vscode.Uri,
		position: vscode.Position,
		includeDeclaration: boolean,
	): Promise<{ success: boolean; locations: SymbolLocation[]; fallbackReason?: FallbackReason }> {
		const timeout = this.adaptiveTimeout.getTimeout(this.isFirstCall)
		const startTime = Date.now()

		try {
			const result = await withTimeout(
				thenableToPromise(
					vscode.commands.executeCommand<vscode.Location[] | undefined>(
						"vscode.executeReferenceProvider",
						uri,
						position,
						{
							includeDeclaration,
						},
					),
				),
				timeout,
			)

			const latency = Date.now() - startTime
			this.adaptiveTimeout.recordLatency(latency)

			if (result === undefined) {
				// Timeout
				return { success: false, locations: [], fallbackReason: FallbackReason.LSP_TIMEOUT }
			}

			if (!result || result.length === 0) {
				return { success: false, locations: [], fallbackReason: FallbackReason.LSP_NO_RESULT }
			}

			// Convert to SymbolLocation
			const symbolLocations = await Promise.all(result.map((loc) => locationToSymbolLocation(loc, "reference")))

			return { success: true, locations: symbolLocations }
		} catch (error) {
			console.error("LSP references error:", error)
			return { success: false, locations: [], fallbackReason: FallbackReason.LSP_ERROR }
		}
	}

	/**
	 * Try to find definition using tree-sitter
	 * This is a fallback when LSP is not available
	 */
	private async tryTreeSitterDefinition(
		file: string,
		symbol: string,
	): Promise<{ success: boolean; locations: SymbolLocation[] }> {
		try {
			// Parse the file to get definitions
			const definitions = await parseSourceCodeDefinitionsForFile(file)

			if (!definitions) {
				return { success: false, locations: [] }
			}

			// Parse the definitions output to find matching symbol
			// Format: "startLine--endLine | code"
			const lines = definitions.split("\n")
			const matchingLocations: SymbolLocation[] = []

			for (const line of lines) {
				if (line.includes(symbol)) {
					const match = line.match(/^(\d+)--(\d+)\s*\|\s*(.+)$/)
					if (match) {
						const startLine = parseInt(match[1], 10)
						const endLine = parseInt(match[2], 10)
						const preview = match[3]

						matchingLocations.push({
							uri: file,
							range: {
								start: { line: startLine, character: 0 },
								end: { line: endLine, character: 0 },
							},
							preview,
						})
					}
				}
			}

			return { success: matchingLocations.length > 0, locations: matchingLocations }
		} catch (error) {
			console.error("Tree-sitter definition error:", error)
			return { success: false, locations: [] }
		}
	}
}

// Export singleton instance
export const symbolNavigationService = new SymbolNavigationService()
