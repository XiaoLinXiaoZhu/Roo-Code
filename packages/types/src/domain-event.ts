/**
 * DomainEvent — 统一事件模型（SSOT）
 *
 * 这是整个系统的单一事实来源（Single Source of Truth）。
 * 所有其他消息格式（ClineMessage、ApiMessage、Provider 格式）都应该是它的"视图"。
 *
 * 设计原则：
 * 1. 只追加（append-only）：所有"修改"通过新增事件表达
 * 2. 显式关联：使用 id + parentId 替代脆弱的时间戳匹配
 * 3. 强类型工具定义：每个工具有独立的 args/result 类型，通过判别联合窄化
 * 4. Provider 无关：provider 特有信息隔离在 providerMeta 中
 *
 * @module domain-event
 */

// ═══════════════════════════════════════════
// 基础事件接口
// ═══════════════════════════════════════════

/**
 * 所有事件的基础接口
 */
export interface EventBase {
	/** 单调递增的唯一标识 */
	id: string
	/** 创建时间戳 (ms) */
	ts: number
	/** 可选的关联事件 ID（如 tool_result 关联 tool_call） */
	parentId?: string
}

// ═══════════════════════════════════════════
// 用户消息事件
// ═══════════════════════════════════════════

/** 用户文本输入（首次任务描述或后续跟进） */
export interface UserTextEvent extends EventBase {
	type: "user_text"
	content: string
	images?: string[]
}

/** 用户对工具审批的反馈 */
export interface UserFeedbackEvent extends EventBase {
	type: "user_feedback"
	content: string
	images?: string[]
}

// ═══════════════════════════════════════════
// API 请求生命周期事件
// ═══════════════════════════════════════════

/** API 请求开始 */
export interface ApiRequestStartedEvent extends EventBase {
	type: "api_request_started"
	/** 使用的 API 协议 */
	protocol: "openai" | "anthropic"
}

/** API 请求完成 */
export interface ApiRequestFinishedEvent extends EventBase {
	type: "api_request_finished"
	/** 关联到 api_request_started 的 id */
	parentId: string
	tokensIn: number
	tokensOut: number
	cacheWrites?: number
	cacheReads?: number
	cost: number
	cancelReason?: "streaming_failed" | "user_cancelled"
}

/** API 请求重试 */
export interface ApiRequestRetriedEvent extends EventBase {
	type: "api_request_retried"
	parentId: string
}

/** API 请求限流等待 */
export interface ApiRequestRateLimitEvent extends EventBase {
	type: "api_request_rate_limit"
	parentId: string
}

// ═══════════════════════════════════════════
// 助手输出事件
// ═══════════════════════════════════════════

/** 助手文本输出 */
export interface AssistantTextEvent extends EventBase {
	type: "assistant_text"
	content: string
	partial?: boolean
}

/** 助手推理过程 */
export interface AssistantReasoningEvent extends EventBase {
	type: "assistant_reasoning"
	content: string
	partial?: boolean
	/** Provider 特有的元数据（如 Anthropic thinking signature），仅用于 round-trip */
	providerMeta?: Record<string, unknown>
}

// ═══════════════════════════════════════════
// 工具调用事件 — 每个工具独立类型
// ═══════════════════════════════════════════

/** 工具调用基础接口 */
interface ToolCallBase extends EventBase {
	type: "tool_call"
	/** LLM 返回的 tool_use_id */
	toolCallId: string
	/** 是否为流式部分结果 */
	partial?: boolean
}

// ── 文件读写工具 ──

export interface ReadFileToolCall extends ToolCallBase {
	tool: "read_file"
	args: {
		path: string
		start_line?: number
		end_line?: number
	}
}

export interface WriteToFileToolCall extends ToolCallBase {
	tool: "write_to_file"
	args: {
		path: string
		content: string
	}
}

export interface ApplyDiffToolCall extends ToolCallBase {
	tool: "apply_diff"
	args: {
		path: string
		diff: string
	}
}

export interface SearchReplaceToolCall extends ToolCallBase {
	tool: "search_replace"
	args: {
		path: string
		operations: string
	}
}

export interface EditFileToolCall extends ToolCallBase {
	tool: "edit_file"
	args: {
		path: string
		diff: string
	}
}

export interface ApplyPatchToolCall extends ToolCallBase {
	tool: "apply_patch"
	args: {
		patch: string
	}
}

// ── 编辑工具（Agent as Tool） ──

export interface EditToolCall extends ToolCallBase {
	tool: "edit"
	args: {
		path: string
		intent: string
	}
}

export interface ApplyEditToolCall extends ToolCallBase {
	tool: "apply_edit"
	args: {
		path: string
		intent: string
	}
}

export interface WriteToolCall extends ToolCallBase {
	tool: "write"
	args: {
		path: string
		content: string
	}
}

// ── 命令执行工具 ──

export interface ExecuteCommandToolCall extends ToolCallBase {
	tool: "execute_command"
	args: {
		command: string
		cwd?: string
	}
}

export interface ReadCommandOutputToolCall extends ToolCallBase {
	tool: "read_command_output"
	args: Record<string, never>
}

export interface ExecToolCall extends ToolCallBase {
	tool: "exec"
	args: {
		script: string
		runtime?: string
		cwd?: string
		timeout?: number
	}
}

// ── 搜索工具 ──

export interface SearchFilesToolCall extends ToolCallBase {
	tool: "search_files"
	args: {
		path: string
		regex: string
		file_pattern?: string
	}
}

export interface ListFilesToolCall extends ToolCallBase {
	tool: "list_files"
	args: {
		path: string
		recursive?: string
	}
}

export interface CodebaseSearchToolCall extends ToolCallBase {
	tool: "codebase_search"
	args: {
		query: string
		path?: string
	}
}

export interface SearchProjectToolCall extends ToolCallBase {
	tool: "search_project"
	args: {
		query: string
		path?: string
	}
}

// ── AST 工具 ──

export interface FindDefinitionToolCall extends ToolCallBase {
	tool: "find_definition"
	args: {
		symbol: string
		path?: string
	}
}

export interface FindUsagesToolCall extends ToolCallBase {
	tool: "find_usages"
	args: {
		symbol: string
		path?: string
	}
}

// ── MCP 工具 ──

export interface UseMcpToolToolCall extends ToolCallBase {
	tool: "use_mcp_tool"
	args: {
		server_name: string
		tool_name: string
		arguments: string
	}
}

export interface AccessMcpResourceToolCall extends ToolCallBase {
	tool: "access_mcp_resource"
	args: {
		server_name: string
		uri: string
	}
}

// ── 交互与完成工具 ──

export interface AskFollowupQuestionToolCall extends ToolCallBase {
	tool: "ask_followup_question"
	args: {
		question: string
	}
}

export interface AttemptCompletionToolCall extends ToolCallBase {
	tool: "attempt_completion"
	args: {
		result: string
		command?: string
	}
}

// ── 任务管理工具 ──

export interface NewTaskToolCall extends ToolCallBase {
	tool: "new_task"
	args: {
		mode: string
		message: string
	}
}

export interface UpdateTodoListToolCall extends ToolCallBase {
	tool: "update_todo_list"
	args: {
		content: string
	}
}

export interface ReminderToolCall extends ToolCallBase {
	tool: "reminder"
	args: {
		content: string
		delay?: number
	}
}

// ── 其他工具 ──

export interface ReadMediaToolCall extends ToolCallBase {
	tool: "read_media"
	args: {
		path: string
	}
}

export interface RunSlashCommandToolCall extends ToolCallBase {
	tool: "run_slash_command"
	args: {
		command: string
	}
}

export interface SkillToolCall extends ToolCallBase {
	tool: "skill"
	args: {
		name: string
		arguments?: string
	}
}

export interface GenerateImageToolCall extends ToolCallBase {
	tool: "generate_image"
	args: {
		prompt: string
		path: string
		image?: string
	}
}

export interface ConsultExpertToolCall extends ToolCallBase {
	tool: "consult_expert"
	args: {
		question: string
		context?: string
	}
}

export interface BuildToolToolCall extends ToolCallBase {
	tool: "build_tool"
	args: {
		name: string
		description: string
		schema: string
	}
}

export interface CustomToolCall extends ToolCallBase {
	tool: "custom_tool"
	args: Record<string, unknown>
}

// ── 意图树工具 ──

export interface AddIntentToolCall extends ToolCallBase {
	tool: "add_intent"
	args: {
		parent_id?: string
		description: string
		type?: string
	}
}

export interface UpdateIntentToolCall extends ToolCallBase {
	tool: "update_intent"
	args: {
		intent_id: string
		status?: string
		description?: string
	}
}

export interface PruneIntentToolCall extends ToolCallBase {
	tool: "prune_intent"
	args: {
		intent_id: string
		reason?: string
	}
}

export interface CommitIntentToolCall extends ToolCallBase {
	tool: "commit_intent"
	args: {
		intent_id: string
		summary?: string
	}
}

export interface RestructureIntentToolCall extends ToolCallBase {
	tool: "restructure_intent"
	args: {
		operations: string
	}
}

/** 所有工具调用事件的联合类型 */
export type ToolCallEvent =
	| ReadFileToolCall
	| WriteToFileToolCall
	| ApplyDiffToolCall
	| SearchReplaceToolCall
	| EditFileToolCall
	| ApplyPatchToolCall
	| EditToolCall
	| ApplyEditToolCall
	| WriteToolCall
	| ExecuteCommandToolCall
	| ReadCommandOutputToolCall
	| ExecToolCall
	| SearchFilesToolCall
	| ListFilesToolCall
	| CodebaseSearchToolCall
	| SearchProjectToolCall
	| FindDefinitionToolCall
	| FindUsagesToolCall
	| UseMcpToolToolCall
	| AccessMcpResourceToolCall
	| AskFollowupQuestionToolCall
	| AttemptCompletionToolCall
	| NewTaskToolCall
	| UpdateTodoListToolCall
	| ReminderToolCall
	| ReadMediaToolCall
	| RunSlashCommandToolCall
	| SkillToolCall
	| GenerateImageToolCall
	| ConsultExpertToolCall
	| BuildToolToolCall
	| CustomToolCall
	| AddIntentToolCall
	| UpdateIntentToolCall
	| PruneIntentToolCall
	| CommitIntentToolCall
	| RestructureIntentToolCall

// ═══════════════════════════════════════════
// 工具结果事件 — 每个工具独立结果类型
// ═══════════════════════════════════════════

/** 工具结果基础接口 */
interface ToolResultBase extends EventBase {
	type: "tool_result"
	/** 关联 tool_call 的事件 id */
	parentId: string
	/** LLM tool_use_id */
	toolCallId: string
}

export interface ReadFileToolResult extends ToolResultBase {
	tool: "read_file"
	content: string
	truncated?: boolean
}

export interface WriteToFileToolResult extends ToolResultBase {
	tool: "write_to_file"
	success: boolean
	diff?: string
	error?: string
}

export interface ApplyDiffToolResult extends ToolResultBase {
	tool: "apply_diff"
	success: boolean
	diff?: string
	error?: string
}

export interface SearchReplaceToolResult extends ToolResultBase {
	tool: "search_replace"
	success: boolean
	diff?: string
	error?: string
}

export interface EditFileToolResult extends ToolResultBase {
	tool: "edit_file"
	success: boolean
	diff?: string
	error?: string
}

export interface ApplyPatchToolResult extends ToolResultBase {
	tool: "apply_patch"
	success: boolean
	error?: string
}

export interface EditToolResult extends ToolResultBase {
	tool: "edit"
	success: boolean
	diff?: string
	error?: string
}

export interface ApplyEditToolResult extends ToolResultBase {
	tool: "apply_edit"
	success: boolean
	diff?: string
	error?: string
}

export interface WriteToolResult extends ToolResultBase {
	tool: "write"
	success: boolean
	error?: string
}

export interface ExecuteCommandToolResult extends ToolResultBase {
	tool: "execute_command"
	exitCode: number
	stdout: string
	stderr: string
}

export interface ReadCommandOutputToolResult extends ToolResultBase {
	tool: "read_command_output"
	output: string
}

export interface ExecToolResult extends ToolResultBase {
	tool: "exec"
	exitCode: number
	stdout: string
	stderr: string
	durationMs?: number
}

export interface SearchFilesToolResult extends ToolResultBase {
	tool: "search_files"
	results: string
}

export interface ListFilesToolResult extends ToolResultBase {
	tool: "list_files"
	results: string
}

export interface CodebaseSearchToolResult extends ToolResultBase {
	tool: "codebase_search"
	results: string
}

export interface SearchProjectToolResult extends ToolResultBase {
	tool: "search_project"
	results: string
}

export interface FindDefinitionToolResult extends ToolResultBase {
	tool: "find_definition"
	results: string
}

export interface FindUsagesToolResult extends ToolResultBase {
	tool: "find_usages"
	results: string
}

export interface UseMcpToolToolResult extends ToolResultBase {
	tool: "use_mcp_tool"
	result: string
}

export interface AccessMcpResourceToolResult extends ToolResultBase {
	tool: "access_mcp_resource"
	result: string
}

export interface AskFollowupQuestionToolResult extends ToolResultBase {
	tool: "ask_followup_question"
	answer: string
	images?: string[]
}

export interface AttemptCompletionToolResult extends ToolResultBase {
	tool: "attempt_completion"
	accepted: boolean
	feedback?: string
}

export interface NewTaskToolResult extends ToolResultBase {
	tool: "new_task"
	result: string
}

export interface UpdateTodoListToolResult extends ToolResultBase {
	tool: "update_todo_list"
	success: boolean
}

export interface ReminderToolResult extends ToolResultBase {
	tool: "reminder"
	success: boolean
}

export interface ReadMediaToolResult extends ToolResultBase {
	tool: "read_media"
	content: string
	mediaType: string
}

export interface RunSlashCommandToolResult extends ToolResultBase {
	tool: "run_slash_command"
	result: string
}

export interface SkillToolResult extends ToolResultBase {
	tool: "skill"
	result: string
}

export interface GenerateImageToolResult extends ToolResultBase {
	tool: "generate_image"
	success: boolean
	path?: string
	error?: string
}

export interface ConsultExpertToolResult extends ToolResultBase {
	tool: "consult_expert"
	answer: string
}

export interface BuildToolToolResult extends ToolResultBase {
	tool: "build_tool"
	success: boolean
	error?: string
}

export interface CustomToolResult extends ToolResultBase {
	tool: "custom_tool"
	result: string
}

export interface AddIntentToolResult extends ToolResultBase {
	tool: "add_intent"
	intentId: string
	success: boolean
}

export interface UpdateIntentToolResult extends ToolResultBase {
	tool: "update_intent"
	success: boolean
}

export interface PruneIntentToolResult extends ToolResultBase {
	tool: "prune_intent"
	success: boolean
}

export interface CommitIntentToolResult extends ToolResultBase {
	tool: "commit_intent"
	success: boolean
}

export interface RestructureIntentToolResult extends ToolResultBase {
	tool: "restructure_intent"
	success: boolean
}

/** 所有工具结果事件的联合类型 */
export type ToolResultEvent =
	| ReadFileToolResult
	| WriteToFileToolResult
	| ApplyDiffToolResult
	| SearchReplaceToolResult
	| EditFileToolResult
	| ApplyPatchToolResult
	| EditToolResult
	| ApplyEditToolResult
	| WriteToolResult
	| ExecuteCommandToolResult
	| ReadCommandOutputToolResult
	| ExecToolResult
	| SearchFilesToolResult
	| ListFilesToolResult
	| CodebaseSearchToolResult
	| SearchProjectToolResult
	| FindDefinitionToolResult
	| FindUsagesToolResult
	| UseMcpToolToolResult
	| AccessMcpResourceToolResult
	| AskFollowupQuestionToolResult
	| AttemptCompletionToolResult
	| NewTaskToolResult
	| UpdateTodoListToolResult
	| ReminderToolResult
	| ReadMediaToolResult
	| RunSlashCommandToolResult
	| SkillToolResult
	| GenerateImageToolResult
	| ConsultExpertToolResult
	| BuildToolToolResult
	| CustomToolResult
	| AddIntentToolResult
	| UpdateIntentToolResult
	| PruneIntentToolResult
	| CommitIntentToolResult
	| RestructureIntentToolResult

// ═══════════════════════════════════════════
// 用户审批事件
// ═══════════════════════════════════════════

/** 工具审批请求（系统发起，等待用户） */
export interface ToolApprovalRequestEvent extends EventBase {
	type: "tool_approval_request"
	/** 关联 tool_call 的 id */
	parentId: string
	toolCallId: string
}

/** 工具审批响应（用户操作） */
export interface ToolApprovalResponseEvent extends EventBase {
	type: "tool_approval_response"
	/** 关联 tool_approval_request 的 id */
	parentId: string
	approved: boolean
	feedback?: string
	images?: string[]
}

// ═══════════════════════════════════════════
// 上下文管理事件
// ═══════════════════════════════════════════

/** 上下文摘要事件 */
export interface CondenseEvent extends EventBase {
	type: "condense"
	summary: string
	cost: number
	prevContextTokens: number
	newContextTokens: number
	/** 此摘要替换的事件 ID 范围（起） */
	replacesFrom: string
	/** 此摘要替换的事件 ID 范围（止） */
	replacesTo: string
}

/** 上下文截断事件 */
export interface TruncationEvent extends EventBase {
	type: "truncation"
	messagesRemoved: number
	prevContextTokens: number
	newContextTokens: number
}

// ═══════════════════════════════════════════
// 系统事件
// ═══════════════════════════════════════════

/** 错误事件 */
export interface ErrorEvent extends EventBase {
	type: "error"
	message: string
	recoverable: boolean
}

/** 检查点事件 */
export interface CheckpointEvent extends EventBase {
	type: "checkpoint"
}

/** 子任务结果事件 */
export interface SubtaskResultEvent extends EventBase {
	type: "subtask_result"
	result: string
}

/** Shell 集成警告事件 */
export interface ShellIntegrationWarningEvent extends EventBase {
	type: "shell_integration_warning"
	message: string
}

// ═══════════════════════════════════════════
// 联合类型
// ═══════════════════════════════════════════

/**
 * DomainEvent — 系统中所有事件的联合类型
 *
 * 这是整个应用的 SSOT（单一事实来源）。
 * ClineMessage 和 ApiMessage 都应该从 DomainEvent[] 派生。
 */
export type DomainEvent =
	| UserTextEvent
	| UserFeedbackEvent
	| ApiRequestStartedEvent
	| ApiRequestFinishedEvent
	| ApiRequestRetriedEvent
	| ApiRequestRateLimitEvent
	| AssistantTextEvent
	| AssistantReasoningEvent
	| ToolCallEvent
	| ToolResultEvent
	| ToolApprovalRequestEvent
	| ToolApprovalResponseEvent
	| CondenseEvent
	| TruncationEvent
	| ErrorEvent
	| CheckpointEvent
	| SubtaskResultEvent
	| ShellIntegrationWarningEvent

// ═══════════════════════════════════════════
// 工具类型辅助
// ═══════════════════════════════════════════

/** 从 ToolCallEvent 中提取工具名称 */
export type ToolCallToolName = ToolCallEvent["tool"]

/** 根据工具名称窄化 ToolCallEvent */
export type ToolCallByName<T extends ToolCallToolName> = Extract<ToolCallEvent, { tool: T }>

/** 根据工具名称窄化 ToolResultEvent */
export type ToolResultByName<T extends ToolCallToolName> = Extract<ToolResultEvent, { tool: T }>

/** 根据事件 type 窄化 DomainEvent */
export type DomainEventByType<T extends DomainEvent["type"]> = Extract<DomainEvent, { type: T }>
