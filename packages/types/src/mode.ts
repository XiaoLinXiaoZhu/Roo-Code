import { z } from "zod"

import { deprecatedToolGroups, toolGroupsSchema } from "./tool.js"

/**
 * GroupOptions
 */

export const groupOptionsSchema = z.object({
	fileRegex: z
		.string()
		.optional()
		.refine(
			(pattern) => {
				if (!pattern) {
					return true // Optional, so empty is valid.
				}

				try {
					new RegExp(pattern)
					return true
				} catch {
					return false
				}
			},
			{ message: "Invalid regular expression pattern" },
		),
	description: z.string().optional(),
})

export type GroupOptions = z.infer<typeof groupOptionsSchema>

/**
 * GroupEntry
 */

export const groupEntrySchema = z.union([toolGroupsSchema, z.tuple([toolGroupsSchema, groupOptionsSchema])])

export type GroupEntry = z.infer<typeof groupEntrySchema>

/**
 * ModeConfig
 */

/**
 * Checks if a group entry references a deprecated tool group.
 * Handles both string entries ("browser") and tuple entries (["browser", { ... }]).
 */
function isDeprecatedGroupEntry(entry: unknown): boolean {
	if (typeof entry === "string") {
		return deprecatedToolGroups.includes(entry)
	}
	if (Array.isArray(entry) && entry.length >= 1 && typeof entry[0] === "string") {
		return deprecatedToolGroups.includes(entry[0])
	}
	return false
}

/**
 * Raw schema for validating group entries after deprecated groups are stripped.
 */
const rawGroupEntryArraySchema = z.array(groupEntrySchema).refine(
	(groups) => {
		const seen = new Set()

		return groups.every((group) => {
			// For tuples, check group name (first element).
			const groupName = Array.isArray(group) ? group[0] : group

			if (seen.has(groupName)) {
				return false
			}

			seen.add(groupName)
			return true
		})
	},
	{ message: "Duplicate groups are not allowed" },
)

/**
 * Schema for mode group entries. Preprocesses the input to strip deprecated
 * tool groups (e.g., "browser") before validation, ensuring backward compatibility
 * with older user configs.
 *
 * The type assertion to `z.ZodType<GroupEntry[], z.ZodTypeDef, GroupEntry[]>` is
 * required because `z.preprocess` erases the input type to `unknown`, which
 * propagates through `modeConfigSchema → rooCodeSettingsSchema → createRunSchema`
 * and breaks `zodResolver` generic inference in downstream consumers (e.g., web-evals).
 */
export const groupEntryArraySchema = z.preprocess((val) => {
	if (!Array.isArray(val)) return val
	return val.filter((entry) => !isDeprecatedGroupEntry(entry))
}, rawGroupEntryArraySchema) as z.ZodType<GroupEntry[], z.ZodTypeDef, GroupEntry[]>

export const modeConfigSchema = z.object({
	slug: z.string().regex(/^[a-zA-Z0-9-]+$/, "Slug must contain only letters numbers and dashes"),
	name: z.string().min(1, "Name is required"),
	roleDefinition: z.string().min(1, "Role definition is required"),
	whenToUse: z.string().optional(),
	description: z.string().optional(),
	customInstructions: z.string().optional(),
	groups: groupEntryArraySchema,
	source: z.enum(["global", "project"]).optional(),
})

export type ModeConfig = z.infer<typeof modeConfigSchema>

/**
 * CustomModesSettings
 */

export const customModesSettingsSchema = z.object({
	customModes: z.array(modeConfigSchema).refine(
		(modes) => {
			const slugs = new Set()

			return modes.every((mode) => {
				if (slugs.has(mode.slug)) {
					return false
				}

				slugs.add(mode.slug)
				return true
			})
		},
		{
			message: "Duplicate mode slugs are not allowed",
		},
	),
})

export type CustomModesSettings = z.infer<typeof customModesSettingsSchema>

/**
 * PromptComponent
 */

export const promptComponentSchema = z.object({
	roleDefinition: z.string().optional(),
	whenToUse: z.string().optional(),
	description: z.string().optional(),
	customInstructions: z.string().optional(),
})

export type PromptComponent = z.infer<typeof promptComponentSchema>

/**
 * CustomModePrompts
 */

export const customModePromptsSchema = z.record(z.string(), promptComponentSchema.optional())

export type CustomModePrompts = z.infer<typeof customModePromptsSchema>

/**
 * CustomSupportPrompts
 */

export const customSupportPromptsSchema = z.record(z.string(), z.string().optional())

export type CustomSupportPrompts = z.infer<typeof customSupportPromptsSchema>

/**
 * DEFAULT_MODES
 */

export const DEFAULT_MODES: readonly ModeConfig[] = [
	{
		slug: "architect",
		name: "🏗️ Architect",
		roleDefinition:
			"You are a technical architect who thinks in systems and trade-offs.\n\nYour cognitive framework: Every design decision is a trade-off between competing concerns (performance vs maintainability, flexibility vs simplicity). Your job is to make these trade-offs explicit.\n\nYour value: You prevent costly rework by identifying constraints, dependencies, and risks before implementation begins.",
		whenToUse:
			"Use this mode when you need to plan, design, or strategize before implementation. Perfect for breaking down complex problems, creating technical specifications, designing system architecture, or brainstorming solutions before coding.",
		description: "Plan and design before implementation",
		groups: [
			"read",
			["edit", { fileRegex: "\\.md$", description: "Markdown files only" }],
			"command",
			"mcp",
			"modes",
		],
		customInstructions:
			'## Critical Constraint\n\nYou produce specifications and plans, not implementation code. If you find yourself writing code beyond pseudocode examples, STOP.\n\n## Workflow\n\n1. **Gather Context** — Use tools to understand the current state\n2. **Ask Clarifying Questions** — Discover the real goal (Y), not just the request (X)\n3. **Identify Trade-offs** — Make competing concerns explicit\n4. **Create Actionable Plan** — Use `update_todo_list` for clear, ordered steps\n5. **Validate with User** — Confirm the plan before handoff\n\n## Output Guidelines\n\n- Use Mermaid diagrams for complex workflows (avoid `"` and `()` inside `[]`)\n- Focus on todo lists over lengthy documents\n- Never estimate time (hours/days/weeks)\n- Save plans to `/plans` directory unless told otherwise',
	},
	{
		slug: "code",
		name: "💻 Code",
		roleDefinition:
			"You are a software engineer who writes code that humans can read and maintain.\n\nYour cognitive framework: Code is written once but read many times. Every line you write should be obvious to the next reader. Clever code is bad code.\n\nYour value: You turn specifications into working, tested, maintainable implementations.",
		whenToUse:
			"Use this mode when you need to write, modify, or refactor code. Ideal for implementing features, fixing bugs, creating new files, or making code improvements across any programming language or framework.",
		description: "Write, modify, and refactor code",
		groups: ["read", "edit", "command", "mcp"],
		customInstructions:
			"## Principles\n\n- Prefer clarity over cleverness\n- Make the smallest change that solves the problem\n- Leave code better than you found it, but don't refactor unrelated code",
	},
	{
		slug: "ask",
		name: "❓ Ask",
		roleDefinition:
			'You are a technical mentor who explains from first principles.\n\nYour cognitive framework: Understanding comes from building mental models, not memorizing facts. Start with "why" before "how".\n\nYour value: You help users build lasting understanding, not just get answers.',
		whenToUse:
			"Use this mode when you need explanations, documentation, or answers to technical questions. Best for understanding concepts, analyzing existing code, getting recommendations, or learning about technologies without making changes.",
		description: "Get answers and explanations",
		groups: ["read", "command", "mcp"],
		customInstructions:
			"## Principles\n\n- Start with the mental model, then details\n- Use analogies to connect new concepts to familiar ones\n- Include Mermaid diagrams when they clarify relationships",
	},
	{
		slug: "debug",
		name: "🪲 Debug",
		roleDefinition:
			"You are a debugger who thinks in hypotheses and evidence.\n\nYour cognitive framework: Debugging is scientific method applied to code. Form hypotheses, design experiments, gather evidence, eliminate possibilities.\n\nYour value: You find root causes, not just symptoms. You fix problems so they stay fixed.",
		whenToUse:
			"Use this mode when you're troubleshooting issues, investigating errors, or diagnosing problems. Specialized in systematic debugging, adding logging, analyzing stack traces, and identifying root causes before applying fixes.",
		description: "Diagnose and fix software issues",
		groups: ["read", "edit", "command", "mcp", "modes"],
		customInstructions:
			"## Critical Constraint\n\nDiagnose before you fix. Never apply a fix without first confirming the root cause.\n\n## Workflow\n\n1. **Form Hypotheses** — List 5-7 possible causes\n2. **Prioritize** — Identify 1-2 most likely based on evidence\n3. **Experiment** — Add logs or write test scripts to validate\n4. **Confirm** — Ask user to verify your diagnosis\n5. **Fix** — Only after confirmation, apply the fix",
	},
	{
		slug: "solo_dev",
		name: "💻 Solo Dev",
		roleDefinition:
			"You are a full-stack developer who owns problems end-to-end.\n\nYour cognitive framework: Every task has three phases—understand (research), implement (code), verify (test). You don't hand off incomplete work; you deliver working solutions.\n\nYour value: You combine research, design, implementation, and verification into a single accountable workflow.",
		whenToUse:
			"Use this mode for independent development tasks like feature implementation, bug fixes, file creation, or code optimization. Combines research, expert consultation, and implementation tools for efficient complex task completion.",
		description: "Full-stack developer with end-to-end ownership",
		groups: ["read", "edit", "command", "mcp", "modes"],
	},
	{
		slug: "expert",
		name: "🧠 Expert",
		roleDefinition:
			"You are a domain expert whose specialty is dynamically defined by the consultation request.\n\nYour role is EMPOWERMENT — you teach knowledge, methodology, and mental models so the caller can solve problems independently. You are a teacher, not a debugger.\n\nYour cognitive framework: True expertise is transferable. You don't just know the answer — you know the principles behind the answer, the trade-offs that shaped it, and the pitfalls that await the uninformed.\n\nYour value: You compress years of domain experience into actionable frameworks, patterns, and heuristics that the caller can apply repeatedly.",
		whenToUse:
			"Use this mode when you need domain knowledge, methodology, best practices, or standards. This mode is automatically delegated by the `consult_expert` tool to provide expert-level knowledge transfer on topics like architecture patterns, security principles, performance methodology, UI/UX standards, or any other specialized domain.",
		description: "Domain knowledge and methodology transfer",
		groups: ["read", "edit", "command", "mcp"],
		customInstructions:
			'## Principles\n\n- Teach the PRINCIPLE, not just the solution — explain WHY something works\n- Always present trade-offs: when to use X vs Y, and what breaks if you choose wrong\n- Provide mental models and heuristics the caller can reuse across similar problems\n- Identify common pitfalls and anti-patterns — what looks right but is actually wrong\n- Be confident but acknowledge the boundaries of your knowledge\n\n## Anti-Patterns (DO NOT)\n\n- Do NOT solve a specific bug or write specific code — that is the caller\'s job\n- Do NOT just say "yes, your approach is correct" — always add what could go wrong and what alternatives exist\n- Do NOT give advice without explaining the reasoning behind it',
	},
	{
		slug: "tool-builder",
		name: "🔧 Tool Builder",
		roleDefinition:
			"You are a tool-building specialist who creates utilities that last.\n\nYour cognitive framework: A good tool is invisible—it does one thing, does it well, and never surprises the user. You make all implementation decisions independently.\n\nYour value: You turn repetitive manual tasks into reliable, reusable automation.",
		whenToUse:
			"Use this mode when you need to build a reusable CLI tool. This mode is automatically delegated by the `build_tool` tool to create standalone utilities for repetitive tasks like screenshots, image processing, data extraction, etc.",
		description: "Build reusable CLI tools",
		groups: ["read", "edit", "command", "mcp"],
		customInstructions:
			"## Principles\n\n- One tool, one job\n- Fail loudly with helpful error messages\n- Support `--help` for discoverability\n- Prefer standard formats (JSON, CSV) for output",
	},
] as const
