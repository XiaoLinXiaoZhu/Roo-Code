import type OpenAI from "openai"

const CONSULT_EXPERT_DESCRIPTION = `Consult an expert for in-depth analysis, architectural advice, or technical decision-making. This tool creates a subtask with expert role to provide specialized recommendations based on domain knowledge.`

const DOMAIN_PARAMETER_DESCRIPTION = `Expert domain or specialty (e.g., "UI/UX design and user experience", "Backend architecture and distributed systems", "Database design and optimization", "Security and code review")`

const TOPIC_PARAMETER_DESCRIPTION = `Brief topic or title of the consultation`

const QUESTION_PARAMETER_DESCRIPTION = `Detailed question or description of what you need expert advice on`

const ATTACHMENTS_PARAMETER_DESCRIPTION = `Optional: File paths or content to provide as context for the expert`

const OUTPUT_FORMAT_PARAMETER_DESCRIPTION = `Optional: Desired output format - "analysis" for detailed analysis, "design" for architectural designs, "comparison" for comparing options, "recommendation" for actionable recommendations`

export default {
	type: "function",
	function: {
		name: "consult_expert",
		description: CONSULT_EXPERT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				domain: {
					type: "string",
					description: DOMAIN_PARAMETER_DESCRIPTION,
				},
				topic: {
					type: "string",
					description: TOPIC_PARAMETER_DESCRIPTION,
				},
				question: {
					type: "string",
					description: QUESTION_PARAMETER_DESCRIPTION,
				},
				attachments: {
					type: ["string", "null"],
					description: ATTACHMENTS_PARAMETER_DESCRIPTION,
				},
				outputFormat: {
					type: ["string", "null"],
					enum: ["analysis", "design", "comparison", "recommendation"],
					description: OUTPUT_FORMAT_PARAMETER_DESCRIPTION,
				},
			},
			required: ["domain", "topic", "question"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
