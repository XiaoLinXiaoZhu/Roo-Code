import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { IntentTree } from "../IntentTree"

describe("IntentTree - Status Cascade", () => {
	let tmpDir: string
	let treePath: string

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "intent-cascade-test-"))
		treePath = path.join(tmpDir, "intent-tree.json")
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	// ========================================================================
	// 规则1：添加子节点 → 父链 done 回退为 planned
	// ========================================================================

	describe("rule 1: addNode resets done parents to planned", () => {
		test("adding child to done parent resets it to planned", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.updateNode("G1", { status: "done" }, "t1")

			const result = tree.addNode({ type: "objective", content: "New sub", parentId: "G1", taskId: "t1" })
			expect(result.cascadeUpdates).toHaveLength(1)
			expect(result.cascadeUpdates[0].shortId).toBe("G1")
			expect(result.cascadeUpdates[0].oldStatus).toBe("done")
			expect(result.cascadeUpdates[0].newStatus).toBe("planned")
			expect(tree.getNode("G1")!.status).toBe("planned")
		})

		test("resets entire ancestor chain of done nodes", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj", parentId: "G1", taskId: "t1" })
			tree.updateNode("O1.1", { status: "done" }, "t1")
			tree.updateNode("G1", { status: "done" }, "t1")

			const result = tree.addNode({ type: "approach", content: "New", parentId: "O1.1", taskId: "t1" })
			expect(result.cascadeUpdates).toHaveLength(2)
			expect(tree.getNode("O1.1")!.status).toBe("planned")
			expect(tree.getNode("G1")!.status).toBe("planned")
		})

		test("does not affect in_progress or planned parents", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.updateNode("G1", { status: "in_progress" }, "t1")

			const result = tree.addNode({ type: "objective", content: "Sub", parentId: "G1", taskId: "t1" })
			expect(result.cascadeUpdates).toHaveLength(0)
			expect(tree.getNode("G1")!.status).toBe("in_progress")
		})

		test("skips pruned/superseded parents but continues upward", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj", parentId: "G1", taskId: "t1" })
			tree.updateNode("G1", { status: "done" }, "t1")
			tree.updateNode("O1.1", { status: "superseded" }, "t1")

			const result = tree.addNode({ type: "approach", content: "A", parentId: "O1.1", taskId: "t1" })
			expect(tree.getNode("O1.1")!.status).toBe("superseded")
			expect(tree.getNode("G1")!.status).toBe("planned")
			expect(result.cascadeUpdates).toHaveLength(1)
		})

		test("returns empty cascadeUpdates for root node", () => {
			const tree = new IntentTree(treePath)
			const result = tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			expect(result.cascadeUpdates).toHaveLength(0)
		})
	})

	// ========================================================================
	// 规则2：标记完成 → 递归向上冒泡
	// ========================================================================

	describe("rule 2: done bubbles up when all children terminated", () => {
		test("parent becomes done when all children are done", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj1", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj2", parentId: "G1", taskId: "t1" })

			tree.updateNode("O1.1", { status: "done" }, "t1")
			expect(tree.getNode("G1")!.status).not.toBe("done")

			const result = tree.updateNode("O1.2", { status: "done" }, "t1")
			expect(result!.cascadeUpdates).toHaveLength(1)
			expect(result!.cascadeUpdates[0].shortId).toBe("G1")
			expect(result!.cascadeUpdates[0].newStatus).toBe("done")
			expect(tree.getNode("G1")!.status).toBe("done")
		})

		test("bubbles up multiple levels", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "approach", content: "Approach", parentId: "O1.1", taskId: "t1" })

			const result = tree.updateNode("A1.1.1", { status: "done" }, "t1")
			expect(result!.cascadeUpdates).toHaveLength(2)
			expect(tree.getNode("O1.1")!.status).toBe("done")
			expect(tree.getNode("G1")!.status).toBe("done")
		})

		test("pruned children count as terminated", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj1", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj2", parentId: "G1", taskId: "t1" })

			tree.pruneSubtree("O1.1", "t1")
			const result = tree.updateNode("O1.2", { status: "done" }, "t1")
			expect(tree.getNode("G1")!.status).toBe("done")
			expect(result!.cascadeUpdates).toHaveLength(1)
		})

		test("superseded children count as terminated", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "approach", content: "A1", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "approach", content: "A2", parentId: "G1", taskId: "t1" })

			tree.updateNode("A1.1", { status: "superseded" }, "t1")
			const result = tree.updateNode("A1.2", { status: "done" }, "t1")
			expect(tree.getNode("G1")!.status).toBe("done")
			expect(result!.cascadeUpdates).toHaveLength(1)
		})

		test("does not bubble if parent is pruned", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj", parentId: "G1", taskId: "t1" })
			tree.pruneSubtree("G1", "t1")

			tree.updateNode("O1.1", { status: "planned" }, "t1")
			const result = tree.updateNode("O1.1", { status: "done" }, "t1")
			expect(tree.getNode("G1")!.status).toBe("pruned")
			expect(result!.cascadeUpdates).toHaveLength(0)
		})

		test("stops bubbling if some children still in_progress", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj1", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj2", parentId: "G1", taskId: "t1" })

			tree.updateNode("O1.2", { status: "in_progress" }, "t1")
			const result = tree.updateNode("O1.1", { status: "done" }, "t1")
			expect(tree.getNode("G1")!.status).not.toBe("done")
			expect(result!.cascadeUpdates).toHaveLength(0)
		})
	})

	// ========================================================================
	// 规则3：标记进行中 → 递归向上传播
	// ========================================================================

	describe("rule 3: in_progress propagates upward", () => {
		test("planned parent becomes in_progress", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj", parentId: "G1", taskId: "t1" })

			const result = tree.updateNode("O1.1", { status: "in_progress" }, "t1")
			expect(result!.cascadeUpdates).toHaveLength(1)
			expect(result!.cascadeUpdates[0].shortId).toBe("G1")
			expect(result!.cascadeUpdates[0].oldStatus).toBe("planned")
			expect(result!.cascadeUpdates[0].newStatus).toBe("in_progress")
			expect(tree.getNode("G1")!.status).toBe("in_progress")
		})

		test("done parent becomes in_progress (reopen)", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj", parentId: "G1", taskId: "t1" })
			tree.updateNode("G1", { status: "done" }, "t1")

			const result = tree.updateNode("O1.1", { status: "in_progress" }, "t1")
			expect(result!.cascadeUpdates).toHaveLength(1)
			expect(result!.cascadeUpdates[0].oldStatus).toBe("done")
			expect(result!.cascadeUpdates[0].newStatus).toBe("in_progress")
			expect(tree.getNode("G1")!.status).toBe("in_progress")
		})

		test("propagates through multiple levels", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "approach", content: "App", parentId: "O1.1", taskId: "t1" })

			const result = tree.updateNode("A1.1.1", { status: "in_progress" }, "t1")
			expect(result!.cascadeUpdates).toHaveLength(2)
			expect(tree.getNode("O1.1")!.status).toBe("in_progress")
			expect(tree.getNode("G1")!.status).toBe("in_progress")
		})

		test("skips already in_progress parents", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "approach", content: "App", parentId: "O1.1", taskId: "t1" })
			tree.updateNode("O1.1", { status: "in_progress" }, "t1")

			const result = tree.updateNode("A1.1.1", { status: "in_progress" }, "t1")
			expect(result!.cascadeUpdates).toHaveLength(0)
		})

		test("does not propagate to pruned parents", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj", parentId: "G1", taskId: "t1" })
			tree.pruneSubtree("G1", "t1")

			tree.updateNode("O1.1", { status: "planned" }, "t1")
			const result = tree.updateNode("O1.1", { status: "in_progress" }, "t1")
			expect(tree.getNode("G1")!.status).toBe("pruned")
			expect(result!.cascadeUpdates).toHaveLength(0)
		})
	})

	// ========================================================================
	// 规则4：标记完成时警告未完成子项
	// ========================================================================

	describe("rule 4: warning on done with incomplete children", () => {
		test("warns when marking node done with planned children", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj1", parentId: "G1", taskId: "t1" })

			const result = tree.updateNode("G1", { status: "done" }, "t1")
			expect(result!.warnings).toHaveLength(1)
			expect(result!.warnings[0]).toContain("O1.1")
			expect(result!.warnings[0]).toContain("planned")
			expect(result!.node.status).toBe("done")
		})

		test("warns when marking node done with in_progress children", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj1", parentId: "G1", taskId: "t1" })
			tree.updateNode("O1.1", { status: "in_progress" }, "t1")

			const result = tree.updateNode("G1", { status: "done" }, "t1")
			expect(result!.warnings).toHaveLength(1)
			expect(result!.warnings[0]).toContain("O1.1")
			expect(result!.warnings[0]).toContain("in_progress")
		})

		test("no warning when all children are terminated", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj1", parentId: "G1", taskId: "t1" })
			tree.updateNode("O1.1", { status: "done" }, "t1")

			const result = tree.updateNode("G1", { status: "done" }, "t1")
			expect(result!.warnings).toHaveLength(0)
		})

		test("no warning for leaf nodes", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })

			const result = tree.updateNode("G1", { status: "done" }, "t1")
			expect(result!.warnings).toHaveLength(0)
		})

		test("lists multiple incomplete children", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj1", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj2", parentId: "G1", taskId: "t1" })

			const result = tree.updateNode("G1", { status: "done" }, "t1")
			expect(result!.warnings).toHaveLength(1)
			expect(result!.warnings[0]).toContain("O1.1")
			expect(result!.warnings[0]).toContain("O1.2")
			expect(result!.warnings[0]).toContain("2")
		})
	})

	// ========================================================================
	// 组合场景
	// ========================================================================

	describe("combined cascade scenarios", () => {
		test("done bubble then add child reopens parent chain", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj", parentId: "G1", taskId: "t1" })

			// Complete everything
			tree.updateNode("O1.1", { status: "done" }, "t1")
			expect(tree.getNode("G1")!.status).toBe("done")

			// Add new child — should reopen
			const result = tree.addNode({ type: "objective", content: "Obj2", parentId: "G1", taskId: "t1" })
			expect(tree.getNode("G1")!.status).toBe("planned")
			expect(result.cascadeUpdates).toHaveLength(1)
		})

		test("in_progress reopens done parent, then done re-completes", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj1", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj2", parentId: "G1", taskId: "t1" })

			// Complete all
			tree.updateNode("O1.1", { status: "done" }, "t1")
			tree.updateNode("O1.2", { status: "done" }, "t1")
			expect(tree.getNode("G1")!.status).toBe("done")

			// Reopen O1.1
			tree.updateNode("O1.1", { status: "in_progress" }, "t1")
			expect(tree.getNode("G1")!.status).toBe("in_progress")

			// Complete O1.1 again
			const result = tree.updateNode("O1.1", { status: "done" }, "t1")
			expect(tree.getNode("G1")!.status).toBe("done")
			expect(result!.cascadeUpdates).toHaveLength(1)
		})

		test("no cascade on content-only update", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "objective", content: "Obj", parentId: "G1", taskId: "t1" })

			const result = tree.updateNode("O1.1", { content: "Updated" }, "t1")
			expect(result!.cascadeUpdates).toHaveLength(0)
			expect(result!.warnings).toHaveLength(0)
		})
	})
})
