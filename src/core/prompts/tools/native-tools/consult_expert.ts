import type OpenAI from "openai"

const CONSULT_EXPERT_DESCRIPTION = `Consult a domain expert to acquire knowledge, methodology, best practices, or standards. This tool is for EMPOWERMENT — learning HOW to think about a class of problems, not for solving a specific problem.

Use this when you need:
- Design principles and patterns for a domain you're unfamiliar with
- Best practices and common pitfalls to avoid
- Methodology and frameworks for making decisions
- Standards and conventions in a specific field

DO NOT use this to ask "how do I fix this specific bug?" or "is my code correct?" — those are problems you should solve yourself using the knowledge you acquire here.

Think of it as: "Teach me to fish" not "Fish for me."

Examples of GOOD consultations:
- "What are the best practices for designing idempotent APIs?"
- "What patterns should I follow for responsive CSS architecture?"
- "What are common pitfalls when implementing event-driven systems?"
- "What methodology should I use for database schema migration?"

Examples of BAD consultations (too specific, solve-it-for-me):
- "Is my Redis caching implementation correct?"
- "Should I use approach A or approach B for this function?"
- "Why is my API returning 500 errors?"`

const DOMAIN_DESCRIPTION = `The specific expertise needed. Be precise about the intersection of skills.
Example: "React performance optimization + virtual DOM internals" not just "frontend".`

const TOPIC_DESCRIPTION = `What knowledge, methodology, or best practices you want to learn about. Frame this as a CLASS of problems, not a specific instance.

✅ "Best practices for preventing duplicate submissions in distributed systems"
✅ "Common pitfalls when designing prompt templates for LLM tool-use"
✅ "Methodology for designing responsive layouts that work across breakpoints"
❌ "How to fix the duplicate order bug in our checkout flow" (too specific)
❌ "Is my caching strategy correct?" (asking for validation, not knowledge)`

const CONTEXT_DESCRIPTION = `Why you need this knowledge — what kind of work you're about to do. This helps the expert tailor the advice to your situation without turning it into a specific problem-solving session.

Example: "I'm about to design a payment processing pipeline and want to understand idempotency patterns before I start."
Example: "Our team is adopting event-driven architecture and I need to understand the common failure modes."`

const ATTACHMENTS_DESCRIPTION = `Optional: File paths or content to provide as reference material for the expert. Use absolute paths when possible.`

const CONSULT_TYPE_DESCRIPTION = `Type of knowledge you're seeking:
- "principles": Design principles, patterns, and mental models — when you need to understand HOW to think about a domain
- "best-practices": Proven approaches and common pitfalls — when you need to know WHAT works and what doesn't
- "methodology": Step-by-step frameworks and processes — when you need a structured APPROACH to follow
- "standards": Conventions, specifications, and quality criteria — when you need to know WHAT the bar is`

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
					description: DOMAIN_DESCRIPTION,
				},
				topic: {
					type: "string",
					description: TOPIC_DESCRIPTION,
				},
				context: {
					type: "string",
					description: CONTEXT_DESCRIPTION,
				},
				attachments: {
					type: ["string", "null"],
					description: ATTACHMENTS_DESCRIPTION,
				},
				consultType: {
					type: "string",
					enum: ["principles", "best-practices", "methodology", "standards"],
					description: CONSULT_TYPE_DESCRIPTION,
				},
			},
			required: ["domain", "topic", "context", "attachments", "consultType"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
