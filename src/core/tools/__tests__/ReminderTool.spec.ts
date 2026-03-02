import { reminderTool, restoreReminderForTask } from "../ReminderTool"
import { Task } from "../../task/Task"

describe("ReminderTool", () => {
	let mockTask: Partial<Task>
	let pushToolResult: ReturnType<typeof vi.fn>
	let callbacks: any

	beforeEach(() => {
		mockTask = {
			consecutiveMistakeCount: 0,
			reminderCounter: 0,
			pendingReminder: null,
			say: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing param"),
			recordToolError: vi.fn(),
			didToolFailInCurrentTurn: false,
		}
		pushToolResult = vi.fn()
		callbacks = {
			pushToolResult,
			askApproval: vi.fn(),
			handleError: vi.fn(),
		} as any
	})

	it("should assign incrementing id to each reminder", async () => {
		await reminderTool.execute({ content: "first", delay: 3 }, mockTask as Task, callbacks)
		expect(mockTask.reminderCounter).toBe(1)
		expect(mockTask.pendingReminder).toEqual({ content: "first", roundsLeft: 3, id: 1 })
		expect(pushToolResult).toHaveBeenCalledWith("Reminder #1 set. Will fire in 3 rounds.")
	})
	it("should increment id across multiple reminders", async () => {
		await reminderTool.execute({ content: "first", delay: 3 }, mockTask as Task, callbacks)
		await reminderTool.execute({ content: "second", delay: 5 }, mockTask as Task, callbacks)
		expect(mockTask.reminderCounter).toBe(2)
		expect(mockTask.pendingReminder).toEqual({ content: "second", roundsLeft: 5, id: 2 })
		expect(pushToolResult).toHaveBeenLastCalledWith("Reminder #2 set. Will fire in 5 rounds.")
	})

	it("should error when content is missing", async () => {
		await reminderTool.execute({ content: "" }, mockTask as Task, callbacks)
		expect(mockTask.consecutiveMistakeCount).toBe(1)
		expect(mockTask.didToolFailInCurrentTurn).toBe(true)
		expect(mockTask.reminderCounter).toBe(0)
	})

	it("should default delay to 7 when not provided", async () => {
		await reminderTool.execute({ content: "test" }, mockTask as Task, callbacks)
		expect(mockTask.pendingReminder).toEqual({ content: "test", roundsLeft: 7, id: 1 })
		expect(pushToolResult).toHaveBeenCalledWith("Reminder #1 set. Will fire in 7 rounds.")
	})
})

describe("restoreReminderForTask", () => {
	function makeMsg(say: string, text: string): any {
		return { type: "say", say, text, ts: Date.now() }
	}

	it("should restore counter and pendingReminder from messages", () => {
		const task: any = {
			reminderCounter: 0,
			pendingReminder: null,
			clineMessages: [
				makeMsg("tool", JSON.stringify({ tool: "reminder", content: "plan A", delay: 5, id: 1 })),
				makeMsg("api_req_started", "{}"),
				makeMsg("api_req_started", "{}"),
			],
		}
		restoreReminderForTask(task)
		expect(task.reminderCounter).toBe(1)
		expect(task.pendingReminder).toEqual({ content: "plan A", roundsLeft: 3, id: 1 })
	})

	it("should restore latest reminder when multiple exist", () => {
		const task: any = {
			reminderCounter: 0,
			pendingReminder: null,
			clineMessages: [
				makeMsg("tool", JSON.stringify({ tool: "reminder", content: "plan A", delay: 5, id: 1 })),
				makeMsg("api_req_started", "{}"),
				makeMsg("api_req_started", "{}"),
				makeMsg("tool", JSON.stringify({ tool: "reminder", content: "plan B", delay: 4, id: 2 })),
				makeMsg("api_req_started", "{}"),
			],
		}
		restoreReminderForTask(task)
		expect(task.reminderCounter).toBe(2)
		expect(task.pendingReminder).toEqual({ content: "plan B", roundsLeft: 3, id: 2 })
	})

	it("should set roundsLeft to 1 when reminder should have already fired", () => {
		const task: any = {
			reminderCounter: 0,
			pendingReminder: null,
			clineMessages: [
				makeMsg("tool", JSON.stringify({ tool: "reminder", content: "plan", delay: 2, id: 1 })),
				makeMsg("api_req_started", "{}"),
				makeMsg("api_req_started", "{}"),
				makeMsg("api_req_started", "{}"),
			],
		}
		restoreReminderForTask(task)
		expect(task.pendingReminder).toEqual({ content: "plan", roundsLeft: 1, id: 1 })
	})

	it("should do nothing when no reminder messages exist", () => {
		const task: any = {
			reminderCounter: 0,
			pendingReminder: null,
			clineMessages: [makeMsg("api_req_started", "{}")],
		}
		restoreReminderForTask(task)
		expect(task.reminderCounter).toBe(0)
		expect(task.pendingReminder).toBeNull()
	})
})
