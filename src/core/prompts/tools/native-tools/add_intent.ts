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

Example: User says "use Redis for caching"
- If Redis fails, do we give up on performance? NO → "use Redis" is an APPROACH, not a goal
- The real GOAL is "improve performance", Redis is just one approach to try

**Node types (hierarchy: goal > objective > approach > impl):**
- \`goal\`: User's ultimate objective — stable, rarely changes. Only create when truly new.
- \`objective\`: A concrete, confirmable subset of the goal — "what specific part of the goal are we tackling?" May be revised if the decomposition is wrong.
- \`approach\`: Replaceable method to achieve an objective — "use Redis caching" (can fail and be replaced)
- \`impl\`: ONE atomic code change — "add cache layer in UserService"

**Atomicity rule — keep nodes small and independently verifiable:**
Litmus test: "Can I describe this in a single commit message without using 'and'?"
- YES → good granularity (e.g., "add JWT validation middleware")
- NO → decompose into multiple sibling nodes

❌ BAD:  impl "implement auth system" (multiple concerns, untraceable)
✅ GOOD: impl "add JWT token validation middleware"
         impl "create user session store"
         impl "add login endpoint with rate limiting"

**Decision flow:**
1. Read <intent_tree> in environment
2. Does user's request relate to an existing node?
   - YES → update_intent or add child node under it
   - NO → create new root goal
3. Is user's request a "what" (constraint) or "how" (implementation)?
   - "What" → goal or objective
   - "How" → approach or impl

**⚠️ Avoid intent drift:**
Don't patch implementations on top of failing implementations. If an approach isn't working:
1. Prune the failing approach (prune_intent)
2. Create a new sibling approach under the same goal
DON'T: Keep adding impl nodes trying to "fix" the broken approach — don't patch endlessly

**Goal discovery from objectives**: When you notice multiple objectives that seem related, consider whether they share a deeper common goal. Use \`restructure_intent\` (extract_common_parent) to group them.

**Examples:**
- User: "check if boss system is done" + tree has O3.4 about boss → do NOT add_intent, just check or update_intent
- User: "I want to optimize performance" + no related node → add_intent(type: "goal", content: "optimize performance")
- User: "try using cache for that" + G1 exists about perf → add_intent(type: "approach", content: "use caching", parentId: "G1")`

export default {
	type: "function",
	function: {
		name: "add_intent",
		description: ADD_INTENT_DESCRIPTION,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				// === THINK FIRST: Reason about placement and assumptions ===
				assumption: {
					type: "string",
					description:
						"FIRST: Analyze <intent_tree> and reason about this node. " +
						"(1) Which existing nodes did you consider? Why is this the right location? " +
						"(2) How does this node serve its parent's goal? (alignment) " +
						"(3) What must be true for this to work? This assumption can be disproven later — when it is, the node should be pruned. " +
						"Example: 'Checked G1(game dev) and O1.7(Joker system). This is about Joker bugs → under O1.7. Assumption: the bug is in Joker's state machine, not rendering.'",
				},
				parentId: {
					type: "string",
					description: "Parent node's short ID (e.g., 'G1', 'O1.1'). Omit to create a new root node.",
				},
				// === THEN ACT: Specify the node details ===
				type: {
					type: "string",
					enum: ["goal", "objective", "approach", "impl"],
					description:
						"Node type: goal (user's stable objective — the WHY), objective (concrete subset of goal — what part are we tackling?), approach (replaceable method to achieve objective — try another if this fails), impl (ONE atomic code change ≈ one commit).",
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
