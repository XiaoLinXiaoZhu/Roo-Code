import * as path from "path"
import * as os from "os"
import * as fs from "fs/promises"
import { IntentTree } from "../../intent-tree"
import { pruneIntentTool } from "../PruneIntentTool"

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

describe("PruneIntentTool", () => {
	let tmpDir: string
	let tree: IntentTree

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "prune-intent-test-"))
		tree = new IntentTree(path.join(tmpDir, "intent-tree.json"))
		tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
		tree.addNode({ type: "path", content: "Path A", parentId: "G1", taskId: "t1" })
		tree.addNode({ type: "impl", content: "Impl 1", parentId: "P1.1", taskId: "t1" })
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	test("prunes node and descendants", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		await pruneIntentTool.execute({ nodeId: "P1.1", reason: "wrong approach" }, task, callbacks)

		const result = callbacks.pushToolResult.mock.calls[0][0]
		expect(result).toContain('count="2"')
		expect(result).toContain("P1.1")
		expect(result).toContain("I1.1.1")
		expect(result).toContain("wrong approach")
		expect(tree.getNode("P1.1")!.status).toBe("pruned")
		expect(tree.getNode("I1.1.1")!.status).toBe("pruned")
	})

	test("shows associated commits", async () => {
		tree.bindCode(
			"P1.1",
			{
				commitHash: "abc1234",
				commitMessage: "impl path A",
				files: ["a.ts"],
				timestamp: new Date().toISOString(),
			},
			"t1",
		)

		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		await pruneIntentTool.execute({ nodeId: "P1.1" }, task, callbacks)

		const result = callbacks.pushToolResult.mock.calls[0][0]
		expect(result).toContain("abc1234")
		expect(result).toContain("<commits")
	})

	test("errors when node not found", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		await pruneIntentTool.execute({ nodeId: "X99" }, task, callbacks)
		expect(task.consecutiveMistakeCount).toBe(1)
		expect(callbacks.pushToolResult.mock.calls[0][0]).toContain("not found")
	})

	test("errors when nodeId missing", async () => {
		const task = createMockTask(tree)
		const callbacks = createMockCallbacks()

		await pruneIntentTool.execute({ nodeId: "" }, task, callbacks)
		expect(task.consecutiveMistakeCount).toBe(1)
	})
})
