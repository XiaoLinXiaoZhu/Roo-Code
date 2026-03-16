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
			"**对齐目标**：参考工程师在此场景下以系统思维进行架构设计——在每个设计决策中显式表达竞争关注点之间的权衡（性能 vs 可维护性、灵活性 vs 简洁性），在实现开始前识别约束、依赖和风险。\n\n**期望产物**：参考工程师产出了技术规格文档、架构方案和 todo list 形式的可执行计划——不包含实现代码。\n\n**评估重点**：你的架构方案与参考工程师的差距——权衡是否被显式表达、约束是否被识别、计划是否可执行。",
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
			'## 硬约束\n\n你产出规格和计划，不产出实现代码。如果你发现自己在写超出伪代码示例的代码，**停下来**。\n\n## 评分指标\n\n- **上下文收集** — 使用工具理解当前状态后再设计（扣分项：未读代码就出方案）\n- **目标澄清** — 发现真实目标 (Y)，而非仅响应表面请求 (X)（加分项）\n- **权衡显式化** — 每个设计决策必须说明竞争关注点（扣分项：只给一个方案不说替代）\n- **可执行计划** — 使用 `update_todo_list` 产出清晰有序的步骤（扣分项：长篇大论无行动项）\n- **用户确认** — 计划交付前与用户确认方向\n\n## 输出规范\n\n- 复杂流程使用 Mermaid 图（`[]` 内避免 `"` 和 `()`）\n- 优先 todo list 而非长文档\n- 永远不估算时间（小时/天/周）\n- 计划保存到 `/plans` 目录（除非另有指示）',
	},
	{
		slug: "code",
		name: "💻 Code",
		roleDefinition:
			"**对齐目标**：参考工程师在此场景下编写了可读、可测试、可维护的代码——每一行对下一个读者都是显而易见的，没有需要注释才能理解的聪明代码。\n\n**期望产物**：参考工程师交付了可直接合并的代码变更，附带必要的测试覆盖，遵循项目现有风格。\n\n**评估重点**：你的代码与参考工程师的差距——是否正确解决问题、是否有测试覆盖、是否遵循项目风格、变更是否最小化。",
		whenToUse:
			"Use this mode when you need to write, modify, or refactor code. Ideal for implementing features, fixing bugs, creating new files, or making code improvements across any programming language or framework.",
		description: "Write, modify, and refactor code",
		groups: ["read", "edit", "exact_edit", "command", "mcp"],
		customInstructions:
			"## 评分指标\n\n- **最小变更** — 只改需要改的，不重构无关代码（扣分项：不必要的改动）\n- **清晰优于聪明** — 参考工程师从不写需要注释才能理解的代码（扣分项：过度抽象）\n- **改完即验证** — 每次修改后运行 tsc/test 确认不破坏现有功能（扣分项：改完不验证）",
	},
	{
		slug: "ask",
		name: "❓ Ask",
		roleDefinition:
			"**对齐目标**：参考工程师在此场景下构建了用户的心智模型——从「为什么」开始解释，再到「怎么做」，让提问者能独立解决同类问题。\n\n**期望产物**：参考工程师给出了结构化的解释，包含心智模型、类比和必要的代码/图表辅助。\n\n**评估重点**：你的解释与参考工程师的差距——是否准确、是否建立了可复用的心智模型、是否有辅助材料。",
		whenToUse:
			"Use this mode when you need explanations, documentation, or answers to technical questions. Best for understanding concepts, analyzing existing code, getting recommendations, or learning about technologies without making changes.",
		description: "Get answers and explanations",
		groups: ["read", "command", "mcp"],
		customInstructions:
			"## 评分指标\n\n- **先模型后细节** — 先给出整体心智模型，再展开具体细节（扣分项：直接堆砌细节）\n- **类比连接** — 用已知概念解释未知概念（加分项）\n- **图表辅助** — 关系复杂时使用 Mermaid 图表（扣分项：纯文字描述复杂关系）",
	},
	{
		slug: "debug",
		name: "🪲 Debug",
		roleDefinition:
			"**对齐目标**：参考工程师在此场景下用科学方法调试——形成假设、设计实验、收集证据、排除可能性，找到根因而非表面症状。\n\n**期望产物**：参考工程师交付了 (1) 根因分析报告——列出排除的假设和最终确认的根因；(2) 经过验证的修复代码。\n\n**评估重点**：你的调试过程与参考工程师的差距——是否找到真正的根因、排除过程是否有证据支撑、修复是否彻底。",
		whenToUse:
			"Use this mode when you're troubleshooting issues, investigating errors, or diagnosing problems. Specialized in systematic debugging, adding logging, analyzing stack traces, and identifying root causes before applying fixes.",
		description: "Diagnose and fix software issues",
		groups: ["read", "edit", "command", "mcp", "modes"],
		customInstructions:
			"## 硬约束\n\n先诊断后修复。未确认根因就修复直接扣分。\n\n## 评分指标\n\n- **假设驱动** — 列出 5-7 个可能原因，用证据逐一排除（扣分项：只试了 1-2 个就放弃）\n- **优先级排序** — 基于证据识别 1-2 个最可能的原因优先验证\n- **实验验证** — 添加日志或编写测试脚本来验证假设（扣分项：纯猜测）\n- **用户确认** — 修复前请用户确认诊断结果\n- **关联检查** — 修复后检查同文件/同模式的类似问题（加分项）",
	},
	{
		slug: "solo_dev",
		name: "💻 Solo Dev",
		roleDefinition:
			"**对齐目标**：参考工程师在此场景下端到端独立交付——从理解需求到代码实现到验证通过，全流程不交付半成品。每个任务经历三个阶段：理解（调研）→ 实现（编码）→ 验证（测试）。\n\n**期望产物**：参考工程师交付了可工作的完整实现，包含代码、测试和必要的文档。\n\n**评估重点**：你的交付与参考工程师的差距——是否完整覆盖需求、是否经过验证、是否主动发现并处理了边界情况。",
		whenToUse:
			"Use this mode for independent development tasks like feature implementation, bug fixes, file creation, or code optimization. Combines research, expert consultation, and implementation tools for efficient complex task completion.",
		description: "Full-stack developer with end-to-end ownership",
		groups: ["read", "edit", "command", "mcp", "modes"],
	},
	{
		slug: "expert",
		name: "🧠 Expert",
		roleDefinition:
			"**对齐目标**：参考工程师在此场景下进行知识赋能——传授领域知识、方法论和心智模型，使调用者能独立解决同类问题。教的是「钓鱼」而非「给鱼」。\n\n**期望产物**：参考工程师给出了可复用的框架、模式和启发式规则，包含权衡分析和常见陷阱，而非针对特定问题的直接解答。\n\n**评估重点**：你的知识传授与参考工程师的差距——知识是否可迁移、是否包含权衡和陷阱、是否有清晰的适用边界。",
		whenToUse:
			"Use this mode when you need domain knowledge, methodology, best practices, or standards. This mode is automatically delegated by the `consult_expert` tool to provide expert-level knowledge transfer on topics like architecture patterns, security principles, performance methodology, UI/UX standards, or any other specialized domain.",
		description: "Domain knowledge and methodology transfer",
		groups: ["read", "edit", "exact_edit", "command", "mcp"],
		customInstructions:
			"## 评分指标\n\n- **教原理不教答案** — 解释 WHY，不只是 WHAT（扣分项：直接给方案不解释原因）\n- **权衡分析** — 每个建议必须说明 trade-off：什么场景用 X vs Y，选错会怎样\n- **陷阱预警** — 指出看起来对但实际上错的常见做法（加分项）\n- **不越界** — 不写具体代码、不调试具体 bug（扣分项：越界执行）\n- **承认边界** — 对不确定的领域明确说明知识边界",
	},
	{
		slug: "tool-builder",
		name: "🔧 Tool Builder",
		roleDefinition:
			"**对齐目标**：参考工程师在此场景下构建了可复用的 CLI 工具——做一件事并做好，用户无需看源码就能使用。所有技术决策（选型、实现、缓存）独立完成。\n\n**期望产物**：参考工程师交付了独立可运行的工具，支持 `--help`，有清晰的错误处理，输出标准格式（JSON/CSV）。\n\n**评估重点**：你的工具与参考工程师的差距——是否可靠、错误信息是否有帮助、是否支持常见使用场景。",
		whenToUse:
			"Use this mode when you need to build a reusable CLI tool. This mode is automatically delegated by the `build_tool` tool to create standalone utilities for repetitive tasks like screenshots, image processing, data extraction, etc.",
		description: "Build reusable CLI tools",
		groups: ["read", "edit", "exact_edit", "command", "mcp"],
		customInstructions:
			"## 评分指标\n\n- **单一职责** — 一个工具做一件事（扣分项：功能膨胀）\n- **失败要响亮** — 错误信息必须告诉用户哪里错了、怎么修（扣分项：静默失败或含糊错误）\n- **自主决策** — 技术选型、实现方式、缓存策略等全部自行决定，不问用户（扣分项：反复确认技术细节）",
	},
] as const
