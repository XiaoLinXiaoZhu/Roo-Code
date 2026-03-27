/**
 * domain-event 模块
 *
 * 提供 DomainEvent 的核心操作：
 * - 事件 ID 生成
 * - 到 ConversationTurn 的映射（用于 LLM API）
 * - 到 ClineMessage 的映射（用于 WebView UI）
 *
 * @module domain-event
 */

export { generateEventId, resetEventIdCounter } from "./eventId"
export { toConversationTurns } from "./toConversationTurns"
export { toUIMessages } from "./toUIMessages"
