import type OpenAI from "openai"

const PRUNE_INTENT_DESCRIPTION = `Abandon a path/implementation and all its descendants. Use when the user changes direction.

This marks the node and all children as "pruned" and lists associated git commits that may need reverting.

Example: User says "try a different approach" → prune_intent(nodeId: "P1.1", reason: "user wants different approach")`

export default {
	type: "function",
	function: {
		name: "prune_intent",
		description: PRUNE_INTENT_DESCRIPTION,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				nodeId: {
					type: "string",
					description: "Node short ID to prune (e.g., 'P1.1')",
				},
				reason: {
					type: "string",
					description: "Why this path is being abandoned",
				},
			},
			required: ["nodeId"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
