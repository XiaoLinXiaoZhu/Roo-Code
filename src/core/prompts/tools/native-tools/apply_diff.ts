import type OpenAI from "openai"

const APPLY_DIFF_DESCRIPTION = `Apply precise, targeted modifications to an existing file using one or more search/replace blocks. This tool is for surgical edits only; the 'SEARCH' block must exactly match the existing content, including whitespace and indentation. To make multiple targeted changes, provide multiple SEARCH/REPLACE blocks in the 'diff' parameter. Use the 'read_file' tool first if you are not confident in the exact content to search for.

**Recommended Format:** Use Markdown code block format with \`\`\`apply_diff path syntax. This format requires zero escaping for newlines and quotes, making it more natural and readable. **Use 6 backticks (\`\`\`\`\`\`) for maximum compatibility** - this ensures any code blocks within your content won't conflict with the tool fence. Markdown format also supports multiple tool calls in a single message.

Example (Recommended - Markdown format with 6 backticks):
\`\`\`\`\`\`apply_diff src/utils/config.ts
<<<<<<< SEARCH
:start_line:15
-------
const defaultTimeout = 5000;
const maxRetries = 3;
=======
const defaultTimeout = 10000;
const maxRetries = 5;
>>>>>>> REPLACE
\`\`\`\`\`\`

Example (Alternative - JSON format):
{ "path": "src/utils/config.ts", "diff": "<<<<<<< SEARCH\\n:start_line:15\\n-------\\nconst defaultTimeout = 5000;\\nconst maxRetries = 3;\\n=======\\nconst defaultTimeout = 10000;\\nconst maxRetries = 5;\\n>>>>>>> REPLACE" }`

const DIFF_PARAMETER_DESCRIPTION = `A string containing one or more search/replace blocks defining the changes. The ':start_line:' is required and indicates the starting line number of the original content. You must not add a start line for the replacement content. Each block must follow this format:
<<<<<<< SEARCH
:start_line:[line_number]
-------
[exact content to find]
=======
[new content to replace with]
>>>>>>> REPLACE`

export const apply_diff = {
	type: "function",
	function: {
		name: "apply_diff",
		description: APPLY_DIFF_DESCRIPTION,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "The path of the file to modify, relative to the current workspace directory.",
				},
				diff: {
					type: "string",
					description: DIFF_PARAMETER_DESCRIPTION,
				},
			},
			required: ["path", "diff"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
