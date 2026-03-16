import type OpenAI from "openai"

const APPLY_EDIT_DESCRIPTION = `Edit and modify code using natural language instructions. This is the primary tool for all code modifications — from single-line fixes to multi-file refactors. A sub-agent reads the relevant files, applies your described changes, and validates the result.

**When to Use**: Single-location change described in plain language.
- apply_edit({ instruction: "Change the default timeout from 5000 to 10000 in src/config.ts", files: "src/config.ts", context: null, validate: "none" })

**When to Use**: Multi-location or cross-file changes in one instruction.
- apply_edit({ instruction: "Replace all console.log with logger.debug in /workspace/src/utils/*.ts", files: "/workspace/src/utils/*.ts", context: null, validate: "npm run typecheck" })

**When to Use**: Complex refactor requiring context understanding.
- apply_edit({ instruction: "Add null checks to all database query functions", files: "/workspace/src/db/queries.ts", context: "Use early return pattern, throw DatabaseError for null results", validate: "true" })`

export default {
	type: "function",
	function: {
		name: "apply_edit",
		description: APPLY_EDIT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				instruction: {
					type: "string",
					description:
						"Clear, specific instruction describing the change. Include file paths and line numbers when known.",
				},
				files: {
					type: ["string", "null"],
					description:
						"Optional: Comma-separated absolute file paths or glob patterns to limit scope. Helps focus the edit and improves accuracy.",
				},
				context: {
					type: ["string", "null"],
					description:
						"Optional: Additional context — error messages, code snippets, design requirements, or constraints.",
				},
				validate: {
					type: ["string", "null"],
					description:
						'Optional: Validation command to run after edit (e.g., "npm run typecheck", "pytest tests/", "none" to skip). If not specified, auto-chosen based on project type.',
				},
			},
			required: ["instruction", "files", "context", "validate"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
