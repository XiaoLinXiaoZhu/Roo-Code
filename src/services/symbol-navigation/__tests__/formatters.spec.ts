import { describe, it, expect } from "vitest"
import { formatDefinitionMarkdown, formatReferencesMarkdown } from "../formatters"
import { FallbackReason, type DefinitionResult, type ReferencesResult } from "../types"

describe("formatters", () => {
	describe("formatDefinitionMarkdown", () => {
		it("should format a single definition correctly", () => {
			const result: DefinitionResult = {
				symbol: "testFunction",
				definitions: [
					{
						uri: "/workspace/src/utils.ts",
						range: {
							start: { line: 10, character: 0 },
							end: { line: 15, character: 0 },
						},
						preview: "export function testFunction() {\n  return 42;\n}",
					},
				],
				source: "lsp",
				confidence: "high",
			}

			const output = formatDefinitionMarkdown(result, "/workspace")

			expect(output).toContain("# Definition of `testFunction`")
			expect(output).toContain("src/utils.ts")
			expect(output).toContain("Lines 10-15")
			expect(output).toContain("```typescript")
			expect(output).toContain("export function testFunction()")
		})

		it("should format multiple definitions with warning", () => {
			const result: DefinitionResult = {
				symbol: "useState",
				definitions: [
					{
						uri: "/workspace/node_modules/@types/react/index.d.ts",
						range: { start: { line: 100, character: 0 }, end: { line: 100, character: 50 } },
						preview: "function useState<S>(initialState: S): [S, Dispatch<SetStateAction<S>>]",
					},
					{
						uri: "/workspace/node_modules/@types/react/index.d.ts",
						range: { start: { line: 105, character: 0 }, end: { line: 105, character: 50 } },
						preview:
							"function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>]",
					},
				],
				source: "lsp",
				confidence: "high",
			}

			const output = formatDefinitionMarkdown(result, "/workspace")

			expect(output).toContain("Multiple definitions found")
			expect(output).toContain("Definition 1")
			expect(output).toContain("Definition 2")
		})

		it("should show fallback warning when applicable", () => {
			const result: DefinitionResult = {
				symbol: "testFunction",
				definitions: [
					{
						uri: "/workspace/src/utils.ts",
						range: { start: { line: 10, character: 0 }, end: { line: 15, character: 0 } },
						preview: "function testFunction() {}",
					},
				],
				source: "tree-sitter",
				confidence: "medium",
				fallbackReason: FallbackReason.LSP_TIMEOUT,
			}

			const output = formatDefinitionMarkdown(result, "/workspace")

			expect(output).toContain("⚠️")
			expect(output).toContain("Fallback Mode")
			expect(output).toContain("Medium")
		})

		it("should handle empty definitions", () => {
			const result: DefinitionResult = {
				symbol: "unknownSymbol",
				definitions: [],
				source: "lsp",
				confidence: "low",
				fallbackReason: FallbackReason.LSP_NO_RESULT,
			}

			const output = formatDefinitionMarkdown(result, "/workspace")

			expect(output).toContain("No definitions found")
			expect(output).toContain("Possible reasons")
		})
	})

	describe("formatReferencesMarkdown", () => {
		it("should format references grouped by file", () => {
			const groupedByFile = new Map<string, any[]>()
			groupedByFile.set("/workspace/src/app.ts", [
				{
					uri: "/workspace/src/app.ts",
					range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
					preview: "import { testFunction } from './utils'",
				},
				{
					uri: "/workspace/src/app.ts",
					range: { start: { line: 20, character: 0 }, end: { line: 20, character: 10 } },
					preview: "const result = testFunction()",
				},
			])
			groupedByFile.set("/workspace/src/test.ts", [
				{
					uri: "/workspace/src/test.ts",
					range: { start: { line: 10, character: 0 }, end: { line: 10, character: 10 } },
					preview: "expect(testFunction()).toBe(42)",
				},
			])

			const result: ReferencesResult = {
				symbol: "testFunction",
				references: [
					...groupedByFile.get("/workspace/src/app.ts")!,
					...groupedByFile.get("/workspace/src/test.ts")!,
				],
				totalCount: 3,
				truncated: false,
				source: "lsp",
				confidence: "high",
				groupedByFile,
			}

			const output = formatReferencesMarkdown(result, "/workspace")

			expect(output).toContain("# References to `testFunction`")
			expect(output).toContain("**Total**: 3 references in 2 files")
			expect(output).toContain("src/app.ts (2 reference")
			expect(output).toContain("src/test.ts (1 reference")
		})

		it("should show truncation notice when results are truncated", () => {
			const groupedByFile = new Map<string, any[]>()
			groupedByFile.set("/workspace/src/app.ts", [
				{
					uri: "/workspace/src/app.ts",
					range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
					preview: "testFunction()",
				},
			])

			const result: ReferencesResult = {
				symbol: "testFunction",
				references: [...groupedByFile.get("/workspace/src/app.ts")!],
				totalCount: 100,
				truncated: true,
				source: "lsp",
				confidence: "high",
				groupedByFile,
			}

			const output = formatReferencesMarkdown(result, "/workspace")

			expect(output).toContain("Showing first 1 results")
			expect(output).toContain("+99 more references")
		})

		it("should handle empty references", () => {
			const result: ReferencesResult = {
				symbol: "unusedFunction",
				references: [],
				totalCount: 0,
				truncated: false,
				source: "lsp",
				confidence: "low",
				fallbackReason: FallbackReason.LSP_NO_RESULT,
				groupedByFile: new Map(),
			}

			const output = formatReferencesMarkdown(result, "/workspace")

			expect(output).toContain("No references found")
			expect(output).toContain("Possible reasons")
		})
	})
})
