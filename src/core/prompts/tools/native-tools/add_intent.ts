import type OpenAI from "openai"

const ADD_INTENT_DESCRIPTION = `Add a new node to the Intent Tree (the <intent_tree> shown in environment). Check existing nodes first — don't create duplicates.

**When to Use**: User has a genuinely NEW objective with no related node in the tree.
- add_intent({ assumption: "No existing goal about performance. User wants to optimize API response times.", parentId: null, type: "goal", content: "Optimize API performance" })

**When to Use**: Adding a concrete sub-objective or approach under an existing goal.
- add_intent({ assumption: "G1 is about performance. Caching is one approach to try.", parentId: "G1", type: "approach", content: "Use Redis caching for hot queries" })

**When to Use**: Recording an atomic code change under an approach.
- add_intent({ assumption: "A1.1 is the caching approach. This impl adds the cache layer.", parentId: "A1.1", type: "impl", content: "Add cache middleware in UserService" })

**When NOT to Use**: Node already exists for this topic — use update_intent instead. User asks to check/verify/continue/fix existing work — operate on existing node.`

export default {
	type: "function",
	function: {
		name: "add_intent",
		description: ADD_INTENT_DESCRIPTION,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				assumption: {
					type: "string",
					description:
						"Reason about placement: (1) Which existing nodes did you consider? (2) How does this serve its parent's goal? (3) What must be true for this to work? When disproven, prune the node.",
				},
				parentId: {
					type: "string",
					description: "Parent node's short ID (e.g., 'G1', 'O1.1'). Omit to create a new root node.",
				},
				type: {
					type: "string",
					enum: ["goal", "objective", "approach", "impl"],
					description:
						"Node type: goal (stable WHY), objective (concrete subset of goal), approach (replaceable method — try another if this fails), impl (ONE atomic code change ≈ one commit).",
				},
				content: {
					type: "string",
					description: "Natural language description of the intent.",
				},
			},
			required: ["assumption", "type", "content"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
