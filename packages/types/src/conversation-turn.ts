/**
 * ConversationTurn — Provider 无关的对话轮次中间表示
 *
 * 这是从 DomainEvent[] 到具体 Provider 格式的中间层。
 * DomainEvent[] → toConversationTurns() → ConversationTurn[] → toAnthropicMessages() / toOpenAIMessages()
 *
 * 设计目的：
 * 1. 将扁平的事件流重组为 user/assistant 交替的对话结构
 * 2. 处理 condense/truncation 的事件过滤
 * 3. 提供 Provider 无关的对话抽象
 *
 * @module conversation-turn
 */

// ═══════════════════════════════════════════
// 内容块（Content Block）
// ═══════════════════════════════════════════

/** 纯文本内容块 */
export interface TextContentBlock {
	type: "text"
	text: string
}

/** 图片内容块 */
export interface ImageContentBlock {
	type: "image"
	/** base64 数据 URL 或文件路径 */
	source: string
	mediaType: string
}

/** 工具调用内容块 */
export interface ToolCallContentBlock {
	type: "tool_call"
	/** LLM 生成的 tool_use_id */
	toolCallId: string
	/** 工具名称 */
	toolName: string
	/** 工具参数（JSON 字符串或结构化对象） */
	args: Record<string, unknown>
}

/** 工具结果内容块 */
export interface ToolResultContentBlock {
	type: "tool_result"
	/** 关联的 tool_use_id */
	toolCallId: string
	/** 结果内容（文本或混合内容） */
	content: string | Array<TextContentBlock | ImageContentBlock>
	/** 是否执行出错 */
	isError?: boolean
}

/** 推理/思考内容块 */
export interface ReasoningContentBlock {
	type: "reasoning"
	text: string
	/** Provider 特有的签名/加密数据，用于 round-trip */
	providerMeta?: Record<string, unknown>
}

/** 所有内容块的联合类型 */
export type ContentBlock =
	| TextContentBlock
	| ImageContentBlock
	| ToolCallContentBlock
	| ToolResultContentBlock
	| ReasoningContentBlock

// ═══════════════════════════════════════════
// 对话轮次（Conversation Turn）
// ═══════════════════════════════════════════

/** 系统消息轮次 */
export interface SystemTurn {
	role: "system"
	content: string
}

/** 用户消息轮次 */
export interface UserTurn {
	role: "user"
	content: ContentBlock[]
}

/** 助手消息轮次 */
export interface AssistantTurn {
	role: "assistant"
	content: ContentBlock[]
}

/** 对话轮次联合类型 */
export type ConversationTurn = SystemTurn | UserTurn | AssistantTurn
