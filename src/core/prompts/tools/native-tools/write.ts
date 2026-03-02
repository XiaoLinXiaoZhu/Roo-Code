import type OpenAI from "openai"

const WRITE_DESCRIPTION = `Write or edit a file. Two modes based on whether \`search\` is provided:

**Full file write** (search omitted/empty): Creates or overwrites the entire file.
- write({ path: "src/config.ts", content: "export const timeout = 10000;\\n", search: null, expected_matches: null })

**Search & replace** (search provided): Finds and replaces text in an existing file.
- write({ path: "src/config.ts", search: "timeout = 5000", content: "timeout = 10000", expected_matches: 1 })

Constraints:
- For search & replace: search must match exactly (including whitespace/indentation). Read the file first.
- expected_matches (default 1) asserts match count — mismatch returns an error instead of editing.
- Prefer editing over full file write for existing files. Full rewrite requires complete content — no placeholders.`

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
					description: "For full write: complete file content. For search & replace: replacement text.",
				},
				search: {
					type: ["string", "null"],
					description: "Text to find. Null/empty = full file write. Must match exactly including whitespace.",
				},
				expected_matches: {
					type: ["number", "null"],
					description:
						"Expected number of matches (default: 1). Mismatch = error. Only for search & replace.",
				},
			},
			required: ["path", "content", "search", "expected_matches"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
