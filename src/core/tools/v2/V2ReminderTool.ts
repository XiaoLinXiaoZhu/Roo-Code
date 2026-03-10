/**
 * V2ReminderTool — 延迟提醒工具 (v2)
 *
 * 独立实现，不复用 ReminderTool。
 */

import { Task } from "../../task/Task"
import { BaseTool, ToolCallbacks } from "../BaseTool"

interface V2ReminderParams {
	content: string
	delay?: number
}

export class V2ReminderTool extends BaseTool<"reminder"> {
	readonly name = "reminder" as const

	async execute(params: V2ReminderParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks

		const content = params.content
		if (!content) {
			task.consecutiveMistakeCount++
			task.recordToolError("reminder")
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("reminder", "content"))
			return
		}

		task.consecutiveMistakeCount = 0

		const delay = params.delay ?? 7

		// Increment counter and assign id
		task.reminderCounter++
		const id = task.reminderCounter

		// Overwrite any existing reminder (only one active at a time)
		// delay=n means "fire after n rounds", roundsLeft needs delay+1
		task.pendingReminder = { content, roundsLeft: delay + 1, id }

		// Show in UI
		await task.say(
			"tool",
			JSON.stringify({
				tool: "reminder",
				content,
				delay,
				id,
			}),
		)

		pushToolResult(`Reminder set. Will fire in ${delay} rounds.`)
	}
}

export const reminderTool = new V2ReminderTool()
