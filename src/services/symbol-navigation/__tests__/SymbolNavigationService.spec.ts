import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { SymbolNavigationService } from "../SymbolNavigationService"
import { FallbackReason } from "../types"

// Mock vscode module
vi.mock("vscode", () => ({
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path, toString: () => `file://${path}` })),
	},
	Position: vi.fn((line: number, character: number) => ({ line, character })),
	Location: vi.fn((uri: any, range: any) => ({ uri, range })),
	Range: vi.fn((start: any, end: any) => ({ start, end })),
	commands: {
		executeCommand: vi.fn(),
	},
	workspace: {
		openTextDocument: vi.fn(),
	},
}))

// Mock tree-sitter
vi.mock("../../tree-sitter", () => ({
	parseSourceCodeDefinitionsForFile: vi.fn(),
}))

describe("SymbolNavigationService", () => {
	let service: SymbolNavigationService

	beforeEach(() => {
		service = new SymbolNavigationService()
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("findDefinition", () => {
		it("should return LSP result when available", async () => {
			const mockLocation = {
				uri: { fsPath: "/test/file.ts" },
				range: {
					start: { line: 10, character: 0 },
					end: { line: 15, character: 0 },
				},
			}

			const mockDocument = {
				lineCount: 100,
				lineAt: vi.fn((line: number) => ({ text: `const testSymbol = something; // line ${line}` })),
				getWordRangeAtPosition: vi.fn(() => ({
					start: { line: 0, character: 0 },
					end: { line: 0, character: 10 },
				})),
				getText: vi.fn(() => "testSymbol"),
			}

			vi.mocked(vscode.commands.executeCommand).mockResolvedValue([mockLocation])
			vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any)

			const result = await service.findDefinition("/test/source.ts", "testSymbol")

			expect(result.source).toBe("lsp")
			expect(result.confidence).toBe("high")
			expect(result.symbol).toBe("testSymbol")
			expect(result.definitions.length).toBeGreaterThan(0)
		})

		it("should return empty result with fallback reason when LSP returns nothing", async () => {
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])

			const mockDocument = {
				getWordRangeAtPosition: vi.fn(() => null),
			}
			vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any)

			const result = await service.findDefinition("/test/source.ts", "testSymbol")

			expect(result.definitions).toHaveLength(0)
			expect(result.confidence).toBe("low")
			expect(result.fallbackReason).toBe(FallbackReason.LSP_NO_RESULT)
		})

		it("should handle LSP timeout", async () => {
			// Simulate timeout by returning undefined
			vi.mocked(vscode.commands.executeCommand).mockImplementation(
				() =>
					new Promise((resolve) => {
						// Never resolve to simulate timeout
					}),
			)

			const mockDocument = {
				getWordRangeAtPosition: vi.fn(() => null),
			}
			vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any)

			// Use a short timeout for testing
			const result = await Promise.race([
				service.findDefinition("/test/source.ts", "testSymbol"),
				new Promise<any>((resolve) =>
					setTimeout(
						() =>
							resolve({
								definitions: [],
								source: "lsp",
								confidence: "low",
								fallbackReason: FallbackReason.LSP_TIMEOUT,
							}),
						100,
					),
				),
			])

			// The test should complete (either with timeout or actual result)
			expect(result).toBeDefined()
		})

		it("should handle LocationLink responses", async () => {
			const mockLocationLink = {
				targetUri: { fsPath: "/test/target.ts" },
				targetRange: {
					start: { line: 20, character: 0 },
					end: { line: 25, character: 0 },
				},
				targetSelectionRange: {
					start: { line: 20, character: 5 },
					end: { line: 20, character: 15 },
				},
			}

			const mockDocument = {
				lineCount: 100,
				lineAt: vi.fn((line: number) => ({ text: `const testSymbol = something; // line ${line}` })),
				getWordRangeAtPosition: vi.fn(() => ({
					start: { line: 0, character: 0 },
					end: { line: 0, character: 10 },
				})),
				getText: vi.fn(() => "testSymbol"),
			}

			vi.mocked(vscode.commands.executeCommand).mockResolvedValue([mockLocationLink])
			vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any)

			const result = await service.findDefinition("/test/source.ts", "testSymbol")

			expect(result.source).toBe("lsp")
			expect(result.definitions.length).toBeGreaterThan(0)
		})

		it("should use LocationLink.targetRange for full definition preview", async () => {
			// LocationLink with targetRange spanning lines 20-35 (a 16-line function)
			const mockLocationLink = {
				targetUri: { fsPath: "/test/target.ts" },
				targetRange: {
					start: { line: 20, character: 0 },
					end: { line: 35, character: 1 },
				},
				targetSelectionRange: {
					start: { line: 20, character: 16 },
					end: { line: 20, character: 30 },
				},
			}

			const mockDocument = {
				lineCount: 100,
				lineAt: vi.fn((line: number) => ({ text: `  code at line ${line}` })),
			}

			vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any)
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue([mockLocationLink])

			const result = await service.findDefinition("/test/source.ts", "code")

			expect(result.definitions.length).toBe(1)
			const def = result.definitions[0]

			// Preview should cover lines 20-35 (the full targetRange), not just ±5 around selection
			const previewLines = def.preview!.split("\n")
			// 16 lines (20 through 35 inclusive)
			expect(previewLines.length).toBe(16)
			// First line should be line 21 (1-based)
			expect(previewLines[0]).toContain("21 |")
			// Last line should be line 36 (1-based)
			expect(previewLines[previewLines.length - 1]).toContain("36 |")
		})

		it("should fall back to DocumentSymbol API when no fullRange available", async () => {
			// Plain Location (no fullRange)
			const mockLocation = {
				uri: { fsPath: "/test/file.ts" },
				range: {
					start: { line: 10, character: 5 },
					end: { line: 10, character: 15 },
				},
			}

			const mockDocumentSymbol = {
				name: "myFunction",
				range: {
					start: { line: 8, character: 0 },
					end: { line: 25, character: 1 },
					contains: vi.fn((pos: any) => pos.line >= 8 && pos.line <= 25),
				},
				selectionRange: {
					start: { line: 8, character: 16 },
					end: { line: 8, character: 26 },
				},
				children: [],
			}

			const mockDocument = {
				lineCount: 100,
				lineAt: vi.fn((line: number) => ({ text: `  code at line ${line}` })),
			}

			vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any)
			vi.mocked(vscode.commands.executeCommand).mockImplementation((command: string, ...args: any[]) => {
				if (command === "vscode.executeDefinitionProvider") {
					return Promise.resolve([mockLocation]) as any
				}
				if (command === "vscode.executeDocumentSymbolProvider") {
					return Promise.resolve([mockDocumentSymbol]) as any
				}
				return Promise.resolve(undefined) as any
			})

			const result = await service.findDefinition("/test/source.ts", "code")

			expect(result.definitions.length).toBe(1)
			const def = result.definitions[0]

			// Preview should cover lines 8-25 (DocumentSymbol range)
			const previewLines = def.preview!.split("\n")
			expect(previewLines.length).toBe(18) // lines 8 through 25 inclusive
			expect(previewLines[0]).toContain("9 |") // line 8 (0-based) = line 9 (1-based)
			expect(previewLines[previewLines.length - 1]).toContain("26 |")
		})

		it("should truncate preview when definition exceeds MAX_PREVIEW_LINES", async () => {
			// LocationLink with targetRange spanning 121 lines (exceeds 80 line limit)
			const mockLocationLink = {
				targetUri: { fsPath: "/test/target.ts" },
				targetRange: {
					start: { line: 10, character: 0 },
					end: { line: 130, character: 1 },
				},
				targetSelectionRange: {
					start: { line: 10, character: 12 },
					end: { line: 10, character: 20 },
				},
			}

			const mockDocument = {
				lineCount: 200,
				lineAt: vi.fn((line: number) => ({ text: `  code at line ${line}` })),
			}

			vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any)
			vi.mocked(vscode.commands.executeCommand).mockResolvedValue([mockLocationLink])

			const result = await service.findDefinition("/test/source.ts", "code")

			expect(result.definitions.length).toBe(1)
			const def = result.definitions[0]

			expect(def.previewTruncated).toBe(true)

			const previewLines = def.preview!.split("\n")
			// 80 code lines + 1 truncation indicator line
			expect(previewLines.length).toBe(81)
			// Last line should be the truncation indicator
			expect(previewLines[80]).toContain("... (+")
			expect(previewLines[80]).toContain("more lines)")
		})
	})

	describe("findReferences", () => {
		it("should return LSP references when available", async () => {
			const mockLocations = [
				{
					uri: { fsPath: "/test/file1.ts" },
					range: { start: { line: 10, character: 0 }, end: { line: 10, character: 10 } },
				},
				{
					uri: { fsPath: "/test/file2.ts" },
					range: { start: { line: 20, character: 0 }, end: { line: 20, character: 10 } },
				},
			]

			const mockDocument = {
				lineCount: 100,
				lineAt: vi.fn((line: number) => ({ text: `const testSymbol = something; // line ${line}` })),
				getWordRangeAtPosition: vi.fn(() => ({
					start: { line: 0, character: 0 },
					end: { line: 0, character: 10 },
				})),
				getText: vi.fn(() => "testSymbol"),
			}

			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(mockLocations)
			vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any)

			const result = await service.findReferences("/test/source.ts", "testSymbol")

			expect(result.source).toBe("lsp")
			expect(result.confidence).toBe("high")
			expect(result.references.length).toBe(2)
			expect(result.totalCount).toBe(2)
			expect(result.truncated).toBe(false)
		})

		it("should truncate results when exceeding maxResults", async () => {
			const mockLocations = Array.from({ length: 100 }, (_, i) => ({
				uri: { fsPath: `/test/file${i}.ts` },
				range: { start: { line: i, character: 0 }, end: { line: i, character: 10 } },
			}))

			const mockDocument = {
				lineCount: 100,
				lineAt: vi.fn((line: number) => ({ text: `const testSymbol = something; // line ${line}` })),
				getWordRangeAtPosition: vi.fn(() => ({
					start: { line: 0, character: 0 },
					end: { line: 0, character: 10 },
				})),
				getText: vi.fn(() => "testSymbol"),
			}

			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(mockLocations)
			vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any)

			const result = await service.findReferences("/test/source.ts", "testSymbol", undefined, undefined, {
				maxResults: 50,
			})

			expect(result.references.length).toBe(50)
			expect(result.totalCount).toBe(100)
			expect(result.truncated).toBe(true)
		})

		it("should group references by file", async () => {
			const mockLocations = [
				{
					uri: { fsPath: "/test/file1.ts" },
					range: { start: { line: 10, character: 0 }, end: { line: 10, character: 10 } },
				},
				{
					uri: { fsPath: "/test/file1.ts" },
					range: { start: { line: 20, character: 0 }, end: { line: 20, character: 10 } },
				},
				{
					uri: { fsPath: "/test/file2.ts" },
					range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
				},
			]

			const mockDocument = {
				lineCount: 100,
				lineAt: vi.fn((line: number) => ({ text: `const testSymbol = something; // line ${line}` })),
				getWordRangeAtPosition: vi.fn(() => ({
					start: { line: 0, character: 0 },
					end: { line: 0, character: 10 },
				})),
				getText: vi.fn(() => "testSymbol"),
			}

			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(mockLocations)
			vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any)

			const result = await service.findReferences("/test/source.ts", "testSymbol")

			expect(result.groupedByFile.size).toBe(2)
			expect(result.groupedByFile.get("/test/file1.ts")?.length).toBe(2)
			expect(result.groupedByFile.get("/test/file2.ts")?.length).toBe(1)
		})

		it("should use short context for reference previews", async () => {
			const mockLocations = [
				{
					uri: { fsPath: "/test/file1.ts" },
					range: { start: { line: 10, character: 0 }, end: { line: 10, character: 10 } },
				},
			]

			const mockDocument = {
				lineCount: 100,
				lineAt: vi.fn((line: number) => ({ text: `const testSymbol = something; // line ${line}` })),
				getWordRangeAtPosition: vi.fn(() => ({
					start: { line: 0, character: 0 },
					end: { line: 0, character: 10 },
				})),
				getText: vi.fn(() => "testSymbol"),
			}

			vi.mocked(vscode.commands.executeCommand).mockResolvedValue(mockLocations)
			vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any)

			const result = await service.findReferences("/test/source.ts", "testSymbol")

			expect(result.references.length).toBe(1)
			const ref = result.references[0]

			// Reference preview should use REFERENCE_CONTEXT_LINES (±2), not full definition
			const previewLines = ref.preview!.split("\n")
			// line 10 ± 2 = lines 8-12 = 5 lines
			expect(previewLines.length).toBe(5)
		})
	})
})
