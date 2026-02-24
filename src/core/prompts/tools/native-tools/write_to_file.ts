import type OpenAI from "openai"

const WRITE_TO_FILE_DESCRIPTION = `Write complete content to a file. Creates new files or overwrites existing ones. Automatically creates directories as needed.

**When to Use**:
- new_file: Creating a new file that doesn't exist
- complete_rewrite: Intentionally replacing entire file content
- small_file_update: Updating a small file where diff tools are overkill

**Important**: Prefer editing tools (apply_diff, apply_edit) for modifying existing files. This tool is slower and requires complete file content.

**Example**:
write_to_file({ purpose: "new_file", path: "frontend-config.json", content: "{\n  \\"apiEndpoint\\": \\"https://api.example.com\\"\n}" })`

export default {
	type: "function",
	function: {
		name: "write_to_file",
		description: WRITE_TO_FILE_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				purpose: {
					type: "string",
					enum: ["new_file", "complete_rewrite", "small_file_update"],
					description:
						"Why you're using write_to_file instead of editing tools. Forces explicit justification.",
				},
				path: {
					type: "string",
					description: "File path relative to workspace directory",
				},
				content: {
					type: "string",
					description:
						"Complete file content. Must be the FULL intended content - no placeholders or partial updates allowed.",
				},
			},
			required: ["purpose", "path", "content"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
