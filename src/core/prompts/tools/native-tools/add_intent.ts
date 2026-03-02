import type OpenAI from "openai"

const ADD_INTENT_DESCRIPTION = `Add a new node to the Intent Tree (the <intent_tree> shown in environment).

**⚠️ BEFORE CALLING: Check <intent_tree> in environment first!**
- If a related node exists → use update_intent or add as child, NOT a new root goal
- If user's request is about an existing node (check, verify, continue, fix) → operate on that node
- Only create a new root goal when the user has a genuinely NEW objective

**How to decide the node type — constraint or implementation?**
Consider: user says "add Redis caching." You create a goal node for it. The caching turns out to be wrong — now what? You can't prune the goal, because goals are constraints. But caching was never the real goal — "reduce latency" was. The user said a method (X), not their goal (Y).

Wait — does this mean every user request is an approach, never a goal? No. Sometimes the user says "I need a login page" — that *is* the goal. The test is: "if this specific approach fails, should we give up entirely, or try a different way?" Give up → it's a constraint (goal/objective). Try different → it's an implementation (approach/impl).

Maybe there's a subtler case: what about existing code that's been around for months? It *feels* like a constraint — nobody questions it. But trace it up the tree. If it serves a goal, it's still an implementation, no matter how old. The goal is the constraint, not the code.

So the principle is: \`goal\` and \`objective\` capture *what the user wants* (stable — only create a goal when truly new, objectives are confirmable subsets). \`approach\` and \`impl\` capture *how to achieve it* (replaceable — an approach can fail and be replaced, an impl is ONE atomic code change ≈ one commit). When in doubt, ask yourself the "give up or try different" test.

Could this distinction break down in practice? Consider: what if the user's goal *is* a specific technology — "we must use PostgreSQL because of compliance"? Then PostgreSQL is genuinely a constraint, not an approach. The test still works: if PostgreSQL fails, do we try MySQL (approach) or give up on the project (constraint)? Compliance makes it a constraint. The test adapts to context.

Keep each node atomic — if you can't describe it in a single commit message without "and," decompose it into siblings.

**What happens when you patch a failing approach?**
You add impl I1 to fix approach A1. It doesn't fully work. You add I2 to patch I1. Still broken. You add I3. Each patch makes the next one harder — you're now debugging your patches, not the original problem. Three turns later, nobody remembers what A1 was supposed to achieve.

But what if the approach is *almost* right — just needs one more fix? That's exactly what confirmation bias feels like. The sunk cost of I1 and I2 makes A1 feel more valuable than it is. Step back: trace A1 to its parent objective. Is there a simpler approach A2 that achieves the same objective without the accumulated patches? If yes, prune A1 and start fresh.

The rule: if you're adding a third impl to "fix" the same approach, the approach itself is probably wrong. Prune it (\`prune_intent\`), create a sibling approach under the same objective.

Let me also consider the opposite problem — what if you have multiple objectives that seem unrelated, but they keep interfering with each other? Maybe "reduce API latency" and "reduce database load" are both symptoms of the same deeper goal: "improve user experience under load." Discovering this shared goal lets you find solutions that serve both simultaneously. Use \`restructure_intent\` (extract_common_parent) when you notice this pattern.

**When to Use**: User has a genuinely NEW objective with no related node in the tree.
- add_intent({ assumption: "No existing goal about performance. User wants to optimize API response times.", parent_id: null, type: "goal", content: "Optimize API performance" })

**When to Use**: Adding a concrete approach under an existing goal.
- add_intent({ assumption: "G1 is about performance. Caching is one replaceable approach.", parent_id: "G1", type: "approach", content: "Use Redis caching for hot queries" })

**When to Use**: Recording an atomic code change under an approach.
- add_intent({ assumption: "A1.1 is the caching approach. This impl adds the cache layer.", parent_id: "A1.1", type: "impl", content: "Add cache middleware in UserService" })

**When NOT to Use**: Node already exists — use update_intent. User asks to check/verify/continue — operate on existing node.`

export default {
	type: "function",
	function: {
		name: "add_intent",
		strict: true,
		description: ADD_INTENT_DESCRIPTION,
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				assumption: {
					type: "string",
					description:
						"Reason about placement: (1) Which existing nodes did you consider? Why is this the right location? " +
						"(2) How does this node serve its parent's goal? (alignment) " +
						"(3) What must be true for this to work? State it as a falsifiable claim — " +
						"'response time will drop below 200ms' is falsifiable, 'this will improve things' is not. " +
						"When a falsifiable assumption is disproven, the node should be pruned, not patched.",
				},
				parent_id: {
					type: ["string", "null"],
					description: "Parent node's short ID (e.g., 'G1', 'O1.1'). Null to create a new root node.",
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
			required: ["type", "content", "parent_id", "assumption"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
