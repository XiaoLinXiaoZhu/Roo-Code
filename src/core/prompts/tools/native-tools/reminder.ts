import type OpenAI from "openai"

const REMINDER_DESCRIPTION = `Set a round-based reminder (overwrites any previous — only one active at a time).
Appears as \`<reminder id="N">\` in \`<environment>\` after the specified rounds (1 round = 1 assistant response). IDs auto-increment.

**How to use**:
1. Receive task → estimate scope → set reminder #1 with checklist + estimated rounds. Don't wait for investigation — investigation is a step in your checklist, not a prerequisite.
2. Execute across rounds.
3. When reminder fires → compare checklist vs actual progress → find deviation cause → set next reminder. No exceptions, even if you think you're almost done — "almost done" is an unverified estimate.

**delay = your workload estimate.** Set it based on how many rounds you think the current phase needs. If the reminder fires before you finish, that means your estimate was off — reflect on why before continuing.

**Write checklist items in content** so you can check them off when the reminder fires. Large task: detailed phases + delay 4-7. Small task: brief items + delay 2-3.

- reminder({ content: "Phase 1 Investigate (est. 3r):\\n[ ] Read module structure\\n[ ] Identify adapters\\n[ ] Design interface\\nPhase 2 Implement (est. 7r):\\n[ ] Alipay [ ] WeChat [ ] Stripe [ ] Migrate callers\\n⚠️ If Phase 1 incomplete at trigger → scope exceeded, re-evaluate", delay: 4 })
- reminder({ content: "unknown→string:\\n[ ] change signature [ ] update callers [ ] run tests\\nIf this fires → scope expanded, stop and re-evaluate.", delay: 3 })`

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
