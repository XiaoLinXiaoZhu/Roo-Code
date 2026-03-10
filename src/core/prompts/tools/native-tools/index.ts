import type OpenAI from "openai"
import accessMcpResource from "./access_mcp_resource"
import { apply_diff } from "./apply_diff"
import applyPatch from "./apply_patch"
import askFollowupQuestion from "./ask_followup_question"
import attemptCompletion from "./attempt_completion"
import codebaseSearch from "./codebase_search"
import editTool from "./edit"
// executeCommand 已被 v2 exec 工具替代
// import executeCommand from "./execute_command"
import generateImage from "./generate_image"
import listFiles from "./list_files"
import newTask from "./new_task"
import readCommandOutput from "./read_command_output"
import { createReadFileTool, type ReadFileToolOptions } from "./read_file"
import readMedia from "./read_media"
import runSlashCommand from "./run_slash_command"
import skill from "./skill"
import searchReplace from "./search_replace"
import edit_file from "./edit_file"
import searchFiles from "./search_files"
import updateTodoList from "./update_todo_list"
import writeToFile from "./write_to_file"
import searchProject from "./search_project"
import applyEdit from "./apply_edit"
import consultExpert from "./consult_expert"
import findDefinition from "./find_definition"
import findUsages from "./find_usages"
import buildTool from "./build_tool"
import write from "./write"
import reminder from "./reminder"
import exec from "./exec"
import addIntent from "./add_intent"
import updateIntent from "./update_intent"
import pruneIntent from "./prune_intent"
import commitIntent from "./commit_intent"
import restructureIntent from "./restructure_intent"

export { getMcpServerTools } from "./mcp_server"
export { convertOpenAIToolToAnthropic, convertOpenAIToolsToAnthropic } from "./converters"
export type { ReadFileToolOptions } from "./read_file"

/**
 * Options for customizing the native tools array.
 */
export interface NativeToolsOptions {
	/** Whether the model supports image processing (default: false) */
	supportsImages?: boolean
}

/**
 * Get native tools array, optionally customizing based on settings.
 *
 * @param options - Configuration options for the tools
 * @returns Array of native tool definitions
 */
export function getNativeTools(options: NativeToolsOptions = {}): OpenAI.Chat.ChatCompletionTool[] {
	const { supportsImages = false } = options

	const readFileOptions: ReadFileToolOptions = {
		supportsImages,
	}

	return [
		accessMcpResource,
		apply_diff,
		applyPatch,
		askFollowupQuestion,
		attemptCompletion,
		codebaseSearch,
		// LSP 代码智能工具 - 优先于 grep 用于符号导航
		findDefinition,
		findUsages,
		// executeCommand 已被 v2 exec 替代
		// executeCommand,
		generateImage,
		listFiles,
		newTask,
		readCommandOutput,
		createReadFileTool(readFileOptions),
		readMedia,
		runSlashCommand,
		skill,
		searchReplace,
		edit_file,
		editTool,
		searchFiles,
		updateTodoList,
		writeToFile,
		// Agent as Tools 架构的新工具
		searchProject,
		applyEdit,
		consultExpert,
		// 工具构建工具
		buildTool,
		// 统一写入工具
		write,
		// 提醒工具
		reminder,
		// V2 脚本执行工具
		exec,
		// 意图树工具
		addIntent,
		updateIntent,
		pruneIntent,
		commitIntent,
		restructureIntent,
	] satisfies OpenAI.Chat.ChatCompletionTool[]
}

// Backward compatibility: export default tools with line ranges enabled
export const nativeTools = getNativeTools()
