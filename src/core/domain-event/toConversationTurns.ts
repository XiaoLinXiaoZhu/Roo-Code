/**
 * toConversationTurns — 将 DomainEvent[] 映射为 ConversationTurn[]
 *
 * 这是从事件流到对话轮次的纯函数映射。
 * 处理逻辑：
 * 1. 过滤被 condense/truncation 替换的事件
 * 2. 将扁平事件流重组为 user/assistant 交替结构
 * 3. 合并相邻的同角色内容块
 *
 * @module toConversationTurns
 */

import type { DomainEvent, ToolCallEvent, ToolResultEvent, CondenseEvent } from "@roo-code/types"

import type {
	ConversationTurn,
	UserTurn,
	AssistantTurn,
	ContentBlock,
	ToolCallContentBlock,
	ToolResultContentBlock,
	TextContentBlock,
} from "@roo-code/types"

/**
 * 将 DomainEvent[] 转换为 Provider 无关的 ConversationTurn[]
 *
 * 纯函数，不产生副作用。
 *
 * @param events - 原始事件流
 * @returns 对话轮次数组（user/assistant 交替）
 */
export function toConversationTurns(events: DomainEvent[]): ConversationTurn[] {
	// Step 1: 过滤被 condense/truncation 替换的事件
	const activeEvents = filterCondensedEvents(events)

	// Step 2: 将事件流转换为对话轮次
	const turns: ConversationTurn[] = []
	let currentUserBlocks: ContentBlock[] = []
	let currentAssistantBlocks: ContentBlock[] = []

	for (const event of activeEvents) {
		switch (event.type) {
			case "user_text":
			case "user_feedback": {
				// 用户消息开始新的 user turn（先 flush 之前的 assistant turn）
				flushAssistantTurn(turns, currentAssistantBlocks)
				currentAssistantBlocks = []

				const textBlock: TextContentBlock = { type: "text", text: event.content }
				currentUserBlocks.push(textBlock)

				if (event.images) {
					for (const img of event.images) {
						currentUserBlocks.push({ type: "image", source: img, mediaType: "image/png" })
					}
				}
				break
			}

			case "assistant_text": {
				// 助手文本，flush user turn
				flushUserTurn(turns, currentUserBlocks)
				currentUserBlocks = []

				if (!event.partial) {
					currentAssistantBlocks.push({ type: "text", text: event.content })
				}
				break
			}

			case "assistant_reasoning": {
				flushUserTurn(turns, currentUserBlocks)
				currentUserBlocks = []

				if (!event.partial) {
					currentAssistantBlocks.push({
						type: "reasoning",
						text: event.content,
						providerMeta: event.providerMeta,
					})
				}
				break
			}

			case "tool_call": {
				// 工具调用属于 assistant turn
				flushUserTurn(turns, currentUserBlocks)
				currentUserBlocks = []

				if (!event.partial) {
					const toolBlock = toolCallToContentBlock(event)
					currentAssistantBlocks.push(toolBlock)
				}
				break
			}

			case "tool_result": {
				// 工具结果属于 user turn（在 API 消息中，tool_result 是 user 角色）
				// 先 flush assistant turn
				flushAssistantTurn(turns, currentAssistantBlocks)
				currentAssistantBlocks = []

				const resultBlock = toolResultToContentBlock(event)
				currentUserBlocks.push(resultBlock)
				break
			}

			case "condense": {
				// 摘要替换为一个 user turn（包含摘要文本）
				flushAssistantTurn(turns, currentAssistantBlocks)
				currentAssistantBlocks = []

				currentUserBlocks.push({
					type: "text",
					text: event.summary,
				})
				break
			}

			// 以下事件不直接影响对话轮次
			case "api_request_started":
			case "api_request_finished":
			case "api_request_retried":
			case "api_request_rate_limit":
			case "tool_approval_request":
			case "tool_approval_response":
			case "truncation":
			case "error":
			case "checkpoint":
			case "subtask_result":
			case "shell_integration_warning":
				// 这些事件不映射到对话轮次
				break
		}
	}

	// Flush 剩余的 blocks
	flushUserTurn(turns, currentUserBlocks)
	flushAssistantTurn(turns, currentAssistantBlocks)

	return turns
}

// ═══════════════════════════════════════════
// 内部辅助函数
// ═══════════════════════════════════════════

/**
 * 过滤被 condense 替换的事件
 *
 * 当存在 CondenseEvent 时，它的 replacesFrom ~ replacesTo 范围内的事件
 * 会被替换为 condense 事件本身。
 */
function filterCondensedEvents(events: DomainEvent[]): DomainEvent[] {
	// 收集所有 condense 事件的替换范围
	const condenseEvents = events.filter((e): e is CondenseEvent => e.type === "condense")

	if (condenseEvents.length === 0) {
		return events
	}

	// 构建被替换的事件 ID 集合
	const replacedIds = new Set<string>()
	for (const condense of condenseEvents) {
		const fromIdx = events.findIndex((e) => e.id === condense.replacesFrom)
		const toIdx = events.findIndex((e) => e.id === condense.replacesTo)

		if (fromIdx >= 0 && toIdx >= 0) {
			for (let i = fromIdx; i <= toIdx; i++) {
				replacedIds.add(events[i].id)
			}
		}
	}

	// 过滤掉被替换的事件
	return events.filter((e) => !replacedIds.has(e.id))
}

/** 将 ToolCallEvent 转换为 ToolCallContentBlock */
function toolCallToContentBlock(event: ToolCallEvent): ToolCallContentBlock {
	return {
		type: "tool_call",
		toolCallId: event.toolCallId,
		toolName: event.tool,
		args: event.args as Record<string, unknown>,
	}
}

/** 将 ToolResultEvent 转换为 ToolResultContentBlock */
function toolResultToContentBlock(event: ToolResultEvent): ToolResultContentBlock {
	// 根据工具类型提取结果内容
	const content = extractResultContent(event)
	const isError = extractIsError(event)

	return {
		type: "tool_result",
		toolCallId: event.toolCallId,
		content,
		isError: isError || undefined,
	}
}

/** 从 ToolResultEvent 提取文本内容 */
function extractResultContent(event: ToolResultEvent): string {
	switch (event.tool) {
		case "read_file":
			return event.content
		case "execute_command":
			return [event.stdout, event.stderr].filter(Boolean).join("\n")
		case "exec":
			return [event.stdout, event.stderr].filter(Boolean).join("\n")
		case "write_to_file":
		case "apply_diff":
		case "search_replace":
		case "edit_file":
		case "edit":
		case "apply_edit":
			return event.error ?? event.diff ?? (event.success ? "Success" : "Failed")
		case "apply_patch":
		case "write":
			return event.error ?? (event.success ? "Success" : "Failed")
		case "update_todo_list":
		case "reminder":
			return event.success ? "Success" : "Failed"
		case "search_files":
		case "list_files":
		case "codebase_search":
		case "search_project":
		case "find_definition":
		case "find_usages":
			return event.results
		case "use_mcp_tool":
		case "access_mcp_resource":
		case "new_task":
		case "run_slash_command":
		case "skill":
		case "custom_tool":
			return event.result
		case "ask_followup_question":
			return event.answer
		case "attempt_completion":
			return event.feedback ?? (event.accepted ? "Accepted" : "Rejected")
		case "read_command_output":
			return event.output
		case "read_media":
			return event.content
		case "generate_image":
			return event.error ?? (event.success ? `Image saved to ${event.path}` : "Failed")
		case "consult_expert":
			return event.answer
		case "build_tool":
			return event.error ?? (event.success ? "Tool built successfully" : "Failed")
		case "add_intent":
			return event.success ? `Intent ${event.intentId} added` : "Failed"
		case "update_intent":
		case "prune_intent":
		case "commit_intent":
		case "restructure_intent":
			return event.success ? "Success" : "Failed"
		default:
			return "Unknown tool result"
	}
}

/** 判断工具结果是否为错误 */
function extractIsError(event: ToolResultEvent): boolean {
	switch (event.tool) {
		case "write_to_file":
		case "apply_diff":
		case "search_replace":
		case "edit_file":
		case "edit":
		case "apply_edit":
		case "apply_patch":
		case "write":
		case "generate_image":
		case "build_tool":
		case "update_todo_list":
		case "reminder":
		case "add_intent":
		case "update_intent":
		case "prune_intent":
		case "commit_intent":
		case "restructure_intent":
			return !event.success
		case "execute_command":
			return event.exitCode !== 0
		case "exec":
			return event.exitCode !== 0
		default:
			return false
	}
}

/** 将 user blocks flush 为一个 UserTurn */
function flushUserTurn(turns: ConversationTurn[], blocks: ContentBlock[]): void {
	if (blocks.length > 0) {
		const turn: UserTurn = { role: "user", content: [...blocks] }
		turns.push(turn)
		blocks.length = 0
	}
}

/** 将 assistant blocks flush 为一个 AssistantTurn */
function flushAssistantTurn(turns: ConversationTurn[], blocks: ContentBlock[]): void {
	if (blocks.length > 0) {
		const turn: AssistantTurn = { role: "assistant", content: [...blocks] }
		turns.push(turn)
		blocks.length = 0
	}
}
