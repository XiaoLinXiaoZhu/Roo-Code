import * as path from "path"
import * as os from "os"
import * as fs from "fs/promises"
import { IntentTree } from "../../intent-tree"
import { updateIntentTool } from "../UpdateIntentTool"

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

function createMockCallbacks() {
	return {
		pushToolResult: vi.fn(),
		handleError: vi.fn(),
		askApproval: vi.fn().mockResolvedValue(true),
	}
}

describe("UpdateIntentTool", () => {
	let tmpDir: string
	let tree: IntentTree

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "update-intent-test-"))
		tree = new IntentTree(path.join(tmpDir, "intent-tree.json"))
		tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	test("updates status only", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		await updateIntentTool.execute({ nodeId: "G1", status: "in_progress" }, task, callbacks)

		const result = callbacks.pushToolResult.mock.calls[0][0]
		expect(result).toContain('status="in_progress"')
		expect(tree.getNode("G1")!.status).toBe("in_progress")
	})

	test("updates content only", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		await updateIntentTool.execute({ nodeId: "G1", content: "Updated goal" }, task, callbacks)

		expect(tree.getNode("G1")!.content).toBe("Updated goal")
	})

	test("errors when nodeId missing", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		await updateIntentTool.execute({ nodeId: "" }, task, callbacks)
		expect(task.consecutiveMistakeCount).toBe(1)
	})

	test("errors when neither status nor content provided", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		await updateIntentTool.execute({ nodeId: "G1" }, task, callbacks)
		expect(task.consecutiveMistakeCount).toBe(1)
	})

	test("filters string 'null' content as if not provided", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		await updateIntentTool.execute({ nodeId: "G1", status: "done", content: "null" }, task, callbacks)

		// content should remain unchanged (not become "null")
		expect(tree.getNode("G1")!.content).toBe("Goal")
		// status should still be updated
		const result = callbacks.pushToolResult.mock.calls[0][0]
		expect(result).toContain('status="done"')
	})

	test("filters string 'null' content without status errors with missing fields", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		// content: "null" with no status => neither is valid => should error
		await updateIntentTool.execute({ nodeId: "G1", content: "null" }, task, callbacks)
		expect(task.consecutiveMistakeCount).toBe(1)
	})

	test("errors when node not found", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		await updateIntentTool.execute({ nodeId: "X99", status: "done" }, task, callbacks)
		expect(task.consecutiveMistakeCount).toBe(1)
		expect(callbacks.pushToolResult.mock.calls[0][0]).toContain("not found")
	})
})
