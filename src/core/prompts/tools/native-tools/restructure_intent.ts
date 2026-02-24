import type OpenAI from "openai"

const RESTRUCTURE_INTENT_DESCRIPTION = `Restructure the Intent Tree by moving nodes or extracting common patterns. Progressive discovery is expected — restructure when you gain new understanding.

**When to Use**: Two separate goals actually serve a common higher goal.
- restructure_intent({ operation: "extract_common_parent", nodeId: null, newParentId: null, nodeIds: ["G1", "G2"], commonContent: "Improve overall system reliability" })

**When to Use**: A node needs to be moved under a different parent.
- restructure_intent({ operation: "reparent", nodeId: "O1.1", newParentId: "G2", nodeIds: null, commonContent: null })

**When to Use**: Promoting a node to become a sibling of its current parent.
- restructure_intent({ operation: "promote", nodeId: "A1.1.1", newParentId: null, nodeIds: null, commonContent: null })

**Note**: After restructuring, shortIds may change. Check the response for the updated tree.`

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
					description: "The restructuring operation to perform.",
				},
				nodeId: {
					type: "string",
					description: "Node to operate on (for reparent/promote).",
				},
				newParentId: {
					type: "string",
					description: "New parent node ID (for reparent). Omit or null to make root.",
				},
				nodeIds: {
					type: "array",
					items: { type: "string" },
					description: "Nodes to extract common parent from (for extract_common_parent).",
				},
				commonContent: {
					type: "string",
					description: "Description of the common goal (for extract_common_parent).",
				},
			},
			required: ["operation"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
