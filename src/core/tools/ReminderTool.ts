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

		// Increment counter and assign id
		task.reminderCounter++
		const id = task.reminderCounter

		// Overwrite any existing reminder (only one active at a time)
		// delay=n means "fire after n rounds", i.e. on round n+1.
		// roundsLeft is decremented at the start of each round, so we need delay+1.
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

export const reminderTool = new ReminderTool()

/**
 * Restore pendingReminder and reminderCounter from persisted clineMessages.
 * Called on task resume (similar to restoreTodoListForTask).
 */
export function restoreReminderForTask(task: Task): void {
	const messages = task.clineMessages
	if (!messages?.length) return

	// Find all reminder tool messages to restore counter
	const reminderMessages: { index: number; content: string; delay: number; id: number }[] = []
	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i]
		if (msg.type === "say" && msg.say === "tool") {
			try {
				const parsed = JSON.parse(msg.text ?? "{}")
				if (parsed.tool === "reminder" && parsed.content) {
					reminderMessages.push({
						index: i,
						content: parsed.content,
						delay: parsed.delay ?? 7,
						id: parsed.id ?? reminderMessages.length + 1,
					})
				}
			} catch {
				// skip malformed
			}
		}
	}

	if (reminderMessages.length === 0) return

	// Restore counter to highest id seen
	task.reminderCounter = Math.max(...reminderMessages.map((r) => r.id))

	// Restore the last reminder with adjusted roundsLeft
	const last = reminderMessages[reminderMessages.length - 1]

	// Count api rounds (api_req_started messages) after the last reminder
	let roundsSince = 0
	for (let i = last.index + 1; i < messages.length; i++) {
		if (messages[i].type === "say" && messages[i].say === "api_req_started") {
			roundsSince++
		}
	}

	// delay=n means roundsLeft was set to n+1 at creation time
	const roundsLeft = last.delay + 1 - roundsSince
	if (roundsLeft > 0) {
		task.pendingReminder = { content: last.content, roundsLeft, id: last.id }
	}
	// If roundsLeft <= 0, the reminder already fired (or will fire on next getEnvironmentDetails)
	// In that case, set roundsLeft to 1 so it fires immediately on resume
	else {
		task.pendingReminder = { content: last.content, roundsLeft: 1, id: last.id }
	}
}
