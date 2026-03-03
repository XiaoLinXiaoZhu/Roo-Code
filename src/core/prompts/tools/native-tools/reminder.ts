import type OpenAI from "openai"

const REMINDER_DESCRIPTION = `Set a round-based reminder (overwrites any previous — only one active at a time).
Appears as \`<reminder id="N">\` in \`<environment>\` after the specified delay (1 round = 1 assistant response). delay=n fires after n rounds (on round n+1). IDs auto-increment.

**How to use**:
1. Receive task → count tool calls (not concept steps!) → set reminder #1 with checklist. "Read module" = N files = N rounds. Always count files.
2. Execute across rounds.
3. When reminder fires → compare checklist vs actual → IMMEDIATELY set next reminder before doing anything else.
4. Finish early? → Call reminder() with completion summary to overwrite the stale one.

**delay is a checkpoint interval, not an ETA.** It answers: "how many rounds am I willing to execute without reflecting?"
- Small task (5-8r total): delay 3-4
- Medium task (8-15r): delay 4-5
- Large task (15-30r): delay 5-7
- Never exceed delay=7. If you need more, break into phases.

- reminder({ content: "Refactor payment (~20r est)\\nPhase 1 Investigate (est. 5-6r):\\n[ ] Read 4 files [ ] find_usages [ ] Design interface\\nPhase 2 Implement (est. 8-10r):\\n[ ] 3 adapters [ ] Migrate 12 callers\\n⚠️ If Phase 1 incomplete → scope exceeded", delay: 5 })
- reminder({ content: "unknown→string (est. 5-6r):\\n[ ] read file [ ] find_usages [ ] change sig [ ] update callers [ ] test", delay: 3 })
- reminder({ content: "✅ Done (6r actual vs 5-6r est). 5 callers, all simple. Calibration: delay=3 was right.", delay: 1 })`

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
					description:
						"Number of rounds after which the reminder fires (default: 7). delay=n fires after n rounds, on round n+1. 1 round = 1 assistant response.",
				},
			},
			required: ["content", "delay"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
