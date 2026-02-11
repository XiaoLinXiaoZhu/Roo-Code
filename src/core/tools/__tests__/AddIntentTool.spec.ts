import * as path from "path"
import * as os from "os"
import * as fs from "fs/promises"
import { IntentTree } from "../../intent-tree"
import { addIntentTool } from "../AddIntentTool"

// Mock Task
function createMockTask(intentTree: IntentTree | null) {
	return {
		taskId: "test-task",
		cwd: "/tmp/test",
		intentTree,
		consecutiveMistakeCount: 0,
		didToolFailInCurrentTurn: false,
		recordToolError: vi.fn(),
	} as any
}

// Mock callbacks
function createMockCallbacks() {
	return {
		pushToolResult: vi.fn(),
		handleError: vi.fn(),
		askApproval: vi.fn().mockResolvedValue(true),
	}
}

describe("AddIntentTool", () => {
	let tmpDir: string
	let tree: IntentTree

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "add-intent-test-"))
		tree = new IntentTree(path.join(tmpDir, "intent-tree.json"))
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	test("adds a root goal node", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		await addIntentTool.execute({ type: "goal", content: "Fix the bug" }, task, callbacks)

		expect(callbacks.pushToolResult).toHaveBeenCalledTimes(1)
		const result = callbacks.pushToolResult.mock.calls[0][0]
		expect(result).toContain('nodeId="G1"')
		expect(result).toContain("Fix the bug")
	})

	test("adds a child node with parentId", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
		await addIntentTool.execute({ type: "path", content: "Approach A", parentId: "G1" }, task, callbacks)

		const result = callbacks.pushToolResult.mock.calls[0][0]
		expect(result).toContain('nodeId="P1.1"')
	})

	test("errors when intent tree not initialized", async () => {
		const task = createMockTask(null)
		const callbacks = createMockCallbacks()

		await addIntentTool.execute({ type: "goal", content: "Goal" }, task, callbacks)

		expect(task.consecutiveMistakeCount).toBe(1)
		expect(callbacks.pushToolResult.mock.calls[0][0]).toContain("not initialized")
	})

	test("errors when type or content missing", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		await addIntentTool.execute({ type: undefined as any, content: "Goal" }, task, callbacks)
		expect(task.consecutiveMistakeCount).toBe(1)
	})

	test("respects user declining approval", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()
		callbacks.askApproval.mockResolvedValue(false)

		await addIntentTool.execute({ type: "goal", content: "Goal" }, task, callbacks)

		expect(callbacks.pushToolResult).toHaveBeenCalledWith("User declined.")
		expect(tree.isEmpty()).toBe(true)
	})
})
