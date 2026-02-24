import type OpenAI from "openai"

const COMMIT_INTENT_DESCRIPTION = `Commit code changes and bind them to a node in the Intent Tree. Stages all changes (git add .), creates a commit prefixed with the node ID, records the hash, and marks the node as done.

**When to Use**: After completing code changes that fulfill an intent node.
- commit_intent({ nodeId: "I1.1.1", message: "Add cache middleware in UserService" })

**When to Use**: Auto-binding to the current in_progress node (omit nodeId).
- commit_intent({ message: "Fix validation logic for empty inputs" })`

export default {
	type: "function",
	function: {
		name: "commit_intent",
		description: COMMIT_INTENT_DESCRIPTION,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				nodeId: {
					type: "string",
					description: "Node short ID (e.g., 'I1.1.1'). Omit to auto-bind to current in_progress node.",
				},
				message: {
					type: "string",
					description: "Commit message describing the change.",
				},
			},
			required: ["message"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
