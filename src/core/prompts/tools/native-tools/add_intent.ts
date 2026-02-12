import type OpenAI from "openai"

const ADD_INTENT_DESCRIPTION = `Add a new node to the Intent Tree (the <intent_tree> shown in environment).

**⚠️ BEFORE CALLING: Check <intent_tree> in environment first!**
- If a related node exists → use update_intent or add as child, NOT a new root goal
- If user's request is about an existing node (check, verify, continue, fix) → operate on that node
- Only create a new root goal when the user has a genuinely NEW objective

**Constraint vs Implementation — the core distinction:**
- CONSTRAINTS (goal/subgoal): What user wants. Stable. Don't change when implementation fails.
- IMPLEMENTATIONS (path/impl): How to achieve it. Volatile. Can be replaced or abandoned.

Test: "If this approach fails, should we give up or try a different approach?"
- Give up → it's a constraint (goal/subgoal)
- Try different → it's an implementation (path/impl)

Example: User says "use Redis for caching"
- If Redis fails, do we give up on performance? NO → "use Redis" is a PATH, not a goal
- The real GOAL is "improve performance", Redis is just one path to try

**Node types (hierarchy: goal > subgoal > path > impl):**
- \`goal\`: User's ultimate objective — stable, rarely changes. Only create when truly new.
- \`subgoal\`: Verifiable milestone — "reduce query time by 50%"
- \`path\`: Implementation approach — "use Redis caching" (can fail and be replaced)
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
   - "What" → goal or subgoal
   - "How" → path or impl

**⚠️ Avoid intent drift:**
Don't patch implementations on top of failing implementations. If a path isn't working:
1. Prune the failing path (prune_intent)
2. Create a new sibling path under the same goal
DON'T: Keep adding impl nodes trying to "fix" the broken path

**Examples:**
- User: "check if boss system is done" + tree has S3.4 about boss → do NOT add_intent, just check or update_intent
- User: "I want to optimize performance" + no related node → add_intent(type: "goal", content: "optimize performance")
- User: "try using cache for that" + G1 exists about perf → add_intent(type: "path", content: "use caching", parentId: "G1")`

export default {
	type: "function",
	function: {
		name: "add_intent",
		description: ADD_INTENT_DESCRIPTION,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				// === THINK FIRST: Analyze placement before deciding content ===
				placementReason: {
					type: "string",
					description:
						"FIRST: Analyze <intent_tree> and explain your placement decision. " +
						"Which existing nodes did you consider? Why is this the right location? " +
						"Example: 'Checked G1(game dev) and S1.7(Joker system). This task is about Joker bugs, so it belongs under S1.7.'",
				},
				placement: {
					type: "string",
					enum: ["new_root", "child_of"],
					description:
						"THEN: Choose placement based on your analysis. " +
						"'new_root': genuinely unrelated to all existing nodes. " +
						"'child_of': belongs under an existing node.",
				},
				parentId: {
					type: "string",
					description: "If placement='child_of': the parent node's short ID (e.g., 'G1', 'S1.1').",
				},
				// === THEN ACT: Specify the node details ===
				type: {
					type: "string",
					enum: ["goal", "subgoal", "path", "impl"],
					description:
						"Node type: goal (stable objective), subgoal (milestone), path (approach), impl (ONE atomic code change ≈ one commit).",
				},
				content: {
					type: "string",
					description: "Natural language description of the intent.",
				},
			},
			required: ["placementReason", "placement", "type", "content"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
