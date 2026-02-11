import type OpenAI from "openai"

const RESTRUCTURE_INTENT_DESCRIPTION = `Restructure the Intent Tree (the <intent_tree> shown in environment) by moving nodes or extracting common patterns.

**When to use (progressive discovery is expected!):**
- You discover that two separate "goals" (G1, G2) actually serve a common higher goal
  → extract_common_parent to create the real goal above them
- User clarifies that what seemed like a goal is actually just one approach
  → reparent it under the real goal as a path
- User wants to try a completely different approach at a higher level
  → promote the alternative to make it a sibling

**This is normal:** The user's true goal often emerges gradually through conversation.
Don't hesitate to restructure when you gain new understanding.

**Operations:**

1. \`reparent\`: Move a node to a new parent
   - nodeId: The node to move (e.g., "S1.1")
   - newParentId: The new parent (e.g., "G2"), or omit/null to make it a root node

2. \`promote\`: Promote a node to become a sibling of its current parent
   - nodeId: The node to promote (e.g., "P1.1.1")
   - This is a shortcut for reparenting to the grandparent

3. \`extract_common_parent\`: Extract common goal from multiple nodes
   - nodeIds: Array of node IDs that share a common goal (e.g., ["G1", "G2"])
   - commonContent: Description of the common goal
   - Creates a new parent node and reparents the specified nodes under it

**Note:** After restructuring, shortIds may change. Check the response for the updated tree structure.`

export default {
	type: "function",
	function: {
		name: "restructure_intent",
		description: RESTRUCTURE_INTENT_DESCRIPTION,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				operation: {
					type: "string",
					enum: ["reparent", "promote", "extract_common_parent"],
					description: "The restructuring operation to perform",
				},
				nodeId: {
					type: "string",
					description: "Node to operate on (for reparent/promote)",
				},
				newParentId: {
					type: "string",
					description: "New parent node ID (for reparent). Omit or null to make root.",
				},
				nodeIds: {
					type: "array",
					items: { type: "string" },
					description: "Nodes to extract common parent from (for extract_common_parent)",
				},
				commonContent: {
					type: "string",
					description: "Description of the common goal (for extract_common_parent)",
				},
			},
			required: ["operation"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
