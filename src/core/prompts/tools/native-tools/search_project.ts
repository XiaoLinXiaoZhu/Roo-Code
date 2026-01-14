import type OpenAI from "openai"

const SEARCH_PROJECT_DESCRIPTION = `Search and investigate the project codebase. This tool performs read-only exploration of the codebase to answer specific questions about project structure, dependencies, or implementation details. Always use complete questions rather than keywords, and provide absolute paths when possible. It is highly recommended to provide a schema parameter to structure the output format, which ensures the investigation aligns with your requirements and yields results in the exact format you need for subsequent operations.`

const QUERY_PARAMETER_DESCRIPTION = `A complete question describing what you want to investigate (e.g., "Where is the user authentication flow implemented?", "How are database connections initialized in the application?", "Which files define the API endpoints for the authentication service?"). Avoid keywords or incomplete phrases - always form a clear, complete question.`

const SCOPE_DIRECTORIES_DESCRIPTION = `Optional: Comma-separated list of absolute directory paths to limit the search scope (e.g., "/workspace/project/src/auth,/workspace/project/src/api"). Use absolute paths instead of relative paths.`

const SCOPE_FILE_PATTERNS_DESCRIPTION = `Optional: Glob patterns to filter files (e.g., "*.ts,*.tsx"). Combined with absolute directory paths for precise targeting.`

const SCOPE_EXCLUDES_DESCRIPTION = `Optional: Glob patterns to exclude from search (e.g., "node_modules,*.test.ts,dist")`

const SCHEMA_PARAMETER_DESCRIPTION = `Recommended: JSON schema to structure the output. When provided, the result will be formatted according to this schema. Using a schema ensures the investigation aligns with your requirements and yields results in the exact format you need. Example schemas: {"type":"object","properties":{"files":{"type":"array","items":{"type":"string"}},"summary":{"type":"string"}}}`

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
