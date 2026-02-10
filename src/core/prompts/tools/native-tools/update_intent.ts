import type OpenAI from "openai"

const UPDATE_INTENT_DESCRIPTION = `Update an existing intent node's status or content. Use the node's short ID (e.g., "G1", "P1.1").

Common usage:
- Mark a node as in progress: update_intent(nodeId: "P1.1", status: "in_progress")
- Mark a node as done: update_intent(nodeId: "I1.1.1", status: "done")
- Revise description: update_intent(nodeId: "G1", content: "revised goal")`

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
