import type OpenAI from "openai"

const SEARCH_PROJECT_DESCRIPTION = `Search and investigate the project codebase. This tool performs read-only exploration of the codebase to search for files and answer questions about project structure, dependencies, or implementation details. When using this tool, always consider providing a schema parameter to structure the output format for better integration with subsequent operations.`

const QUERY_PARAMETER_DESCRIPTION = `Natural language query describing what you want to search for (e.g., "Find all files handling user authentication", "What databases are used in this project?")`

const SCOPE_DIRECTORIES_DESCRIPTION = `Optional: Comma-separated list of directories to limit the search scope (e.g., "src/auth,src/api")`

const SCOPE_FILE_PATTERNS_DESCRIPTION = `Optional: Glob patterns to filter files (e.g., "*.ts,*.tsx")`

const SCOPE_EXCLUDES_DESCRIPTION = `Optional: Glob patterns to exclude from search (e.g., "node_modules,*.test.ts")`

const SCHEMA_PARAMETER_DESCRIPTION = `Optional: JSON schema to structure the output. When provided, the result will be formatted according to this schema.`

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
					description: "Optional search scope configuration",
					properties: {
						directories: {
							type: "string",
							description: SCOPE_DIRECTORIES_DESCRIPTION,
						},
						filePatterns: {
							type: "string",
							description: SCOPE_FILE_PATTERNS_DESCRIPTION,
						},
						excludes: {
							type: "string",
							description: SCOPE_EXCLUDES_DESCRIPTION,
						},
					},
					additionalProperties: false,
				},
				schema: {
					type: ["string", "null"],
					description: SCHEMA_PARAMETER_DESCRIPTION,
				},
			},
			required: ["query"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
