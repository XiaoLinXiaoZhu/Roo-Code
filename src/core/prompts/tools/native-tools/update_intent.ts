import type OpenAI from "openai"

const UPDATE_INTENT_DESCRIPTION = `Update an existing node in the Intent Tree (the <intent_tree> shown in environment).

**When to Use**: Starting work on a node.
- update_intent({ node_id: "I1.1.1", status: "in_progress" })

**When to Use**: Marking work as complete.
- update_intent({ node_id: "I1.1.1", status: "done" })

**When to Use**: Revising a node's description after clarification.
- update_intent({ node_id: "G1", content: "Revised: optimize database queries specifically" })

**When to Use**: Marking an approach as superseded by a better one.
- update_intent({ node_id: "A1.1", status: "superseded" })`

export default {
	type: "function",
	function: {
		name: "update_intent",
		strict: true,
		description: UPDATE_INTENT_DESCRIPTION,
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				node_id: {
					type: "string",
					description: "Node short ID (e.g., 'G1', 'O1.1', 'I1.1.1').",
				},
				status: {
					type: ["string", "null"],
					enum: ["in_progress", "done", "superseded"],
					description: "New status for the node.",
				},
				content: {
					type: ["string", "null"],
					description: "Updated description (optional).",
				},
			},
			required: ["node_id", "status", "content"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
