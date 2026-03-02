import type OpenAI from "openai"

const REMINDER_DESCRIPTION = `Set a memo/reminder for yourself (overwrites any previous reminder — only one active at a time).
The content will appear as a \`<reminder>\` tag inside the \`<environment>\` block after N rounds (1 round = 1 assistant response).

**When to Use**: After breaking down a complex task, create a reminder summarizing:
1. The overall Objective
2. Key Results (checklist of what remains)
3. Current progress and next step

When a reminder fires, you MUST set a new reminder (with updated progress) alongside your next action.
- reminder({ content: "Objective: Migrate auth to JWT\\nDone: [x] token signing [x] login endpoint\\nNext: [ ] auth middleware [ ] frontend token\\nCurrent: implementing auth middleware", delay: 5 })`

export default {
	type: "function",
	function: {
		name: "reminder",
		description: REMINDER_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				content: {
					type: "string",
					description: "Reminder content: include objective, progress checklist, and next steps.",
				},
				delay: {
					type: ["number", "null"],
					description: "Rounds before reminder fires (default: 7). 1 round = 1 assistant response.",
				},
			},
			required: ["content", "delay"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
