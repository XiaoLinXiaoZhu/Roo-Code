import type OpenAI from "openai"

const REMINDER_DESCRIPTION = `Set a memo/reminder for yourself (overwrites any previous — only one active at a time).
The content will appear as \`<reminder id="N">\` in \`<environment>\` after the specified delay (1 round = 1 assistant response). delay=n fires after n rounds (on round n+1). IDs auto-increment.

**Usage**: After breaking down the task, create a reminder summarizing:
1. The overall Objective
2. Key Results (checklist of concrete steps remaining)
3. Current progress and next step

When a reminder fires, you MUST set a new reminder (with updated progress) alongside your next tool call. Finish early? Call reminder() with a completion summary to overwrite the stale one.

**delay is a checkpoint interval, not an ETA.**
- Small task (5-8r total): delay 5-8
- Medium task (8-15r): delay 8-15
- Large task (15-30r): delay 15-30
- Never exceed delay=30.`

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
					description: "Reminder content: include OKR summary, progress status, and next steps.",
				},
				delay: {
					type: ["number", "null"],
					description: "Number of rounds after which the reminder fires (default: 7).",
				},
			},
			required: ["content", "delay"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
