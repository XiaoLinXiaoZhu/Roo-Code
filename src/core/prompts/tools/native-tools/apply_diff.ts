import type OpenAI from "openai"

/**
 * @deprecated This tool is no longer actively used. Replaced by edit (exact replacement) or apply_edit (agent-based).
 * Kept for backward compatibility only — do not maintain.
 */
const APPLY_DIFF_DESCRIPTION = `Apply precise, surgical text replacements to a file. Requires exact content matching.

**When to Use**:
- Single-point precise modification with known content
- Simple insert/replace where you have exact code
- Quick changes without validation overhead

**Example**:
apply_diff({ path: "src/utils/config.ts", diff: "<<<<<<< SEARCH\\n:start_line:15\\n-------\\nconst defaultTimeout = 5000;\\n=======\\nconst defaultTimeout = 10000;\\n>>>>>>> REPLACE" })`

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
