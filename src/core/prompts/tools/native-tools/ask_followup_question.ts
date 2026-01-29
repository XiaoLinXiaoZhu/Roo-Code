import type OpenAI from "openai"

const ASK_FOLLOWUP_QUESTION_DESCRIPTION = `Ask the user a question to gather additional information needed to complete the task. Use when you need clarification or more details to proceed effectively.

**When to Use (Spirit-Aligned)**:

1. **Goal Discovery (Result Orientation)**
   - When user's request (X) is unclear about the true goal (Y)
   - Present possible goals with their consequences to help user choose
   - Example: "Virtual scrolling can solve several problems. Which one are you facing?"

2. **Honest Uncertainty (Radical Honesty)**
   - When you're uncertain and need user input to verify
   - This is your "third option" - instead of guessing, ask
   - Example: "I'm not sure if this file should be deleted. Is it still in use?"

3. **Passive Verification (Certainty Pursuit)**
   - When active verification is not possible and you need user-provided information
   - Note: Active verification (designing experiments) is preferred when possible

**How to Ask Well**:
- Always provide 2-4 suggested answers with consequences
- Each suggestion should be complete and actionable
- Help user make informed decisions, don't just ask open-ended questions`

const QUESTION_PARAMETER_DESCRIPTION = `Clear, specific question that captures the missing information you need`

const FOLLOW_UP_PARAMETER_DESCRIPTION = `Required list of 2-4 suggested responses; each suggestion must be a complete, actionable answer`

const FOLLOW_UP_CHOICE_DESCRIPTION = `The choice option the user can pick`

const FOLLOW_UP_AFFECT_DESCRIPTION = `The consequence or impact of selecting this choice, helping user understand what will happen`

export default {
	type: "function",
	function: {
		name: "ask_followup_question",
		description: ASK_FOLLOWUP_QUESTION_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				question: {
					type: "string",
					description: QUESTION_PARAMETER_DESCRIPTION,
				},
				follow_up: {
					type: "array",
					description: FOLLOW_UP_PARAMETER_DESCRIPTION,
					items: {
						type: "object",
						properties: {
							choice: {
								type: "string",
								description: FOLLOW_UP_CHOICE_DESCRIPTION,
							},
							affect: {
								type: "string",
								description: FOLLOW_UP_AFFECT_DESCRIPTION,
							},
						},
						required: ["choice", "affect"],
						additionalProperties: false,
					},
					minItems: 2,
					maxItems: 4,
				},
			},
			required: ["question", "follow_up"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
