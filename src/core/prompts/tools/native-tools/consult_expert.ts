import type OpenAI from "openai"

const CONSULT_EXPERT_DESCRIPTION = `Get expert analysis on a technical problem. The expert will evaluate your situation and provide recommendations, including approaches you may not have considered.

IMPORTANT: Describe your PROBLEM, not your SOLUTION. The expert's value is in seeing what you might have missed.

Parameter filling order matters — think about each one before moving to the next:
1. domain → Who should answer this?
2. problemStatement → What gap am I trying to close?
3. constraints → What can't change?
4. currentApproach → What have I tried? (optional — it's OK to have no approach yet)
5. uncertainties → What am I not sure about?`

const DOMAIN_PARAMETER_DESCRIPTION = `The specific expertise needed. Be precise about the intersection of skills.
Example: "React performance optimization + virtual DOM internals" not just "frontend".`

const PROBLEM_STATEMENT_DESCRIPTION = `Describe the GAP between your current state and desired state. Focus on WHAT is wrong or missing, not HOW you plan to fix it.

Format: "[Current state] → [Desired state]. [Why the gap matters]"

✅ "API response time is 3s → Need <200ms. Users are abandoning the checkout flow."
✅ "Tests pass locally → Fail in CI. Blocking the release pipeline."
❌ "I need to add Redis caching" (this is a solution, not a problem)
❌ "How to optimize database queries?" (this is a question, not a statement)`

const CONSTRAINTS_DESCRIPTION = `Non-negotiable constraints that any solution must respect. These are FACTS, not preferences.

Include: tech stack, performance requirements, backward compatibility needs, team size/skill, timeline.
Exclude: your current approach (that goes in currentApproach).

Example: "Must work with PostgreSQL 14. Cannot add new infrastructure. Response time SLA is 200ms p99. Team has no Redis experience."`

const CURRENT_APPROACH_DESCRIPTION = `Optional: What you've tried or are considering. Be explicit that this might be wrong — the expert may suggest replacing it entirely.

If provided, the expert will evaluate it AND suggest alternatives. If omitted, the expert will recommend approaches from scratch.

Format: "Considering [approach]. Tried [what you tried] → [what happened]."

Example: "Considering adding a database index on user_id. Haven't tried yet because unsure if it addresses the root cause. Also considered query caching but worried about stale data."`

const UNCERTAINTIES_DESCRIPTION = `What you're NOT sure about. These become the expert's primary focus areas.

List the decisions you can't confidently make, the risks you can't assess, or the trade-offs you don't understand.

✅ "Not sure if the bottleneck is query planning or data volume. Don't know the trade-offs between materialized views vs application-level caching for this access pattern."
❌ "Is my approach correct?" (too vague, not actionable)`

const ATTACHMENTS_PARAMETER_DESCRIPTION = `Optional: File paths or content to provide as context for the expert. Use absolute paths when possible.`

const CONSULT_TYPE_PARAMETER_DESCRIPTION = `Type of consultation:
- "analysis": Root cause investigation — when you don't understand WHY something is happening
- "design": Architecture/solution design — when you need to CREATE something new
- "comparison": Trade-off evaluation — when you have OPTIONS and need to choose
- "recommendation": Action plan — when you know the goal and need STEPS to get there`

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
				problemStatement: {
					type: "string",
					description: PROBLEM_STATEMENT_DESCRIPTION,
				},
				constraints: {
					type: "string",
					description: CONSTRAINTS_DESCRIPTION,
				},
				currentApproach: {
					type: ["string", "null"],
					description: CURRENT_APPROACH_DESCRIPTION,
				},
				uncertainties: {
					type: "string",
					description: UNCERTAINTIES_DESCRIPTION,
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
			required: [
				"domain",
				"problemStatement",
				"constraints",
				"currentApproach",
				"uncertainties",
				"attachments",
				"consultType",
			],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
