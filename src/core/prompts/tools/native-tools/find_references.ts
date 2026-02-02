import type OpenAI from "openai"

const FIND_REFERENCES_DESCRIPTION = `Find all references to a symbol using LSP (Language Server Protocol). More accurate than grep - semantic search that understands code structure.

**Priority over grep**: Always prefer this tool instead of grep when:
- Finding all usages of a function/class/type/variable
- Analyzing impact before refactoring
- Need accurate results without false positives from comments/strings/similar names

**When to Use**:
- impact_analysis: Need to understand the impact of changing a symbol before refactoring
- usage_patterns: Need to see how a function/type is used across the codebase
- dead_code_check: Need to verify if a symbol is unused before removing it

**Note**: If symbol is imported from another file, the tool will automatically trace to its definition and search from there.

**Parameters**:
- path: File where the symbol **appears/is used** (NOT where it's defined). The symbol text must exist in this file.
- symbol: The name of the symbol to find references for (required)
- surrounding_code: Optional code snippet containing the symbol (e.g., "fetchUser(") for precise disambiguation when multiple matches exist
- start_line: Optional line number to begin search (1-based), useful when you know the approximate location
- include_declaration: Whether to include the declaration itself in results (default: true)
- max_results: Maximum results to return (default: 50)

**Important**: The symbol text must actually exist in the file. Don't use barrel/index files that only re-export via \`export * from\` - use a file where the symbol is actually written.

**Example**:
{
  "purpose": "impact_analysis",
  "path": "src/utils.ts",
  "symbol": "processData",
  "surrounding_code": "const result = processData(",
  "start_line": 20,
  "include_declaration": true,
  "max_results": 50
}`

export default {
	type: "function",
	function: {
		name: "find_references",
		description: FIND_REFERENCES_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				purpose: {
					type: "string",
					enum: ["impact_analysis", "usage_patterns", "dead_code_check"],
					description: "Why you need to find references - forces explicit reasoning",
				},
				path: {
					type: "string",
					description:
						"File path where the symbol appears/is used (relative to workspace). The symbol text must exist in this file.",
				},
				symbol: {
					type: "string",
					description: "Symbol name to find references for",
				},
				surrounding_code: {
					type: ["string", "null"],
					description:
						"Optional surrounding code snippet containing the symbol for precise disambiguation (e.g., 'processData('). This is literal text matching, not regex.",
				},
				start_line: {
					type: ["number", "null"],
					description:
						"Optional line number (1-based) to begin search, useful for locating symbols in specific regions",
				},
				include_declaration: {
					type: ["boolean", "null"],
					description: "Include the declaration itself in results (default: true)",
				},
				max_results: {
					type: ["number", "null"],
					description: "Maximum results to return (default: 50)",
				},
			},
			required: ["purpose", "path", "symbol"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
