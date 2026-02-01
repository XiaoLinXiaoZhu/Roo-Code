import type OpenAI from "openai"

const APPLY_EDIT_DESCRIPTION = `Edit and modify code using natural language instructions. Performs batch modifications with automatic validation (tsc, lint, tests).

**When to Use (vs apply_diff)**:
- Batch/multi-location changes in one instruction
- Need automatic validation after changes
- Complex changes requiring context understanding
- Don't want to manually track exact code content

**Example**:
{
  "instruction": "Add null checks to all database query functions in /workspace/src/db/queries.ts",
  "files": "/workspace/src/db/queries.ts",
  "context": "Use early return pattern, throw DatabaseError for null results",
  "validate": "true"
}`

const INSTRUCTION_PARAMETER_DESCRIPTION = `Clear, specific instruction describing the change. Include file paths and line numbers when known. Examples:
- "Add error handling to fetchUser function in /workspace/src/api.ts"
- "Replace all console.log with logger.debug in /workspace/src/utils/*.ts"
- "Update return type from 'any' to 'User[]' in getUsers function"`

const FILES_PARAMETER_DESCRIPTION = `Optional: Comma-separated absolute file paths or glob patterns to limit scope (e.g., "/workspace/src/auth/*.ts"). Helps focus the edit and improves accuracy.`

const CONTEXT_PARAMETER_DESCRIPTION = `Optional: Additional context for the edit - error messages, code snippets, design requirements, or constraints that help understand the intent.`

const VALIDATE_PARAMETER_DESCRIPTION = `Optional: Validation command to run after edit. Examples:
- "none" - skip validation
- "npm run typecheck" - run specific command
- "pytest tests/" - run tests
If not specified, sub-agent will choose appropriate validation based on project type.`

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
					description: INSTRUCTION_PARAMETER_DESCRIPTION,
				},
				files: {
					type: ["string", "null"],
					description: FILES_PARAMETER_DESCRIPTION,
				},
				context: {
					type: ["string", "null"],
					description: CONTEXT_PARAMETER_DESCRIPTION,
				},
				validate: {
					type: ["string", "null"],
					description: VALIDATE_PARAMETER_DESCRIPTION,
				},
			},
			required: ["instruction", "files", "context", "validate"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
