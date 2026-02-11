import type OpenAI from "openai"

const UPDATE_INTENT_DESCRIPTION = `Update an existing node in the Intent Tree (the <intent_tree> shown in environment).

**When to use (instead of add_intent):**
- User asks to "check/verify/continue/fix" something → find the related node and update it
- Completing work on a node → mark as done
- Starting work → mark as in_progress
- Goal clarified/refined → update content

**Common usage:**
- Mark in progress: update_intent(nodeId: "P1.1", status: "in_progress")
- Mark done: update_intent(nodeId: "I1.1.1", status: "done")
- Revise description: update_intent(nodeId: "G1", content: "revised goal")
- Mark superseded: update_intent(nodeId: "P1.1", status: "superseded") — when replaced by better approach`

export default {
	type: "function",
	function: {
		name: "update_intent",
		description: UPDATE_INTENT_DESCRIPTION,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				nodeId: {
					type: "string",
					description: "Node short ID (e.g., 'G1', 'P1.1', 'I1.1.1')",
				},
				status: {
					type: "string",
					enum: ["in_progress", "done", "superseded"],
					description: "New status",
				},
				content: {
					type: "string",
					description: "Updated description (optional)",
				},
			},
			required: ["nodeId"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
