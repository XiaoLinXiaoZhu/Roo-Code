import type OpenAI from "openai"

const CONSULT_EXPERT_DESCRIPTION = `Consult an expert for in-depth analysis, architectural advice, or technical decision-making. This tool provides specialized recommendations based on domain knowledge.

To get the most value from this tool, you should be an effective questioner. Follow these guidelines:

**1. Identify the Right Expert (Find Your Target)**
- Determine the problem type: implementation engineering, business logic, or underlying principles. Choose a practitioner, planner, or researcher accordingly.
- Seek cross-domain expertise (e.g., "algorithms + linguistics") rather than generic skills.
- Prioritize experts with concrete outputs (code, articles, projects) over those with titles only.

**2. Define the Scope (Clarify Your Request)**
- Clearly state what you need: guidance, design review, or critique.
- Specify response format: one-line suggestion or detailed analysis?
- Indicate time/depth: "占用五分钟" (five minutes) or "需要深入审视" (in-depth review).

**3. Provide Context (Present the Facts)**
- Known: What you've tried and where you're stuck.
- Unknown: Specific points causing confusion.
- Principle: Provide sufficient context, but avoid unnecessary details or verbose descriptions.

**4. Construct Good Questions**
- Break down: Ask one question at a time, not everything at once.
- Be open: Ask "how" and "why" more than "is this correct?"
- Avoid assumptions: Don't ask "how to use X to do Y" (X might be wrong). Instead ask "how to solve Y".`

const DOMAIN_PARAMETER_DESCRIPTION = `Expert domain or specialty (e.g., "UI/UX design and user experience", "Backend architecture and distributed systems", "Database design and optimization", "Security and code review"). Be specific about the expertise needed.`

const TOPIC_PARAMETER_DESCRIPTION = `Brief topic or title of the consultation. Should be concise but descriptive.`

const QUESTION_PARAMETER_DESCRIPTION = `Detailed question or description of what you need expert advice on. Follow the good question guidelines: identify the problem type, clarify your request, provide context (what you know, what you don't know), and construct focused, open-ended questions. Break complex questions into smaller, specific ones.`

const ATTACHMENTS_PARAMETER_DESCRIPTION = `Optional: File paths or content to provide as context for the expert. Use absolute paths when possible.`

const OUTPUT_FORMAT_PARAMETER_DESCRIPTION = `Optional: Desired output format - "analysis" for detailed analysis, "design" for architectural designs, "comparison" for comparing options, "recommendation" for actionable recommendations. Specify your expected output clearly.`

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
