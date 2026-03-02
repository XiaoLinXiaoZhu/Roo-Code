import { Task } from "../task/Task"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface ReminderParams {
	content: string
	delay?: number | null
}

export class ReminderTool extends BaseTool<"reminder"> {
	readonly name = "reminder" as const

	async execute(params: ReminderParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
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

		// Overwrite any existing reminder (only one active at a time)
		task.pendingReminder = { content, roundsLeft: delay }

		// Show in UI
		await task.say(
			"tool",
			JSON.stringify({
				tool: "reminder",
				content,
				delay,
			}),
		)

		pushToolResult(`Reminder set. Will fire in ${delay} rounds.`)
	}
}

export const reminderTool = new ReminderTool()
