import type OpenAI from "openai"

const ASK_FOLLOWUP_QUESTION_DESCRIPTION = `Ask the user a question to gather additional information needed to complete the task.

**When to Use**: User's true goal (Y) is unclear from their request (X).
- ask_followup_question({ type: "goal_discovery", question: "Virtual scrolling can solve several problems. Which one are you facing?", follow_up: [{ choice: "Performance - scrolling is laggy with 10k+ items", affect: "Virtual scrolling is the correct solution" }, { choice: "Slow initial load - too much data to render", affect: "Pagination might be simpler and equally effective" }] })

**When to Use**: You're genuinely uncertain and asking is your "third option" instead of guessing.
- ask_followup_question({ type: "honest_uncertainty", question: "I see two possible interpretations of this config. Which did you intend?", follow_up: [{ choice: "Option A: per-user settings", affect: "Will add user-scoped config store" }, { choice: "Option B: global settings", affect: "Will use existing global config" }] })

**When to Use**: Active verification (experiments/scripts) is not possible.
- ask_followup_question({ type: "passive_verification", question: "Does your production environment use Redis or Memcached?", follow_up: [{ choice: "Redis", affect: "Will use ioredis client library" }, { choice: "Memcached", affect: "Will use memjs client library" }] })`

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
						"Why you need to ask: goal_discovery (user's Y unclear), honest_uncertainty (your third option instead of guessing), passive_verification (active verification not possible).",
				},
				question: {
					type: "string",
					description: "Clear, specific question that captures the missing information you need.",
				},
				follow_up: {
					type: "array",
					description:
						"Required list of 2-4 suggested responses; each suggestion must be a complete, actionable answer.",
					items: {
						type: "object",
						properties: {
							choice: {
								type: "string",
								description: "The choice option the user can pick.",
							},
							affect: {
								type: "string",
								description:
									"The consequence or impact of selecting this choice, helping user understand what will happen.",
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
