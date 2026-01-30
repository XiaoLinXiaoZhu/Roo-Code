import type OpenAI from "openai"

// 工具描述：选择信息 + 调用示例
const ASK_FOLLOWUP_QUESTION_DESCRIPTION = `Ask the user a question to gather additional information needed to complete the task.

**When to Use**:
- goal_discovery: User's true goal (Y) is unclear from their request (X)
- honest_uncertainty: You're genuinely uncertain, asking is your "third option" instead of guessing
- passive_verification: Active verification (experiments/scripts) is not possible

**Example**:
{
  "type": "goal_discovery",
  "question": "Virtual scrolling can solve several problems. Which one are you facing?",
  "follow_up": [
    {"choice": "Performance - scrolling is laggy with 10k+ items", "affect": "Virtual scrolling is the correct solution"},
    {"choice": "Slow initial load - too much data to render", "affect": "Pagination might be simpler and equally effective"}
  ]
}`

export default {
	type: "function",
	function: {
		name: "ask_followup_question",
		description: ASK_FOLLOWUP_QUESTION_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				type: {
					type: "string",
					enum: ["goal_discovery", "honest_uncertainty", "passive_verification"],
					description:
						"Why you need to ask: goal_discovery (user's Y unclear), honest_uncertainty (your third option instead of guessing), passive_verification (active verification not possible)",
				},
				question: {
					type: "string",
					description: "Clear, specific question that captures the missing information you need",
				},
				follow_up: {
					type: "array",
					description:
						"Required list of 2-4 suggested responses; each suggestion must be a complete, actionable answer",
					items: {
						type: "object",
						properties: {
							choice: {
								type: "string",
								description: "The choice option the user can pick",
							},
							affect: {
								type: "string",
								description:
									"The consequence or impact of selecting this choice, helping user understand what will happen",
							},
						},
						required: ["choice", "affect"],
						additionalProperties: false,
					},
					minItems: 2,
					maxItems: 4,
				},
			},
			required: ["type", "question", "follow_up"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
