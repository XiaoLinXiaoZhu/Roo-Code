import type OpenAI from "openai"

const SKILL_DESCRIPTION = `Load and execute a skill by name. Skills provide specialized instructions for common tasks like creating MCP servers or custom modes.

**When to Use**: You need to follow specific procedures documented in a skill. Available skills are listed in the AVAILABLE SKILLS section of the system prompt.
- skill({ skill: "create-mcp-server", args: "Build a weather data MCP server" })
- skill({ skill: "roo-translation", args: "Add Japanese translations for new settings strings" })`

export default {
	type: "function",
	function: {
		name: "skill",
		description: SKILL_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				skill: {
					type: "string",
					description: "Name of the skill to load. Must match a skill name from the available skills list.",
				},
				args: {
					type: ["string", "null"],
					description: "Optional context or arguments to pass to the skill.",
				},
			},
			required: ["skill", "args"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
