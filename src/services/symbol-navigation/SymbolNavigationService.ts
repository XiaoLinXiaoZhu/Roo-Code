/**
 * Symbol Navigation Service
 *
 * Provides go_to_definition and find_references functionality using VSCode LSP API
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
): vscode.Location[] {
	if (!result) return []
	if (!Array.isArray(result)) return [result]

	return result.map((item) => {
		if ("targetUri" in item) {
			// LocationLink → Location
			// Use targetSelectionRange if available, otherwise use targetRange
			const range = item.targetSelectionRange || item.targetRange
			return new vscode.Location(item.targetUri, range)
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
async function locationToSymbolLocation(location: vscode.Location): Promise<SymbolLocation> {
	const uri = location.uri.fsPath
	const range = {
		start: { line: location.range.start.line + 1, character: location.range.start.character },
		end: { line: location.range.end.line + 1, character: location.range.end.character },
	}

	// Try to get code preview
	let preview: string | undefined
	try {
		const document = await vscode.workspace.openTextDocument(location.uri)
		const startLine = location.range.start.line
		const endLine = Math.min(location.range.end.line + 5, document.lineCount - 1) // Include a few extra lines
		const lines: string[] = []
		for (let i = startLine; i <= endLine; i++) {
			lines.push(document.lineAt(i).text)
		}
		preview = lines.join("\n")
	} catch {
		// Ignore preview errors
	}

	return { uri, range, preview }
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
			const symbolLocations = await Promise.all(locations.map(locationToSymbolLocation))

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
			const symbolLocations = await Promise.all(result.map(locationToSymbolLocation))

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
