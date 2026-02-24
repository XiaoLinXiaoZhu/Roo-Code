import type OpenAI from "openai"

const UPDATE_TODO_LIST_DESCRIPTION = `Replace the entire TODO list with an updated checklist reflecting the current state. Always provide the full list — the system overwrites the previous one.

**When to Use**: Task involves multiple steps and benefits from progress tracking.
- update_todo_list({ todos: "[x] Analyze requirements\\n[x] Design architecture\\n[-] Implement core logic\\n[ ] Write tests\\n[ ] Update documentation" })

**When to Use**: Updating status after completing a step or discovering new items.
- update_todo_list({ todos: "[x] Analyze requirements\\n[x] Design architecture\\n[x] Implement core logic\\n[-] Write tests\\n[ ] Update documentation\\n[ ] Add performance benchmarks" })

**When NOT to Use**: Single trivial task, or task completable in one or two simple steps.

**Checklist format**: Single-level markdown, in execution order. Status: [ ] pending, [x] completed, [-] in progress.`

export default {
	type: "function",
	function: {
		name: "update_todo_list",
		description: UPDATE_TODO_LIST_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				todos: {
					type: "string",
					description:
						"Full markdown checklist in execution order. Use [ ] for pending, [x] for completed, [-] for in progress.",
				},
			},
			required: ["todos"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
