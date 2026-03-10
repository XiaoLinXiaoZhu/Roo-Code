import type OpenAI from "openai"

const WRITE_DESCRIPTION = `Create or overwrite a file with the given content. Directories are created automatically. For modifying existing files, use the edit tool instead.

**When to Use**: Creating a new file.
- write({ path: "src/config.ts", content: "export const timeout = 10000;\\n" })

**When to Use**: Completely rewriting a small file.
- write({ path: "README.md", content: "# My Project\\n\\nDescription here.\\n" })

**Constraints**: Content must be the FULL intended file content — no placeholders or partial updates.`

export default {
	type: "function",
	function: {
		name: "write",
		description: WRITE_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "File path relative to the working directory.",
				},
				content: {
					type: "string",
					description: "Complete file content to write.",
				},
			},
			required: ["path", "content"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
