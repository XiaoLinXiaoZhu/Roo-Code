/**
 * Tool Registry - Centralized registry for querying tool metadata.
 *
 * This registry provides a single source of truth for tool properties,
 * eliminating hardcoded tool name lists scattered across the codebase.
 */

import type { ToolName } from "@roo-code/types"
import type { BaseTool } from "./BaseTool"

// Import all BaseTool instances
// Note: browserActionTool is a function, not a BaseTool instance, so it's not included here
import { listFilesTool } from "./ListFilesTool"
import { readFileTool } from "./ReadFileTool"
import { readCommandOutputTool } from "./ReadCommandOutputTool"
import { writeToFileTool } from "./WriteToFileTool"
import { searchAndReplaceTool } from "./SearchAndReplaceTool"
import { searchReplaceTool } from "./SearchReplaceTool"
import { editFileTool } from "./EditFileTool"
import { applyPatchTool } from "./ApplyPatchTool"
import { searchFilesTool } from "./SearchFilesTool"
import { executeCommandTool } from "./ExecuteCommandTool"
import { useMcpToolTool } from "./UseMcpToolTool"
import { accessMcpResourceTool } from "./accessMcpResourceTool"
import { askFollowupQuestionTool } from "./AskFollowupQuestionTool"
import { attemptCompletionTool } from "./AttemptCompletionTool"
import { newTaskTool } from "./NewTaskTool"
import { updateTodoListTool } from "./UpdateTodoListTool"
import { runSlashCommandTool } from "./RunSlashCommandTool"
import { generateImageTool } from "./GenerateImageTool"
import { applyDiffTool } from "./ApplyDiffTool"
import { codebaseSearchTool } from "./CodebaseSearchTool"
import { searchProjectTool } from "./SearchProjectTool"
import { applyEditTool } from "./ApplyEditTool"
import { consultExpertTool } from "./ConsultExpertTool"
import { findDefinitionTool } from "./FindDefinitionTool"
import { findUsagesTool } from "./FindUsagesTool"
import { buildToolTool } from "./BuildToolTool"
import { addIntentTool } from "./AddIntentTool"
import { updateIntentTool } from "./UpdateIntentTool"
import { pruneIntentTool } from "./PruneIntentTool"
import { commitIntentTool } from "./CommitIntentTool"

/**
 * All registered BaseTool instances.
 * Add new tools here when they are created.
 *
 * Note: Some tools (like browserActionTool) are functions rather than BaseTool instances.
 * Those are not included here but can be queried separately if needed.
 */
const allTools: BaseTool<ToolName>[] = [
	listFilesTool,
	readFileTool,
	readCommandOutputTool,
	writeToFileTool,
	searchAndReplaceTool,
	searchReplaceTool,
	editFileTool,
	applyPatchTool,
	searchFilesTool,
	executeCommandTool,
	useMcpToolTool,
	accessMcpResourceTool,
	askFollowupQuestionTool,
	attemptCompletionTool,
	newTaskTool,
	updateTodoListTool,
	runSlashCommandTool,
	generateImageTool,
	applyDiffTool,
	codebaseSearchTool,
	searchProjectTool,
	applyEditTool,
	consultExpertTool,
	findDefinitionTool,
	findUsagesTool,
	buildToolTool,
	addIntentTool,
	updateIntentTool,
	pruneIntentTool,
	commitIntentTool,
]

/**
 * Map from tool name to tool instance for O(1) lookup.
 */
const toolMap = new Map<string, BaseTool<ToolName>>(allTools.map((tool) => [tool.name, tool]))

/**
 * Tool Registry - Query tool metadata without hardcoding tool names.
 */
export const toolRegistry = {
	/**
	 * Check if a tool is a delegation tool.
	 * Delegation tools create child tasks and pause the parent task.
	 *
	 * @param name - The tool name to check
	 * @returns true if the tool is a delegation tool, false otherwise
	 */
	isDelegationTool(name: string): boolean {
		const tool = toolMap.get(name)
		return tool?.isDelegationTool ?? false
	},

	/**
	 * Get a tool instance by name.
	 *
	 * @param name - The tool name
	 * @returns The tool instance, or undefined if not found
	 */
	get(name: string): BaseTool<ToolName> | undefined {
		return toolMap.get(name)
	},

	/**
	 * Check if a tool exists in the registry.
	 *
	 * @param name - The tool name
	 * @returns true if the tool exists
	 */
	has(name: string): boolean {
		return toolMap.has(name)
	},

	/**
	 * Get all tool names.
	 *
	 * @returns Array of all registered tool names
	 */
	getAllNames(): string[] {
		return Array.from(toolMap.keys())
	},

	/**
	 * Get all delegation tool names.
	 *
	 * @returns Array of delegation tool names
	 */
	getDelegationToolNames(): string[] {
		return allTools.filter((tool) => tool.isDelegationTool).map((tool) => tool.name)
	},
}
