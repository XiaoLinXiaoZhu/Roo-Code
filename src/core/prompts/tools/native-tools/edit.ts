import type OpenAI from "openai"

const EDIT_DESCRIPTION = `Edit a file by replacing exact text matches. The file must already exist. Use expectedMatches to assert the number of replacements.

**When to Use**: Single precise text replacement in a file you've already read.
- edit({ path: "src/config.ts", search: "const timeout = 5000;", replace: "const timeout = 10000;", expectedMatches: null })

**When to Use**: Replacing all occurrences of a pattern.
- edit({ path: "src/utils.ts", search: "oldName", replace: "newName", expectedMatches: 3 })

**Constraints**: You must read the file before editing. search must match exactly including whitespace and indentation. expectedMatches defaults to 1 — mismatch returns an error.`

export default {
	type: "function",
	function: {
		name: "edit",
		description: EDIT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "File path relative to the working directory.",
				},
				search: {
					type: "string",
					description: "Exact text to find in the file. Must match exactly including whitespace.",
				},
				replace: {
					type: "string",
					description: "Replacement text.",
				},
				expectedMatches: {
					type: ["number", "null"],
					description: "Expected number of matches (default: 1). Mismatch = error.",
				},
			},
			required: ["path", "search", "replace", "expectedMatches"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
