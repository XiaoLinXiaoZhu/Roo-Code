import type OpenAI from "openai"

const BUILD_TOOL_DESCRIPTION = `Build a reusable CLI tool for repetitive tasks. All implementation decisions (technology, approach, caching, testing) are handled automatically.

**When to Use**: You need to perform a repetitive operation multiple times and manual execution adds cognitive overhead.
- build_tool({ requirement: "Capture screenshots of a specific window with optional region cropping", inputHint: "window name, optional crop region (x,y,w,h)", outputHint: "image file path" })

**When to Use**: The task is well-defined with clear inputs and outputs.
- build_tool({ requirement: "Convert JSON data to CSV format with custom field mapping", inputHint: "JSON file path, field mapping configuration", outputHint: "CSV file path" })`

export default {
	type: "function",
	function: {
		name: "build_tool",
		description: BUILD_TOOL_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				requirement: {
					type: "string",
					description: "Clear description of what capability you need. Focus on WHAT, not HOW.",
				},
				inputHint: {
					type: ["string", "null"],
					description: "Optional: Hint about expected inputs to help design the interface.",
				},
				outputHint: {
					type: ["string", "null"],
					description: "Optional: Hint about expected outputs to help design the interface.",
				},
			},
			required: ["requirement"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
