import type OpenAI from "openai"

const PRUNE_INTENT_DESCRIPTION = `Abandon a node in the Intent Tree and all its descendants. Marks them as "pruned" and lists associated git commits that may need reverting.

**When to Use**: User changes direction or an approach is failing.
- prune_intent({ node_id: "A1.1", reason: "Caching approach too complex, trying a simpler optimization" })

**When to Use**: Cleaning up obsolete goals or objectives.
- prune_intent({ node_id: "G2", reason: "User no longer needs this feature" })`

export default {
	type: "function",
	function: {
		name: "prune_intent",
		strict: true,
		description: PRUNE_INTENT_DESCRIPTION,
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				node_id: {
					type: "string",
					description: "Node short ID to prune (e.g., 'A1.1', 'G2').",
				},
				reason: {
					type: ["string", "null"],
					description: "Why this path is being abandoned.",
				},
			},
			required: ["node_id", "reason"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
