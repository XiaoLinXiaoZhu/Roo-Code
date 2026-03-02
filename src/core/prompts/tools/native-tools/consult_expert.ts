import type OpenAI from "openai"

const CONSULT_EXPERT_DESCRIPTION = `Consult a domain expert to acquire knowledge, methodology, best practices, or standards. This is for EMPOWERMENT — learning HOW to think about a class of problems, not solving a specific problem. Think: "Teach me to fish" not "Fish for me."

**When to Use**: Learning design principles and patterns for an unfamiliar domain.
- consult_expert({ domain: "distributed systems + consistency models", topic: "Best practices for preventing duplicate submissions", context: "I'm designing a payment processing pipeline", attachments: null, consult_type: "principles" })

**When to Use**: Understanding common pitfalls before starting implementation.
- consult_expert({ domain: "React performance optimization + virtual DOM", topic: "Common pitfalls when implementing virtual scrolling", context: "About to add infinite scroll to a data-heavy dashboard", attachments: null, consult_type: "best-practices" })

**When to Use**: Getting a structured methodology for a complex task.
- consult_expert({ domain: "database schema design + migration", topic: "Methodology for zero-downtime schema migrations", context: "Need to restructure user tables in production", attachments: "/workspace/src/db/schema.ts", consult_type: "methodology" })

**When NOT to Use**: Specific bug fixes ("why is my API returning 500?"), code validation ("is my implementation correct?"), or choosing between two specific approaches.`

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
					description:
						'The specific expertise needed. Be precise about the intersection of skills (e.g., "React performance + virtual DOM internals" not just "frontend").',
				},
				topic: {
					type: "string",
					description:
						"What knowledge to learn about. Frame as a CLASS of problems, not a specific instance.",
				},
				context: {
					type: "string",
					description:
						"Why you need this knowledge — what work you're about to do. Helps the expert tailor advice without turning it into problem-solving.",
				},
				attachments: {
					type: ["string", "null"],
					description: "Optional: File paths or content as reference material for the expert.",
				},
				consult_type: {
					type: "string",
					enum: ["principles", "best-practices", "methodology", "standards"],
					description:
						'Type of knowledge: "principles" (mental models), "best-practices" (what works/doesn\'t), "methodology" (step-by-step frameworks), "standards" (conventions/specs).',
				},
			},
			required: ["domain", "topic", "context", "attachments", "consult_type"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
