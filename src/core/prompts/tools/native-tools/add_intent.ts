import type OpenAI from "openai"

const ADD_INTENT_DESCRIPTION = `Add a new intent node to the Intent Tree. The intent tree is a persistent record that separates the user's goals (constraints) from implementations (variables).

**MANDATORY**: You MUST call this at the START of every task to record the user's goal before implementing anything.

**Node types:**
- \`goal\`: The user's ultimate objective (stable, confirmed by user)
- \`subgoal\`: A verifiable sub-objective
- \`path\`: An implementation approach
- \`impl\`: A concrete code-level implementation

**parentId**: Use the short ID (e.g., "G1", "S1.1") of the parent node. Omit for root goals.

Returns the new node with its short ID (e.g., G1, S1.1, P1.1.1) for future reference.`

export default {
	type: "function",
	function: {
		name: "add_intent",
		description: ADD_INTENT_DESCRIPTION,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				type: {
					type: "string",
					enum: ["goal", "subgoal", "path", "impl"],
					description: "Node type",
				},
				content: {
					type: "string",
					description: "Natural language description of the intent",
				},
				parentId: {
					type: "string",
					description: "Parent node short ID (e.g., 'G1', 'S1.1'). Omit for root goals.",
				},
			},
			required: ["type", "content"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
