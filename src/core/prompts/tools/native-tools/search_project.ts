import type OpenAI from "openai"

const SEARCH_PROJECT_DESCRIPTION = `Search and investigate the project codebase to answer questions about project structure, dependencies, or implementation details.

When to Use:
- Need to understand project structure or implementation details
- Need to locate where specific functionality is implemented
- Need to understand dependencies or data flow

When NOT to Use:
- Already know the file path → use read_file directly
- Simple text search → use search_files instead

Example:
{
  "query": "Where is the user authentication flow implemented?",
  "scope": null,
  "schema": "{\\"type\\":\\"object\\",\\"properties\\":{\\"files\\":{\\"type\\":\\"array\\",\\"items\\":{\\"type\\":\\"string\\"}}}}"
}`

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
					description:
						"Optional search scope configuration. Pass null to search the entire project, or provide an object with directories, filePatterns, and/or excludes to limit the search scope.",
					properties: {
						directories: {
							type: ["string", "null"],
							description: SCOPE_DIRECTORIES_DESCRIPTION,
						},
						filePatterns: {
							type: ["string", "null"],
							description: SCOPE_FILE_PATTERNS_DESCRIPTION,
						},
						excludes: {
							type: ["string", "null"],
							description: SCOPE_EXCLUDES_DESCRIPTION,
						},
					},
					required: ["directories", "filePatterns", "excludes"],
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
