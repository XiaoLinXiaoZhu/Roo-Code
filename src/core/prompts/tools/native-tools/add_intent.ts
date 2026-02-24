import type OpenAI from "openai"

const ADD_INTENT_DESCRIPTION = `Add a new node to the Intent Tree (the <intent_tree> shown in environment).

**⚠️ BEFORE CALLING: Check <intent_tree> in environment first!**
- If a related node exists → use update_intent or add as child, NOT a new root goal
- If user's request is about an existing node (check, verify, continue, fix) → operate on that node
- Only create a new root goal when the user has a genuinely NEW objective

**Constraint vs Implementation — the core distinction:**
- CONSTRAINTS (goal/objective): What user wants. Stable. Don't change when implementation fails.
- IMPLEMENTATIONS (approach/impl): How to achieve it. Volatile. Can be replaced or abandoned.

Test: "If this approach fails, should we give up or try a different approach?"
- Give up → it's a constraint (goal/objective)
- Try different → it's an implementation (approach/impl)

**Node types (hierarchy: goal > objective > approach > impl):**
- \`goal\`: User's ultimate objective — stable, rarely changes. Only create when truly new.
- \`objective\`: A concrete, confirmable subset of the goal — "what specific part of the goal are we tackling?" May be revised if the decomposition is wrong.
- \`approach\`: Replaceable method to achieve an objective — "use Redis caching" (can fail and be replaced)
- \`impl\`: ONE atomic code change — "add cache layer in UserService"

**Atomicity rule — keep nodes small and independently verifiable:**
Litmus test: "Can I describe this in a single commit message without using 'and'?"
- YES → good granularity (e.g., "add JWT validation middleware")
- NO → decompose into multiple sibling nodes

**⚠️ Avoid intent drift:**
Don't patch implementations on top of failing implementations. If an approach isn't working:
1. Prune the failing approach (prune_intent)
2. Create a new sibling approach under the same goal
DON'T: Keep adding impl nodes trying to "fix" the broken approach — don't patch endlessly

**Goal discovery from objectives**: When you notice multiple objectives that seem related, consider whether they share a deeper common goal. Use \`restructure_intent\` (extract_common_parent) to group them.

**When to Use**: User has a genuinely NEW objective with no related node in the tree.
- add_intent({ assumption: "No existing goal about performance. User wants to optimize API response times.", parentId: null, type: "goal", content: "Optimize API performance" })

**When to Use**: Adding a concrete approach under an existing goal.
- add_intent({ assumption: "G1 is about performance. Caching is one replaceable approach.", parentId: "G1", type: "approach", content: "Use Redis caching for hot queries" })

**When to Use**: Recording an atomic code change under an approach.
- add_intent({ assumption: "A1.1 is the caching approach. This impl adds the cache layer.", parentId: "A1.1", type: "impl", content: "Add cache middleware in UserService" })

**When NOT to Use**: Node already exists — use update_intent. User asks to check/verify/continue — operate on existing node.`

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
						"Reason about placement: (1) Which existing nodes did you consider? Why is this the right location? " +
						"(2) How does this node serve its parent's goal? (alignment) " +
						"(3) What must be true for this to work? This assumption can be disproven later — when it is, the node should be pruned.",
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
