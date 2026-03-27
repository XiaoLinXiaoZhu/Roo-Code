/**
 * toUIMessages — 将 DomainEvent[] 映射为 ClineMessage[]
 *
 * 这是从事件流到 UI 消息的纯函数映射。
 * 将统一事件模型转换为现有 WebView 兼容的 ClineMessage 格式。
 *
 * 设计目的：
 * 1. 保持与现有 WebView UI 的完全兼容
 * 2. 从 DomainEvent 派生 ClineMessage，而非双写
 * 3. 纯函数，便于测试
 *
 * @module toUIMessages
 */

import type { DomainEvent, ToolCallEvent, ToolResultEvent } from "@roo-code/types"

import type { ClineMessage, ClineSay, ContextCondense, ContextTruncation } from "@roo-code/types"

/**
 * 将 DomainEvent[] 转换为 ClineMessage[]
 *
 * 纯函数，不产生副作用。
 * 保持与现有 WebView ChatRow 组件的兼容性。
 *
 * @param events - 原始事件流
 * @returns ClineMessage 数组（与现有 UI 兼容的格式）
 */
export function toUIMessages(events: DomainEvent[]): ClineMessage[] {
	const messages: ClineMessage[] = []

	for (const event of events) {
		const mapped = mapEventToUIMessage(event)
		if (mapped) {
			if (Array.isArray(mapped)) {
				messages.push(...mapped)
			} else {
				messages.push(mapped)
			}
		}
	}

	return messages
}

// ═══════════════════════════════════════════
// 内部映射逻辑
// ═══════════════════════════════════════════

function mapEventToUIMessage(event: DomainEvent): ClineMessage | ClineMessage[] | null {
	switch (event.type) {
		case "user_text":
		case "user_feedback":
			return {
				ts: event.ts,
				type: "say",
				say: "user_feedback",
				text: event.content,
				images: event.images,
			}

		case "api_request_started":
			return {
				ts: event.ts,
				type: "say",
				say: "api_req_started",
				text: JSON.stringify({
					request: undefined,
					tokensIn: 0,
					tokensOut: 0,
					cost: 0,
				}),
				apiProtocol: event.protocol,
			}

		case "api_request_finished":
			// api_req_finished 在当前 UI 中是一个单独的 say 消息
			// 同时需要更新对应的 api_req_started 消息（由 UI 层处理）
			return {
				ts: event.ts,
				type: "say",
				say: "api_req_finished",
			}

		case "api_request_retried":
			return {
				ts: event.ts,
				type: "say",
				say: "api_req_retried",
			}

		case "api_request_rate_limit":
			return {
				ts: event.ts,
				type: "say",
				say: "api_req_rate_limit_wait",
			}

		case "assistant_text":
			return {
				ts: event.ts,
				type: "say",
				say: "text",
				text: event.content,
				partial: event.partial,
			}

		case "assistant_reasoning":
			return {
				ts: event.ts,
				type: "say",
				say: "reasoning",
				reasoning: event.content,
				partial: event.partial,
			}

		case "tool_call":
			return mapToolCallToUIMessage(event)

		case "tool_result":
			return mapToolResultToUIMessage(event)

		case "tool_approval_request":
			// 审批请求已经包含在 tool_call 的 ask 消息中
			return null

		case "tool_approval_response":
			// 审批响应由 UI 交互处理，不需要额外消息
			if (event.feedback) {
				return {
					ts: event.ts,
					type: "say",
					say: "user_feedback",
					text: event.feedback,
					images: event.images,
				}
			}
			return null

		case "condense":
			return mapCondenseToUIMessage(event)

		case "truncation":
			return mapTruncationToUIMessage(event)

		case "error":
			return {
				ts: event.ts,
				type: "say",
				say: "error",
				text: event.message,
			}

		case "checkpoint":
			return {
				ts: event.ts,
				type: "say",
				say: "checkpoint_saved",
			}

		case "subtask_result":
			return {
				ts: event.ts,
				type: "say",
				say: "subtask_result",
				text: event.result,
			}

		case "shell_integration_warning":
			return {
				ts: event.ts,
				type: "say",
				say: "shell_integration_warning",
				text: event.message,
			}

		default:
			return null
	}
}

/**
 * 将工具调用事件映射为 UI 消息
 *
 * 在当前 UI 中，工具调用显示为 ask("tool", JSON) 格式。
 * ClineSayTool 结构中将工具名称和参数扁平化。
 */
function mapToolCallToUIMessage(event: ToolCallEvent): ClineMessage {
	// 构建 ClineSayTool 兼容的 JSON
	const toolData: Record<string, unknown> = {
		tool: getUIToolName(event.tool),
		...flattenToolArgs(event),
	}

	return {
		ts: event.ts,
		type: "ask",
		ask: "tool",
		text: JSON.stringify(toolData),
		partial: event.partial,
	}
}

/**
 * 将工具结果事件映射为 UI 消息
 *
 * 不同工具结果在 UI 中有不同的展示方式。
 */
function mapToolResultToUIMessage(event: ToolResultEvent): ClineMessage | null {
	switch (event.tool) {
		case "execute_command":
		case "exec":
			// 命令输出有专门的 say 类型
			return {
				ts: event.ts,
				type: "say",
				say: "command_output",
				text: [event.stdout, event.stderr].filter(Boolean).join("\n"),
			}
		case "attempt_completion":
			return {
				ts: event.ts,
				type: "say",
				say: "completion_result",
				text: event.feedback ?? (event.accepted ? "Task completed" : "Task rejected"),
			}
		default:
			// 大多数工具结果不单独生成 UI 消息（已包含在工具 ask 消息中）
			return null
	}
}

/** 将 condense 事件映射为 UI 消息 */
function mapCondenseToUIMessage(event: DomainEvent & { type: "condense" }): ClineMessage {
	const contextCondense: ContextCondense = {
		cost: event.cost,
		prevContextTokens: event.prevContextTokens,
		newContextTokens: event.newContextTokens,
		summary: event.summary,
	}

	return {
		ts: event.ts,
		type: "say",
		say: "condense_context",
		contextCondense,
	}
}

/** 将 truncation 事件映射为 UI 消息 */
function mapTruncationToUIMessage(event: DomainEvent & { type: "truncation" }): ClineMessage {
	const contextTruncation: ContextTruncation = {
		truncationId: event.id,
		messagesRemoved: event.messagesRemoved,
		prevContextTokens: event.prevContextTokens,
		newContextTokens: event.newContextTokens,
	}

	return {
		ts: event.ts,
		type: "say",
		say: "sliding_window_truncation",
		contextTruncation,
	}
}

// ═══════════════════════════════════════════
// 工具名称和参数转换
// ═══════════════════════════════════════════

/** 将内部工具名映射为 UI 显示的工具名 */
function getUIToolName(tool: string): string {
	// 大多数工具名称直接对应
	const nameMap: Record<string, string> = {
		read_file: "readFile",
		write_to_file: "writeToFile",
		execute_command: "executeCommand",
		search_files: "searchFiles",
		list_files: "listFiles",
		ask_followup_question: "askFollowupQuestion",
		attempt_completion: "attemptCompletion",
		use_mcp_tool: "useMcpTool",
		access_mcp_resource: "accessMcpResource",
		apply_diff: "applyDiff",
		search_replace: "searchReplace",
		edit_file: "editFile",
		apply_patch: "applyPatch",
		read_command_output: "readCommandOutput",
		read_media: "readMedia",
		codebase_search: "codebaseSearch",
		search_project: "searchProject",
		new_task: "newTask",
		update_todo_list: "updateTodoList",
		run_slash_command: "runSlashCommand",
		generate_image: "generateImage",
		find_definition: "findDefinition",
		find_usages: "findUsages",
		build_tool: "buildTool",
		apply_edit: "applyEdit",
		consult_expert: "consultExpert",
		add_intent: "addIntent",
		update_intent: "updateIntent",
		prune_intent: "pruneIntent",
		commit_intent: "commitIntent",
		restructure_intent: "restructureIntent",
	}

	return nameMap[tool] ?? tool
}

/** 扁平化工具参数为 ClineSayTool 格式 */
function flattenToolArgs(event: ToolCallEvent): Record<string, unknown> {
	// ClineSayTool 使用扁平的可选属性结构
	return event.args as Record<string, unknown>
}
