import type OpenAI from "openai"

const EDIT_DESCRIPTION = `Edit a file by replacing exact text matches. This is the primary tool for all code modifications — from single-line fixes to multi-location refactors. The file must already exist.

**When to Use**: Single-location change with known content.
- edit({ path: "src/config.ts", search: "const timeout = 5000;", replace: "const timeout = 10000;", expectedMatches: null })

**When to Use**: Renaming or replacing a pattern across an entire file.
- edit({ path: "src/utils.ts", search: "oldName", replace: "newName", expectedMatches: 3 })

**When to Use**: Multi-step refactor — call edit multiple times in sequence.
- First: edit({ path: "src/api.ts", search: "import { old } from './lib';", replace: "import { new } from './lib';", expectedMatches: null })
- Then: edit({ path: "src/api.ts", search: "old(", replace: "new(", expectedMatches: 4 })

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
