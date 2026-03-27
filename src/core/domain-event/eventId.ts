/**
 * 事件 ID 生成器
 *
 * 生成单调递增的唯一事件 ID，格式为 "evt_{timestamp}_{counter}"。
 * 在单个 Task 生命周期内保证唯一性和顺序性。
 *
 * @module eventId
 */

let counter = 0

/**
 * 生成唯一的事件 ID
 *
 * @returns 格式为 "evt_{timestamp}_{counter}" 的唯一 ID
 */
export function generateEventId(): string {
	const ts = Date.now()
	const id = `evt_${ts}_${counter++}`
	return id
}

/**
 * 重置计数器（仅用于测试）
 */
export function resetEventIdCounter(): void {
	counter = 0
}
