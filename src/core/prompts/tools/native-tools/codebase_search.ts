import type OpenAI from "openai"

const CODEBASE_SEARCH_DESCRIPTION = `Find files most relevant to a search query using semantic search (meaning-based, not exact text match). Queries MUST be in English (translate if needed).

**When to Use**: First step for exploring unfamiliar code areas — before grep or file browsing.
- codebase_search({ query: "user authentication and password hashing", path: "src/auth" })
- codebase_search({ query: "database connection pooling" })

**When to Use**: Finding implementation details by describing behavior.
- codebase_search({ query: "how are API rate limits enforced" })
- codebase_search({ query: "where is the WebSocket reconnection logic" })`

const QUERY_PARAMETER_DESCRIPTION = `Meaning-based search query. Reuse the user's exact wording when possible — their phrasing often helps semantic search.`

const PATH_PARAMETER_DESCRIPTION = `Optional subdirectory (relative to workspace) to limit search scope. Leave null for entire workspace.`

export default {
	type: "function",
	function: {
		name: "codebase_search",
		description: CODEBASE_SEARCH_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: QUERY_PARAMETER_DESCRIPTION,
				},
				path: {
					type: ["string", "null"],
					description: PATH_PARAMETER_DESCRIPTION,
				},
			},
			required: ["query", "path"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
