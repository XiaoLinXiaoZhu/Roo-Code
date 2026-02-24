import type OpenAI from "openai"

const EDIT_DESCRIPTION = `Perform exact string replacement in a file. Finds old_string and replaces it with new_string.

**When to Use**: Single precise text replacement in a file you've already read.
- edit({ file_path: "src/config.ts", old_string: "const timeout = 5000;", new_string: "const timeout = 10000;" })

**When to Use**: Renaming a variable/function across an entire file.
- edit({ file_path: "src/utils.ts", old_string: "oldName", new_string: "newName", replace_all: true })

**Constraints**: You must read the file before editing. The edit fails if old_string is not unique — provide more surrounding context to disambiguate, or use replace_all.`

const edit = {
	type: "function",
	function: {
		name: "edit",
		description: EDIT_DESCRIPTION,
		parameters: {
			type: "object",
			properties: {
				file_path: {
					type: "string",
					description: "File path relative to the working directory.",
				},
				old_string: {
					type: "string",
					description:
						"Exact text to find. Must match exactly including all whitespace, indentation, and line endings. Never include line number prefixes from read output.",
				},
				new_string: {
					type: "string",
					description: "Replacement text. Must include all necessary whitespace and indentation.",
				},
				replace_all: {
					type: "boolean",
					description:
						"When true, replaces ALL occurrences. When false (default), replaces only the first and errors if multiple matches exist.",
					default: false,
				},
			},
			required: ["file_path", "old_string", "new_string"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

export default edit
