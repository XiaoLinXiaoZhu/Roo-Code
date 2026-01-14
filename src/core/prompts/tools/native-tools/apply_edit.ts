import type OpenAI from "openai"

const APPLY_EDIT_DESCRIPTION = `Edit and modify code in the project. This tool performs code changes based on clear, specific natural language instructions. Always use small, focused edits rather than broad refactoring tasks. Provide absolute file paths when possible. Break down large tasks into multiple smaller, targeted edits. IMPORTANT: After receiving the edit result, you MUST proactively verify the actual changes by reading the modified files to confirm the edits were applied correctly. Do not assume the edit was successful without verification.`

const INSTRUCTION_PARAMETER_DESCRIPTION = `A clear, specific instruction for a single focused change (e.g., "Replace the error handling in /workspace/project/src/utils/api.ts line 45-50 with a try-catch block", "Add an async keyword to the fetchUser function in /workspace/project/src/services/user.ts", "Update the return type from 'any' to 'User[]' in getUsers function"). Avoid broad instructions like "refactor the authentication module" - instead, break down into specific, actionable changes.`

const FILES_PARAMETER_DESCRIPTION = `Optional: Comma-separated list of absolute file paths or glob patterns to limit which files can be modified (e.g., "/workspace/project/src/components/Button.tsx,/workspace/project/src/auth/*.ts"). Use absolute paths instead of relative paths for clarity.`

const CONTEXT_PARAMETER_DESCRIPTION = `Optional: Additional context to help the subtask understand the edit (e.g., specific error messages, exact line numbers, code snippets showing the current implementation, design requirements, constraints)`

const VALIDATE_PARAMETER_DESCRIPTION = `Optional: Whether to run validation (lint, type-check) after the edit. Default is true. Set to false to skip validation for quick changes.`

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
			required: ["instruction"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
