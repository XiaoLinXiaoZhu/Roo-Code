import type OpenAI from "openai"

const NEW_TASK_DESCRIPTION = `Create a new child agent to work on a delegated task. Focus on goal alignment (WHAT to achieve), not implementation paths (HOW to do it). The child agent will determine the implementation approach and should use send_message_to_agent to ask questions when uncertain rather than making assumptions.`

const MODE_PARAMETER_DESCRIPTION = `Slug of the mode to begin the new task in (e.g., code, debug, architect)`

const MESSAGE_PARAMETER_DESCRIPTION = `Goal and requirements for the child agent. State WHAT needs to be achieved and key constraints, not HOW to implement it. Encourage the child to ask clarifying questions using send_message_to_agent when uncertain.`

const TODOS_PARAMETER_DESCRIPTION = `Optional high-level milestones or phases (not detailed steps) written as a markdown checklist; required when the workspace mandates todos. The child agent determines detailed implementation steps.`

export default {
	type: "function",
	function: {
		name: "new_task",
		description: NEW_TASK_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				mode: {
					type: "string",
					description: MODE_PARAMETER_DESCRIPTION,
				},
				message: {
					type: "string",
					description: MESSAGE_PARAMETER_DESCRIPTION,
				},
				todos: {
					type: ["string", "null"],
					description: TODOS_PARAMETER_DESCRIPTION,
				},
			},
			required: ["mode", "message", "todos"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
