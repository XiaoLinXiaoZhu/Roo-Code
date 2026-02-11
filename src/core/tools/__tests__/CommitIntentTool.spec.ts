import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { IntentTree } from "../../intent-tree"
import { CommitIntentTool } from "../CommitIntentTool"

// Mock simple-git
const mockAdd = vi.fn().mockResolvedValue(undefined)
const mockStatus = vi.fn().mockResolvedValue({ staged: ["a.ts"], files: [{ path: "a.ts" }] })
const mockCommit = vi.fn().mockResolvedValue({ commit: "abc1234def" })
const mockDiffSummary = vi.fn().mockResolvedValue({
	files: [{ file: "a.ts" }],
	insertions: 10,
	deletions: 2,
})

vi.mock("simple-git", () => ({
	default: () => ({
		add: mockAdd,
		status: mockStatus,
		commit: mockCommit,
		diffSummary: mockDiffSummary,
	}),
}))

function createMockTask(intentTree: IntentTree) {
	return {
		taskId: "test-task-1",
		cwd: "/tmp/test-workspace",
		intentTree,
		consecutiveMistakeCount: 0,
		didToolFailInCurrentTurn: false,
		recordToolError: vi.fn(),
	} as any
}

function createCallbacks() {
	const results: unknown[] = []
	return {
		askApproval: vi.fn().mockResolvedValue(true),
		handleError: vi.fn(),
		pushToolResult: vi.fn((r: unknown) => results.push(r)),
		results,
	}
}

describe("CommitIntentTool", () => {
	let tmpDir: string
	let tree: IntentTree
	const tool = new CommitIntentTool()

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "commit-intent-test-"))
		tree = await IntentTree.load(path.join(tmpDir, "intent-tree.json"))
		vi.clearAllMocks()
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	test("name is commit_intent", () => {
		expect(tool.name).toBe("commit_intent")
	})

	test("commits and binds to intent node", async () => {
		const result = tree.addNode({ type: "impl", content: "实现A1", parentId: null, taskId: "t" })
		const task = createMockTask(tree)
		const cb = createCallbacks()

		await tool.execute({ nodeId: result.node.id, message: "实现A1模块" }, task, cb)

		// Verify git operations
		expect(mockAdd).toHaveBeenCalledWith([".", "--ignore-errors"])
		expect(mockCommit).toHaveBeenCalledWith(expect.stringContaining("[intent:"))
		expect(mockCommit).toHaveBeenCalledWith(expect.stringContaining("实现A1模块"))

		// Verify intent tree binding
		const updated = tree.getNode(result.node.id)!
		expect(updated.status).toBe("done")
		expect(updated.codeBindings).toHaveLength(1)
		expect(updated.codeBindings[0].commitHash).toBe("abc1234def")

		// Verify result
		expect(cb.results[0]).toContain('status="committed"')
		expect(cb.results[0]).toContain("abc1234def")
	})

	test("errors when node not found", async () => {
		const task = createMockTask(tree)
		const cb = createCallbacks()

		await tool.execute({ nodeId: "nonexistent", message: "test" }, task, cb)

		expect(cb.results[0]).toContain("not found")
		expect(task.consecutiveMistakeCount).toBe(1)
	})

	test("handles no changes gracefully", async () => {
		mockStatus.mockResolvedValueOnce({ staged: [], files: [] })
		const result = tree.addNode({ type: "impl", content: "A1", parentId: null, taskId: "t" })
		const task = createMockTask(tree)
		const cb = createCallbacks()

		await tool.execute({ nodeId: result.node.id, message: "test" }, task, cb)

		expect(cb.results[0]).toContain('status="no_changes"')
		expect(mockCommit).not.toHaveBeenCalled()
	})

	test("respects user rejection", async () => {
		const result = tree.addNode({ type: "impl", content: "A1", parentId: null, taskId: "t" })
		const task = createMockTask(tree)
		const cb = createCallbacks()
		cb.askApproval.mockResolvedValue(false)

		await tool.execute({ nodeId: result.node.id, message: "test" }, task, cb)

		expect(cb.results[0]).toContain("declined")
		expect(mockAdd).not.toHaveBeenCalled()
	})

	test("errors when intentTree is not initialized", async () => {
		const task = { ...createMockTask(tree), intentTree: undefined }
		const cb = createCallbacks()

		await tool.execute({ nodeId: "x", message: "test" }, task, cb)

		expect(cb.results[0]).toContain("not initialized")
	})

	test("auto-creates impl child when target node is not impl", async () => {
		// Create a goal node (not impl)
		const goalResult = tree.addNode({ type: "goal", content: "实现功能X", parentId: null, taskId: "t" })
		const task = createMockTask(tree)
		const cb = createCallbacks()

		await tool.execute({ nodeId: goalResult.node.id, message: "完成功能X的实现" }, task, cb)

		// Verify an impl child was auto-created and bound to the commit
		const children = tree.getChildren(goalResult.node.id)
		expect(children).toHaveLength(1)
		expect(children[0].type).toBe("impl")
		expect(children[0].content).toBe("完成功能X的实现")
		// CommitIntentTool auto-creates impl child AND binds the commit to it
		expect(children[0].status).toBe("done")
		expect(children[0].codeBindings).toHaveLength(1)
		expect(children[0].codeBindings[0].commitHash).toBe("abc1234def")

		// Verify the goal node itself was NOT modified
		const updatedGoal = tree.getNode(goalResult.node.id)!
		expect(updatedGoal.status).toBe("planned")
		expect(updatedGoal.codeBindings).toHaveLength(0)

		// Verify result mentions auto-created
		expect(cb.results[0]).toContain("auto-created")
		expect(cb.results[0]).toContain(goalResult.node.shortId)
	})

	test("binds directly to impl node without creating child", async () => {
		// Create an impl node directly
		const implResult = tree.addNode({ type: "impl", content: "实现细节", parentId: null, taskId: "t" })
		const task = createMockTask(tree)
		const cb = createCallbacks()

		await tool.execute({ nodeId: implResult.node.id, message: "完成实现" }, task, cb)

		// Verify no child was created
		const children = tree.getChildren(implResult.node.id)
		expect(children).toHaveLength(0)

		// Verify the impl node was directly updated
		const updated = tree.getNode(implResult.node.id)!
		expect(updated.status).toBe("done")
		expect(updated.codeBindings).toHaveLength(1)

		// Verify result does NOT mention auto-created
		expect(cb.results[0]).not.toContain("auto-created")
	})

	test("rejects empty message", async () => {
		const result = tree.addNode({ type: "impl", content: "A1", parentId: null, taskId: "t" })
		const task = createMockTask(tree)
		const cb = createCallbacks()

		await tool.execute({ nodeId: result.node.id, message: "" }, task, cb)

		expect(cb.results[0]).toContain("required")
		expect(cb.results[0]).toContain("cannot be empty")
		expect(task.consecutiveMistakeCount).toBe(1)
	})

	test("rejects whitespace-only message", async () => {
		const result = tree.addNode({ type: "impl", content: "A1", parentId: null, taskId: "t" })
		const task = createMockTask(tree)
		const cb = createCallbacks()

		await tool.execute({ nodeId: result.node.id, message: "   " }, task, cb)

		expect(cb.results[0]).toContain("required")
		expect(task.consecutiveMistakeCount).toBe(1)
	})
})
