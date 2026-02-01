import type OpenAI from "openai"

const APPLY_DIFF_DESCRIPTION = `Apply precise, surgical text replacements to a file. Requires exact content matching.

**When to Use (vs apply_edit)**:
- Single-point precise modification with known content
- Simple insert/replace where you have exact code
- Quick changes without validation overhead

Use Markdown code block format with \`\`\`apply_diff path syntax. **Use 6 backticks for maximum compatibility**.

**Example**:
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
\`\`\`\`\`\``

const DIFF_PARAMETER_DESCRIPTION = `One or more search/replace blocks. The ':start_line:' is required. SEARCH content must exactly match existing code including whitespace.

Format:
<<<<<<< SEARCH
:start_line:[line_number]
-------
[exact content to find]
=======
[new content]
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
					description: "File path relative to workspace directory.",
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
