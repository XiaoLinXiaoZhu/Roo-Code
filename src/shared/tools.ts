import { Anthropic } from "@anthropic-ai/sdk"

import type {
	ClineAsk,
	ToolProgressStatus,
	ToolGroup,
	ToolName,
	BrowserActionParams,
	GenerateImageParams,
} from "@roo-code/types"

export type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>

export type AskApproval = (
	type: ClineAsk,
	partialMessage?: string,
	progressStatus?: ToolProgressStatus,
	forceApproval?: boolean,
) => Promise<boolean>

export type HandleError = (action: string, error: Error) => Promise<void>

export type PushToolResult = (content: ToolResponse) => void

export type AskFinishSubTaskApproval = () => Promise<boolean>

export interface TextContent {
	type: "text"
	content: string
	partial: boolean
}

export const toolParamNames = [
	"command",
	"path",
	"content",
	"regex",
	"file_pattern",
	"recursive",
	"action",
	"url",
	"coordinate",
	"text",
	"type", // ask_followup_question parameter
	"purpose",
	"choice",
	"affect",
	"server_name",
	"tool_name",
	"arguments",
	"uri",
	"question",
	"result",
	"diff",
	"line",
	"mode",
	"message",
	"cwd",
	"follow_up",
	"task",
	"size",
	"query",
	"args",
	"skill", // skill tool parameter
	"start_line",
	"end_line",
	"todos",
	"prompt",
	"image",
	// read_file parameters (native protocol)
	"operations", // search_and_replace parameter for multiple operations
	"patch", // apply_patch parameter
	"file_path", // search_replace and edit_file parameter
	"old_string", // search_replace and edit_file parameter
	"new_string", // search_replace and edit_file parameter
	"expected_replacements", // edit_file parameter for multiple occurrences
	// Agent as Tools 架构的新工具参数
	"schema", // search_project optional parameter
	"scope", // search_project optional parameter
	"instruction", // apply_edit required parameter
	"context", // apply_edit optional parameter
	"validate", // apply_edit optional parameter
	"domain", // consult_expert required parameter
	"topic", // consult_expert required parameter
	"knownContext", // consult_expert required parameter
	"unknownPoints", // consult_expert required parameter
	"attachments", // consult_expert optional parameter
	"consultType", // consult_expert required parameter
	"artifact_id", // read_command_output parameter
	"search", // read_command_output parameter for grep-like search
	"offset", // read_command_output and read_file parameter
	"limit", // read_command_output and read_file parameter
	// read_file indentation mode parameters
	"indentation",
	"anchor_line",
	"max_levels",
	"include_siblings",
	"include_header",
	"max_lines",
	// read_file legacy format parameter (backward compatibility)
	"files",
	"line_ranges",
	// AST 代码智能工具参数
	"symbol", // find_definition, find_usages required parameter
	"surrounding_code", // find_definition, find_usages optional parameter
	"start_line", // find_definition, find_usages optional parameter
	"include_declaration", // find_usages optional parameter
	"max_results", // find_usages optional parameter
	// build_tool 参数
	"requirement", // build_tool required parameter
	"inputHint", // build_tool optional parameter
	"outputHint", // build_tool optional parameter
	// intent tree 工具参数
	"parentId", // add_intent optional parameter
	"nodeId", // update_intent/prune_intent/commit_intent required parameter
	"status", // update_intent optional parameter
	"reason", // prune_intent optional parameter
] as const

export type ToolParamName = (typeof toolParamNames)[number]

/**
 * Type map defining the native (typed) argument structure for each tool.
 * Tools not listed here will fall back to `any` for backward compatibility.
 */
export type NativeToolArgs = {
	access_mcp_resource: { server_name: string; uri: string }
	read_file: import("@roo-code/types").ReadFileToolParams
	read_media: { path: string; focusX?: number; focusY?: number; scale?: number }
	read_command_output: { artifact_id: string; search?: string; offset?: number; limit?: number }
	attempt_completion: { result: string }
	execute_command: { command: string; cwd?: string }
	apply_diff: { path: string; diff: string }
	search_and_replace: { path: string; operations: Array<{ search: string; replace: string }> }
	search_replace: { file_path: string; old_string: string; new_string: string }
	edit_file: { file_path: string; old_string: string; new_string: string; expected_replacements?: number }
	apply_patch: { patch: string }
	list_files: { path: string; recursive?: boolean }
	new_task: { mode: string; message: string; todos?: string }
	ask_followup_question: {
		type: "goal_discovery" | "honest_uncertainty" | "passive_verification"
		question: string
		follow_up: Array<{ choice: string; affect: string }>
	}
	browser_action: BrowserActionParams
	codebase_search: { query: string; path?: string }
	generate_image: GenerateImageParams
	run_slash_command: { command: string; args?: string }
	skill: { skill: string; args?: string | null }
	search_files: { path: string; regex: string; file_pattern?: string | null }
	update_todo_list: { todos: string }
	use_mcp_tool: { server_name: string; tool_name: string; arguments?: Record<string, unknown> }
	write_to_file: { purpose: "new_file" | "complete_rewrite" | "small_file_update"; path: string; content: string }
	// Agent as Tools 架构的新工具
	search_project: {
		query: string
		scope?: {
			directories?: string
			filePatterns?: string
			excludes?: string
		}
		schema?: string
	}
	apply_edit: {
		instruction: string
		files?: string
		context?: string
		validate?: string
	}
	consult_expert: {
		domain: string
		topic: string
		question: string
		knownContext: string
		unknownPoints: string
		attachments?: string
		consultType: "analysis" | "design" | "comparison" | "recommendation"
	}
	// AST 代码智能工具
	find_definition: {
		purpose: "understand_implementation" | "trace_import" | "verify_signature"
		path: string
		symbol: string
		surrounding_code?: string
		start_line?: number
	}
	find_usages: {
		purpose: "impact_analysis" | "usage_patterns" | "dead_code_check"
		path: string
		symbol: string
		surrounding_code?: string
		start_line?: number
		include_declaration?: boolean
		max_results?: number
	}
	// 工具构建工具
	build_tool: {
		requirement: string
		inputHint?: string
		outputHint?: string
	}
	// 意图树工具
	add_intent: {
		type: "goal" | "subgoal" | "path" | "impl"
		content: string
		parentId?: string
	}
	update_intent: {
		nodeId: string
		status?: "in_progress" | "done" | "superseded"
		content?: string
	}
	prune_intent: {
		nodeId: string
		reason?: string
	}
	commit_intent: {
		nodeId?: string
		message: string
	}
	restructure_intent: {
		operation: "reparent" | "promote" | "extract_common_parent"
		nodeId?: string
		newParentId?: string | null
		nodeIds?: string[]
		commonContent?: string
	}
	// Add more tools as they are migrated to native protocol
}

/**
 * Generic ToolUse interface that provides proper typing for both protocols.
 *
 * @template TName - The specific tool name, which determines the nativeArgs type
 */
export interface ToolUse<TName extends ToolName = ToolName> {
	type: "tool_use"
	id?: string // Optional ID to track tool calls
	name: TName
	/**
	 * The original tool name as called by the model (e.g. an alias like "edit_file"),
	 * if it differs from the canonical tool name used for execution.
	 * Used to preserve tool names in API conversation history.
	 */
	originalName?: string
	// params is a partial record, allowing only some or none of the possible parameters to be used
	params: Partial<Record<ToolParamName, string>>
	partial: boolean
	// nativeArgs is properly typed based on TName if it's in NativeToolArgs, otherwise never
	nativeArgs?: TName extends keyof NativeToolArgs ? NativeToolArgs[TName] : never
	/**
	 * Whether this tool call was parsed from Markdown code block format.
	 * Markdown tool calls support multiple tools per message and don't interrupt the stream.
	 */
	isMarkdownTool?: boolean
	/**
	 * Flag indicating whether the tool call used a legacy/deprecated format.
	 * Used for telemetry tracking to monitor migration from old formats.
	 */
	usedLegacyFormat?: boolean
}

/**
 * Represents a native MCP tool call from the model.
 * In native mode, MCP tools are called directly with their prefixed name (e.g., "mcp_serverName_toolName")
 * rather than through the use_mcp_tool wrapper. This type preserves the original tool name
 * so it appears correctly in API conversation history.
 */
export interface McpToolUse {
	type: "mcp_tool_use"
	id?: string // Tool call ID from the API
	/** The original tool name from the API (e.g., "mcp_serverName_toolName") */
	name: string
	/** Extracted server name from the tool name */
	serverName: string
	/** Extracted tool name from the tool name */
	toolName: string
	/** Arguments passed to the MCP tool */
	arguments: Record<string, unknown>
	partial: boolean
}

export interface ExecuteCommandToolUse extends ToolUse<"execute_command"> {
	name: "execute_command"
	// Pick<Record<ToolParamName, string>, "command"> makes "command" required, but Partial<> makes it optional
	params: Partial<Pick<Record<ToolParamName, string>, "command" | "cwd">>
}

export interface ReadFileToolUse extends ToolUse<"read_file"> {
	name: "read_file"
	params: Partial<
		Pick<
			Record<ToolParamName, string>,
			| "args"
			| "path"
			| "start_line"
			| "end_line"
			| "mode"
			| "offset"
			| "limit"
			| "indentation"
			| "anchor_line"
			| "max_levels"
			| "include_siblings"
			| "include_header"
		>
	>
}

export interface WriteToFileToolUse extends ToolUse<"write_to_file"> {
	name: "write_to_file"
	params: Partial<Pick<Record<ToolParamName, string>, "purpose" | "path" | "content">>
}

export interface CodebaseSearchToolUse extends ToolUse<"codebase_search"> {
	name: "codebase_search"
	params: Partial<Pick<Record<ToolParamName, string>, "query" | "path">>
}

export interface SearchFilesToolUse extends ToolUse<"search_files"> {
	name: "search_files"
	params: Partial<Pick<Record<ToolParamName, string>, "path" | "regex" | "file_pattern">>
}

export interface ListFilesToolUse extends ToolUse<"list_files"> {
	name: "list_files"
	params: Partial<Pick<Record<ToolParamName, string>, "path" | "recursive">>
}

export interface BrowserActionToolUse extends ToolUse<"browser_action"> {
	name: "browser_action"
	params: Partial<Pick<Record<ToolParamName, string>, "action" | "url" | "coordinate" | "text" | "size" | "path">>
}

export interface UseMcpToolToolUse extends ToolUse<"use_mcp_tool"> {
	name: "use_mcp_tool"
	params: Partial<Pick<Record<ToolParamName, string>, "server_name" | "tool_name" | "arguments">>
}

export interface AccessMcpResourceToolUse extends ToolUse<"access_mcp_resource"> {
	name: "access_mcp_resource"
	params: Partial<Pick<Record<ToolParamName, string>, "server_name" | "uri">>
}

export interface AskFollowupQuestionToolUse extends ToolUse<"ask_followup_question"> {
	name: "ask_followup_question"
	params: Partial<Pick<Record<ToolParamName, string>, "type" | "question" | "follow_up">>
}

export interface AttemptCompletionToolUse extends ToolUse<"attempt_completion"> {
	name: "attempt_completion"
	params: Partial<Pick<Record<ToolParamName, string>, "result">>
}

export interface NewTaskToolUse extends ToolUse<"new_task"> {
	name: "new_task"
	params: Partial<Pick<Record<ToolParamName, string>, "mode" | "message" | "todos">>
}

export interface RunSlashCommandToolUse extends ToolUse<"run_slash_command"> {
	name: "run_slash_command"
	params: Partial<Pick<Record<ToolParamName, string>, "command" | "args">>
}

export interface SkillToolUse extends ToolUse<"skill"> {
	name: "skill"
	params: Partial<Pick<Record<ToolParamName, string>, "skill" | "args">>
}

export interface GenerateImageToolUse extends ToolUse<"generate_image"> {
	name: "generate_image"
	params: Partial<Pick<Record<ToolParamName, string>, "prompt" | "path" | "image">>
}

// Agent as Tools 架构的新工具接口定义
export interface SearchProjectToolUse extends ToolUse<"search_project"> {
	name: "search_project"
	params: Partial<Pick<Record<ToolParamName, string>, "query" | "scope" | "schema">>
}

export interface ApplyEditToolUse extends ToolUse<"apply_edit"> {
	name: "apply_edit"
	params: Partial<Pick<Record<ToolParamName, string>, "instruction" | "files" | "context" | "validate">>
}

export interface ConsultExpertToolUse extends ToolUse<"consult_expert"> {
	name: "consult_expert"
	params: Partial<
		Pick<
			Record<ToolParamName, string>,
			"domain" | "topic" | "question" | "knownContext" | "unknownPoints" | "attachments" | "consultType"
		>
	>
}

export interface BuildToolToolUse extends ToolUse<"build_tool"> {
	name: "build_tool"
	params: Partial<Pick<Record<ToolParamName, string>, "requirement" | "inputHint" | "outputHint">>
}

// Define tool group configuration
export type ToolGroupConfig = {
	tools: readonly string[]
	alwaysAvailable?: boolean // Whether this group is always available and shouldn't show in prompts view
	customTools?: readonly string[] // Opt-in only tools - only available when explicitly included via model's includedTools
}

export const TOOL_DISPLAY_NAMES: Record<ToolName, string> = {
	execute_command: "run commands",
	read_file: "read files",
	read_command_output: "read command output",
	read_media: "read media files",
	write_to_file: "write files",
	apply_diff: "apply changes",
	search_and_replace: "apply changes using search and replace",
	search_replace: "apply single search and replace",
	edit_file: "edit files using search and replace",
	apply_patch: "apply patches using codex format",
	search_files: "search files",
	list_files: "list files",
	browser_action: "use a browser",
	use_mcp_tool: "use mcp tools",
	access_mcp_resource: "access mcp resources",
	ask_followup_question: "ask questions",
	attempt_completion: "complete tasks",
	new_task: "create new task",
	codebase_search: "codebase search",
	update_todo_list: "update todo list",
	run_slash_command: "run slash command",
	skill: "load skill",
	generate_image: "generate images",
	custom_tool: "use custom tools",
	search_project: "search project",
	apply_edit: "apply edit",
	consult_expert: "consult expert",
	find_definition: "find definition",
	find_usages: "find usages",
	build_tool: "build tool",
	add_intent: "add intent",
	update_intent: "update intent",
	prune_intent: "prune intent",
	commit_intent: "commit intent",
	restructure_intent: "restructure intent tree",
} as const

// Define available tool groups.
export const TOOL_GROUPS: Record<ToolGroup, ToolGroupConfig> = {
	read: {
		// "read_file", "search_files", "list_files", are now in command
		// 因为模型可以直接通过命令行工具更加灵活地读取文件内容和搜索文件，所以这些工具未来使用命令行工具来替代
		// "read_media" 用于多模态 agent 读取媒体文件（图片等），根据 supportsImages 开关控制
		tools: ["codebase_search", "find_definition", "find_usages", "read_media"],
	},
	edit: {
		tools: ["apply_diff", "write_to_file", "generate_image"],
	},
	browser: {
		tools: ["browser_action"],
		// tools: [], // ! disable browser tools for now
	},
	command: {
		// 移除了  "read_command_output" ，因为 read_command_output 的功能其实可以用 grep/sed + 文件重定向替代。
		tools: ["execute_command"],
	},
	mcp: {
		// 	tools: ["use_mcp_tool", "access_mcp_resource"],
		tools: [], // ! disable mcp tools for now
	},
	modes: {
		// 	tools: ["switch_mode", "new_task"],
		// ! disable modes tools,because we move all modes tools to agent as tools,like search_project, apply_edit, consult_expert, build_tool
		tools: ["search_project", "apply_edit", "consult_expert", "build_tool"],
		alwaysAvailable: true,
	},
	intent: {
		// 意图树工具 - 仅在 solo_dev 模式下可用
		tools: ["add_intent", "update_intent", "prune_intent", "commit_intent", "restructure_intent"],
	},
}

// Tools that are always available to all modes.
export const ALWAYS_AVAILABLE_TOOLS: ToolName[] = [
	"ask_followup_question",
	"attempt_completion",
	// "switch_mode",
	// "new_task",
	"update_todo_list",
	// "run_slash_command",
	"skill",
	// Agent as Tools 架构的新工具 - 在所有模式下都可用
	// "search_project",
	// "apply_edit",
	// "consult_expert",
	// 意图树工具已移至 intent 组，仅在 solo_dev 模式下可用
] as const

/**
 * Central registry of tool aliases.
 * Maps alias name -> canonical tool name.
 *
 * This allows models to use alternative names for tools (e.g., "edit_file" instead of "apply_diff").
 * When a model calls a tool by its alias, the system resolves it to the canonical name for execution,
 * but preserves the alias in API conversation history for consistency.
 *
 * To add a new alias, simply add an entry here. No other files need to be modified.
 */
export const TOOL_ALIASES: Record<string, ToolName> = {
	write_file: "write_to_file",
} as const

export type DiffResult =
	| { success: true; content: string; failParts?: DiffResult[] }
	| ({
			success: false
			error?: string
			details?: {
				similarity?: number
				threshold?: number
				matchedRange?: { start: number; end: number }
				searchContent?: string
				bestMatch?: string
			}
			failParts?: DiffResult[]
	  } & ({ error: string } | { failParts: DiffResult[] }))

export interface DiffItem {
	content: string
	startLine?: number
}

export interface DiffStrategy {
	/**
	 * Get the name of this diff strategy for analytics and debugging
	 * @returns The name of the diff strategy
	 */
	getName(): string

	/**
	 * Apply a diff to the original content
	 * @param originalContent The original file content
	 * @param diffContent The diff content in the strategy's format (string for legacy, DiffItem[] for new)
	 * @param startLine Optional line number where the search block starts. If not provided, searches the entire file.
	 * @param endLine Optional line number where the search block ends. If not provided, searches the entire file.
	 * @returns A DiffResult object containing either the successful result or error details
	 */
	applyDiff(
		originalContent: string,
		diffContent: string | DiffItem[],
		startLine?: number,
		endLine?: number,
	): Promise<DiffResult>

	getProgressStatus?(toolUse: ToolUse, result?: any): ToolProgressStatus
}
