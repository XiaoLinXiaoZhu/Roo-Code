import type OpenAI from "openai"

const GO_TO_DEFINITION_DESCRIPTION = `Find where a function, class, type, or variable is defined. Uses LSP for accurate code-structure-aware navigation — no false positives from comments or strings.

**When to Use**: Understanding how a function/class/type is implemented.
- find_definition({ purpose: "understand_implementation", path: "src/app.ts", symbol: "processData", surrounding_code: "const result = processData(", start_line: 20 })

**When to Use**: Tracing where an imported symbol comes from.
- find_definition({ purpose: "trace_import", path: "src/api.ts", symbol: "UserService", surrounding_code: "import { UserService }", start_line: 1 })

**When to Use**: Checking the exact signature or type definition.
- find_definition({ purpose: "verify_signature", path: "src/utils.ts", symbol: "Config", surrounding_code: "config: Config", start_line: null })`

export default {
	type: "function",
	function: {
		name: "find_definition",
		description: GO_TO_DEFINITION_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				purpose: {
					type: "string",
					enum: ["understand_implementation", "trace_import", "verify_signature"],
					description: "Why you need to find this definition — forces explicit reasoning.",
				},
				path: {
					type: "string",
					description:
						"File path where the symbol appears/is used (relative to workspace). NOT the definition file — the tool finds that for you.",
				},
				symbol: {
					type: "string",
					description:
						"Symbol name to find definition for. Must actually exist in the file — don't use barrel/index files that only re-export via `export * from`.",
				},
				surrounding_code: {
					type: ["string", "null"],
					description:
						"Optional code snippet containing the symbol for precise disambiguation (e.g., 'const result = fetchUser('). Literal text matching, not regex.",
				},
				start_line: {
					type: ["number", "null"],
					description:
						"Optional 1-based line number to begin search, useful for locating symbols in specific regions.",
				},
			},
			required: ["purpose", "path", "symbol", "surrounding_code", "start_line"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
