import type OpenAI from "openai"

const COMMIT_INTENT_DESCRIPTION = `Commit code changes and bind them to a node in the Intent Tree (the <intent_tree> shown in environment). This tool:
1. Stages all current changes (\`git add .\`)
2. Creates a git commit with the provided message (prefixed with the intent node ID)
3. Records the commit hash in the intent tree node
4. Updates the node status to \`done\`

**nodeId**: Optional. Use the short ID (e.g., "I1.1.1"). If omitted, automatically binds to the current in_progress node.

**When to use:** After completing code changes that fulfill an intent node.`

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
					description: "Commit message describing the change",
				},
			},
			required: ["message"],
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
