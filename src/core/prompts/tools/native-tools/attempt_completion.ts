import type OpenAI from "openai"

const ATTEMPT_COMPLETION_DESCRIPTION = `Present the final result of your work to the user. The user may respond with feedback for improvements.

**When to Use**: All tool uses have succeeded and the task is confirmed complete.
- attempt_completion({ result: "I've updated the CSS to use flexbox layout for better responsiveness" })

**IMPORTANT**: This tool CANNOT be used until you've confirmed that all previous tool uses were successful. Failure to do so will result in code corruption. The result must be final — don't end with questions or offers for further assistance.`

export default {
	type: "function",
	function: {
		name: "attempt_completion",
		description: ATTEMPT_COMPLETION_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				result: {
					type: "string",
					description:
						"Final result message to deliver to the user. Formulate as a definitive statement, not a question.",
				},
			},
			required: ["result"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
