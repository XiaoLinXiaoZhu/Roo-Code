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

const QUESTION_PARAMETER_DESCRIPTION = `Detailed question or description of what you need expert advice on. Ask "how" and "why" more than "is this correct?" Avoid assumptions: Don't ask "how to use X to do Y" (X might be wrong). Instead ask "how to solve Y".`

const KNOWN_CONTEXT_PARAMETER_DESCRIPTION = `What you already know about this problem: current state, what you've tried, where you're stuck, relevant code/files you've examined. This helps the expert understand your starting point and avoid repeating information you already have.`

const UNKNOWN_POINTS_PARAMETER_DESCRIPTION = `Specific points causing confusion or uncertainty: what you don't understand, what you need help deciding, what risks you're unsure about. This helps the expert focus on the gaps in your knowledge.`

const ATTACHMENTS_PARAMETER_DESCRIPTION = `Optional: File paths or content to provide as context for the expert. Use absolute paths when possible.`

const CONSULT_TYPE_PARAMETER_DESCRIPTION = `Type of consultation that determines the approach and deliverable format:
- "analysis": Deep analysis report - for understanding root causes, impact assessment, and detailed examination of issues
- "design": Architecture design proposal - for system design, API design, and technical architecture decisions
- "comparison": Option comparison evaluation - for comparing multiple solutions with pros/cons analysis
- "recommendation": Actionable recommendations - for specific action steps with cost-benefit analysis`

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
				knownContext: {
					type: "string",
					description: KNOWN_CONTEXT_PARAMETER_DESCRIPTION,
				},
				unknownPoints: {
					type: "string",
					description: UNKNOWN_POINTS_PARAMETER_DESCRIPTION,
				},
				attachments: {
					type: ["string", "null"],
					description: ATTACHMENTS_PARAMETER_DESCRIPTION,
				},
				consultType: {
					type: "string",
					enum: ["analysis", "design", "comparison", "recommendation"],
					description: CONSULT_TYPE_PARAMETER_DESCRIPTION,
				},
			},
			required: ["domain", "topic", "question", "knownContext", "unknownPoints", "consultType"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
