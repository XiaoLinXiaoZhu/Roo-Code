import type OpenAI from "openai"

const APPLY_EDIT_DESCRIPTION = `Edit and modify code in the project. This tool performs code changes based on natural language instructions. It supports creating new files, modifying existing files, and refactoring code.`

const INSTRUCTION_PARAMETER_DESCRIPTION = `Natural language instruction describing the edit to make (e.g., "Change the error handling to try-catch", "Add type annotations to all parameters", "Create a new UserAvatar component")`

const FILES_PARAMETER_DESCRIPTION = `Optional: Comma-separated list of file paths or glob patterns to limit which files can be modified (e.g., "src/components/Button.tsx,src/auth/*.ts")`

const CONTEXT_PARAMETER_DESCRIPTION = `Optional: Additional context to help the subtask understand the edit (e.g., error messages, design requirements, constraints)`

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
