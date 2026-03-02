import type OpenAI from "openai"

const RESTRUCTURE_INTENT_DESCRIPTION = `Restructure the Intent Tree by moving nodes or extracting common patterns. Progressive discovery is expected — restructure when you gain new understanding.

**When to Use**: Two separate goals actually serve a common higher goal.
- restructure_intent({ operation: "extract_common_parent", node_id: null, new_parent_id: null, node_ids: ["G1", "G2"], common_content: "Improve overall system reliability" })

**When to Use**: A node needs to be moved under a different parent.
- restructure_intent({ operation: "reparent", node_id: "O1.1", new_parent_id: "G2", node_ids: null, common_content: null })

**When to Use**: Promoting a node to become a sibling of its current parent.
- restructure_intent({ operation: "promote", node_id: "A1.1.1", new_parent_id: null, node_ids: null, common_content: null })

**Note**: After restructuring, shortIds may change. Check the response for the updated tree.`

export default {
	type: "function",
	function: {
		name: "restructure_intent",
		strict: true,
		description: RESTRUCTURE_INTENT_DESCRIPTION,
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				operation: {
					type: "string",
					enum: ["reparent", "promote", "extract_common_parent"],
					description: "The restructuring operation to perform.",
				},
				node_id: {
					type: ["string", "null"],
					description: "Node to operate on (for reparent/promote).",
				},
				new_parent_id: {
					type: ["string", "null"],
					description: "New parent node ID (for reparent). Null to make root.",
				},
				node_ids: {
					type: ["array", "null"],
					items: { type: "string" },
					description: "Nodes to extract common parent from (for extract_common_parent).",
				},
				common_content: {
					type: ["string", "null"],
					description: "Description of the common goal (for extract_common_parent).",
				},
			},
			required: ["operation", "node_id", "new_parent_id", "node_ids", "common_content"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
