import type OpenAI from "openai"

const UPDATE_INTENT_DESCRIPTION = `Update an existing node in the Intent Tree (the <intent_tree> shown in environment).

**When to Use**: Starting work on a node.
- update_intent({ nodeId: "I1.1.1", status: "in_progress" })

**When to Use**: Marking work as complete.
- update_intent({ nodeId: "I1.1.1", status: "done" })

**When to Use**: Revising a node's description after clarification.
- update_intent({ nodeId: "G1", content: "Revised: optimize database queries specifically" })

**When to Use**: Marking an approach as superseded by a better one.
- update_intent({ nodeId: "A1.1", status: "superseded" })`

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
					description: "Node short ID (e.g., 'G1', 'O1.1', 'I1.1.1').",
				},
				status: {
					type: "string",
					enum: ["in_progress", "done", "superseded"],
					description: "New status for the node.",
				},
				content: {
					type: "string",
					description: "Updated description (optional).",
				},
			},
			required: ["nodeId"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
