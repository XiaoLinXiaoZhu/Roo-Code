import { z } from "zod"

/**
 * ToolGroup
 */

export const toolGroups = ["read", "edit", "command", "mcp", "modes", "intent"] as const

export const toolGroupsSchema = z.enum(toolGroups)

/**
 * Tool groups that have been removed but may still exist in user config files.
 * Used by schema preprocessing to silently strip these before validation,
 * preventing errors for users with older configs.
 */
export const deprecatedToolGroups: readonly string[] = ["browser"]

export type ToolGroup = z.infer<typeof toolGroupsSchema>

/**
 * ToolName
 */

export const toolNames = [
	"execute_command",
	"read_file",
	"read_command_output",
	"read_media",
	"write_to_file",
	"apply_diff",
	"edit",
	"search_and_replace",
	"search_replace",
	"edit_file",
	"apply_patch",
	"search_files",
	"list_files",
	"use_mcp_tool",
	"access_mcp_resource",
	"ask_followup_question",
	"attempt_completion",
	"new_task",
	"codebase_search",
	"update_todo_list",
	"run_slash_command",
	"skill",
	"generate_image",
	"custom_tool",
	// Agent as Tools 架构的新工具
	"search_project",
	"apply_edit",
	"consult_expert",
	// AST 代码智能工具
	"find_definition",
	"find_usages",
	// 工具构建工具
	"build_tool",
	// 统一写入工具
	"write",
	// 提醒工具
	"reminder",
	// V2 脚本执行工具（替代 execute_command）
	"exec",
	// 意图树工具
	"add_intent",
	"update_intent",
	"prune_intent",
	"commit_intent",
	"restructure_intent",
] as const

export const toolNamesSchema = z.enum(toolNames)

export type ToolName = z.infer<typeof toolNamesSchema>

/**
 * ToolUsage
 */

export const toolUsageSchema = z.record(
	toolNamesSchema,
	z.object({
		attempts: z.number(),
		failures: z.number(),
	}),
)

export type ToolUsage = z.infer<typeof toolUsageSchema>
