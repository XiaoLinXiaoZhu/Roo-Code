import type OpenAI from "openai"

const CONSULT_EXPERT_DESCRIPTION = `Consult an expert for in-depth analysis, architectural advice, or technical decision-making. This tool provides specialized recommendations based on domain knowledge.

CRITICAL: Avoid the XY Problem. Do not ask "How do I do X?" or "Is X correct?" when your actual goal is Y. Always state your ultimate goal (Y) clearly.

To get the most value from this tool, follow these guidelines:

**1. Identify the Right Expert**
- Determine the problem type: implementation, architecture, or principles.
- Seek cross-domain expertise (e.g., "algorithms + linguistics") rather than generic skills.

**2. Define the Goal (The 'Y' in XY Problem)**
- What is the ultimate business or technical objective you are trying to achieve?
- Do not confuse the goal with your current proposed solution.

**3. Present the Context and Current Thoughts**
- Known: What you've tried, where you're stuck, and the constraints.
- Proposed Solutions: What approaches you are considering (A, B, etc.), but remain open to the expert suggesting a completely different approach (C).

**4. Construct Good Questions**
- Ask "What is the best approach to achieve [Goal]?" instead of "Is [Approach A] correct?"
- Ask for evaluation of your proposed solutions against the goal.
- Ask for alternative solutions you might have missed.

**Example Good Consultation:**
Goal: "I need to prevent users from submitting duplicate orders."
Proposed Solutions: "1. Disable the submit button. 2. Add a unique constraint in the database."
Question: "What is the most robust architecture to prevent duplicate orders? Are my proposed solutions sufficient, or is there a better pattern like idempotency keys?"

**Example Bad Consultation (XY Problem):**
Question: "How do I disable a button in React after click?" (This hides the real goal of preventing duplicate orders, leading to a fragile solution).`

const DOMAIN_PARAMETER_DESCRIPTION = `Expert domain or specialty (e.g., "UI/UX design and user experience", "Backend architecture and distributed systems", "Database design and optimization", "Security and code review"). Be specific about the expertise needed.`

const TOPIC_PARAMETER_DESCRIPTION = `Brief topic or title of the consultation. Should be concise but descriptive.`

const ULTIMATE_GOAL_PARAMETER_DESCRIPTION = `The true objective (Y) you are trying to achieve. This must be the underlying problem you want to solve, NOT your proposed implementation or method (X). Example: "Prevent duplicate order submissions" instead of "Disable the submit button".`

const CURRENT_APPROACH_PARAMETER_DESCRIPTION = `What you are currently doing, planning to do, or the options you are considering (A vs B). Be transparent that these are just ideas and might be wrong.`

const QUESTION_PARAMETER_DESCRIPTION = `The specific question for the expert. CRITICAL: Do not ask "Is my approach correct?" or "Should I choose A or B?". Instead, ask "What is the best way to achieve the ultimate goal?" and "What are the flaws in my current approach?" Ask for alternative solutions you might have missed.`

const CONTEXT_PARAMETER_DESCRIPTION = `Relevant background information, constraints, what you've tried, and where you're stuck. This helps the expert understand your starting point.`

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
				ultimateGoal: {
					type: "string",
					description: ULTIMATE_GOAL_PARAMETER_DESCRIPTION,
				},
				currentApproach: {
					type: "string",
					description: CURRENT_APPROACH_PARAMETER_DESCRIPTION,
				},
				context: {
					type: "string",
					description: CONTEXT_PARAMETER_DESCRIPTION,
				},
				question: {
					type: "string",
					description: QUESTION_PARAMETER_DESCRIPTION,
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
			required: ["domain", "topic", "ultimateGoal", "currentApproach", "context", "question", "consultType"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
