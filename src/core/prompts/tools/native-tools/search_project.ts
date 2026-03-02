import type OpenAI from "openai"

const SEARCH_PROJECT_DESCRIPTION = `Search and investigate the project codebase to answer questions about project structure, dependencies, or implementation details.

**When to Use**: Understanding project structure or locating functionality.
- search_project({ query: "Where is the user authentication flow implemented?", scope: null, schema: "{\\"type\\":\\"object\\",\\"properties\\":{\\"files\\":{\\"type\\":\\"array\\",\\"items\\":{\\"type\\":\\"string\\"}}}}" })

**When to Use**: Understanding dependencies or data flow with scoped search.
- search_project({ query: "How are database connections initialized?", scope: { directories: "/workspace/src/db", file_patterns: "*.ts", excludes: "*.test.ts" }, schema: null })

**When NOT to Use**: Already know the file path (use execute_command to read directly), or need simple text search (use execute_command with grep).`

const QUERY_PARAMETER_DESCRIPTION = `A complete question describing what you want to investigate. Avoid keywords or incomplete phrases — always form a clear, complete question.`

const SCHEMA_PARAMETER_DESCRIPTION = `Recommended: JSON schema to structure the output. Ensures the investigation yields results in the exact format you need.`

export default {
	type: "function",
	function: {
		name: "search_project",
		description: SEARCH_PROJECT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: QUERY_PARAMETER_DESCRIPTION,
				},
				scope: {
					type: ["object", "null"],
					description:
						"Optional search scope. Pass null for entire project, or provide directories/file_patterns/excludes to limit scope.",
					properties: {
						directories: {
							type: ["string", "null"],
							description: "Comma-separated absolute directory paths to limit search scope.",
						},
						file_patterns: {
							type: ["string", "null"],
							description: 'Glob patterns to filter files (e.g., "*.ts,*.tsx").',
						},
						excludes: {
							type: ["string", "null"],
							description: 'Glob patterns to exclude (e.g., "node_modules,*.test.ts,dist").',
						},
					},
					required: ["directories", "file_patterns", "excludes"],
					additionalProperties: false,
				},
				schema: {
					type: ["string", "null"],
					description: SCHEMA_PARAMETER_DESCRIPTION,
				},
			},
			required: ["query", "scope", "schema"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
