import type OpenAI from "openai"

const GO_TO_DEFINITION_DESCRIPTION = `Jump to the definition of a symbol using LSP (Language Server Protocol). More accurate than grep - follows imports and understands code structure.

**When to Use**:
- understand_implementation: Need to see how a function/class/type is implemented
- trace_import: Need to find where an imported symbol comes from
- verify_signature: Need to check the exact signature or type definition

**Parameters**:
- symbol: The name of the symbol to find (required)
- surrounding_code: Optional code snippet containing the symbol (e.g., "const result = fetchUser(") for precise disambiguation when multiple matches exist
- start_line: Optional line number to begin search (1-based), useful when you know the approximate location

**Example**:
{
  "purpose": "understand_implementation",
  "path": "src/app.ts",
  "symbol": "processData",
  "surrounding_code": "const result = processData(",
  "start_line": 20
}`

export default {
	type: "function",
	function: {
		name: "go_to_definition",
		description: GO_TO_DEFINITION_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				purpose: {
					type: "string",
					enum: ["understand_implementation", "trace_import", "verify_signature"],
					description: "Why you need to find this definition - forces explicit reasoning",
				},
				path: {
					type: "string",
					description: "File path where the symbol is located (relative to workspace)",
				},
				symbol: {
					type: "string",
					description: "Symbol name to find definition for",
				},
				surrounding_code: {
					type: ["string", "null"],
					description:
						"Optional surrounding code snippet containing the symbol for precise disambiguation (e.g., 'const result = fetchUser('). This is literal text matching, not regex.",
				},
				start_line: {
					type: ["number", "null"],
					description:
						"Optional line number (1-based) to begin search, useful for locating symbols in specific regions",
				},
			},
			required: ["purpose", "path", "symbol"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
