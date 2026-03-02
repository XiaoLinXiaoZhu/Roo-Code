import type OpenAI from "openai"

const FIND_REFERENCES_DESCRIPTION = `Find all usages of a function, class, type, or variable across the codebase. Uses LSP for semantic code-structure-aware search — no false positives from comments or strings. Automatically traces imports to definitions.

**When to Use**: Understanding impact before refactoring a symbol.
- find_usages({ purpose: "impact_analysis", path: "src/utils.ts", symbol: "processData", surrounding_code: "export function processData(", start_line: 10, include_declaration: true, max_results: 50 })

**When to Use**: Seeing how a function/type is used across the codebase.
- find_usages({ purpose: "usage_patterns", path: "src/types.ts", symbol: "UserConfig", surrounding_code: "export interface UserConfig", start_line: 5, include_declaration: false, max_results: 20 })

**When to Use**: Checking if a symbol is unused before removing it.
- find_usages({ purpose: "dead_code_check", path: "src/helpers.ts", symbol: "legacyFormat", surrounding_code: "function legacyFormat(", start_line: null, include_declaration: false, max_results: 5 })`

export default {
	type: "function",
	function: {
		name: "find_usages",
		description: FIND_REFERENCES_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				purpose: {
					type: "string",
					enum: ["impact_analysis", "usage_patterns", "dead_code_check"],
					description: "Why you need to find references — forces explicit reasoning.",
				},
				path: {
					type: "string",
					description:
						"File path where the symbol appears/is used (relative to workspace). The symbol text must exist in this file.",
				},
				symbol: {
					type: "string",
					description:
						"Symbol name to find references for. Must actually exist in the file — don't use barrel/index files that only re-export via `export * from`.",
				},
				surrounding_code: {
					type: ["string", "null"],
					description:
						"Optional code snippet containing the symbol for precise disambiguation (e.g., 'processData('). Literal text matching, not regex.",
				},
				start_line: {
					type: ["number", "null"],
					description:
						"Optional 1-based line number to begin search, useful for locating symbols in specific regions.",
				},
				include_declaration: {
					type: ["boolean", "null"],
					description: "Include the declaration itself in results (default: true).",
				},
				max_results: {
					type: ["number", "null"],
					description: "Maximum results to return (default: 50).",
				},
			},
			required: [
				"purpose",
				"path",
				"symbol",
				"surrounding_code",
				"start_line",
				"include_declaration",
				"max_results",
			],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
