import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { IntentTree } from "../IntentTree"

describe("IntentTree", () => {
	let tmpDir: string
	let treePath: string

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "intent-tree-test-"))
		treePath = path.join(tmpDir, "intent-tree.json")
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	// ========================================================================
	// 基础操作
	// ========================================================================

	describe("addNode", () => {
		test("adds a root goal with shortId G1", () => {
			const tree = new IntentTree(treePath)
			const node = tree.addNode({ type: "goal", content: "Fix bug", parentId: null, taskId: "t1" })
			expect(node.shortId).toBe("G1")
			expect(node.type).toBe("goal")
			expect(node.content).toBe("Fix bug")
			expect(node.status).toBe("planned")
			expect(node.parentId).toBeNull()
		})

		test("adds multiple root goals with incrementing shortIds", () => {
			const tree = new IntentTree(treePath)
			const g1 = tree.addNode({ type: "goal", content: "Goal 1", parentId: null, taskId: "t1" })
			const g2 = tree.addNode({ type: "goal", content: "Goal 2", parentId: null, taskId: "t1" })
			expect(g1.shortId).toBe("G1")
			expect(g2.shortId).toBe("G2")
		})

		test("adds child nodes with hierarchical shortIds", () => {
			const tree = new IntentTree(treePath)
			const goal = tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			const sub = tree.addNode({ type: "subgoal", content: "Sub", parentId: goal.id, taskId: "t1" })
			const pathNode = tree.addNode({ type: "path", content: "Path", parentId: sub.id, taskId: "t1" })
			const impl = tree.addNode({ type: "impl", content: "Impl", parentId: pathNode.id, taskId: "t1" })

			expect(sub.shortId).toBe("G1.1")
			expect(pathNode.shortId).toBe("G1.1.1")
			expect(impl.shortId).toBe("G1.1.1.1")
		})

		test("adds child using parent shortId", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			const sub = tree.addNode({ type: "subgoal", content: "Sub", parentId: "G1", taskId: "t1" })
			expect(sub.shortId).toBe("G1.1")
			expect(sub.parentId).not.toBeNull()
		})

		test("adds as root when parentId not found", () => {
			const tree = new IntentTree(treePath)
			const node = tree.addNode({ type: "goal", content: "Orphan", parentId: "nonexistent", taskId: "t1" })
			expect(node.parentId).toBeNull()
			expect(tree.getRootNodes()).toHaveLength(1)
		})

		test("sibling numbering increments correctly", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			const c1 = tree.addNode({ type: "subgoal", content: "Sub 1", parentId: "G1", taskId: "t1" })
			const c2 = tree.addNode({ type: "path", content: "Path 1", parentId: "G1", taskId: "t1" })
			const c3 = tree.addNode({ type: "impl", content: "Impl 1", parentId: "G1", taskId: "t1" })
			expect(c1.shortId).toBe("G1.1")
			expect(c2.shortId).toBe("G1.2")
			expect(c3.shortId).toBe("G1.3")
		})
	})

	// ========================================================================
	// resolveId
	// ========================================================================

	describe("resolveId", () => {
		test("resolves by UUID", () => {
			const tree = new IntentTree(treePath)
			const node = tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			expect(tree.getNode(node.id)).toBeDefined()
		})

		test("resolves by shortId", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			const node = tree.getNode("G1")
			expect(node).toBeDefined()
			expect(node!.content).toBe("Goal")
		})

		test("resolves case-insensitively", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			expect(tree.getNode("g1")).toBeDefined()
			expect(tree.getNode("g1")!.content).toBe("Goal")
		})

		test("returns undefined for unknown id", () => {
			const tree = new IntentTree(treePath)
			expect(tree.getNode("X99")).toBeUndefined()
		})
	})

	// ========================================================================
	// updateNode
	// ========================================================================

	describe("updateNode", () => {
		test("updates status only", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			const updated = tree.updateNode("G1", { status: "in_progress" }, "t1")
			expect(updated).not.toBeNull()
			expect(updated!.status).toBe("in_progress")
			expect(updated!.content).toBe("Goal")
		})

		test("updates content only", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Old", parentId: null, taskId: "t1" })
			const updated = tree.updateNode("G1", { content: "New" }, "t1")
			expect(updated!.content).toBe("New")
			expect(updated!.status).toBe("planned")
		})

		test("updates both status and content", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Old", parentId: null, taskId: "t1" })
			const updated = tree.updateNode("G1", { status: "done", content: "New" }, "t1")
			expect(updated!.status).toBe("done")
			expect(updated!.content).toBe("New")
		})

		test("returns null for unknown node", () => {
			const tree = new IntentTree(treePath)
			expect(tree.updateNode("X99", { status: "done" }, "t1")).toBeNull()
		})

		test("records modification history", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.updateNode("G1", { status: "in_progress" }, "t2")
			const node = tree.getNode("G1")!
			expect(node.modifiedBy).toHaveLength(1)
			expect(node.modifiedBy[0].taskId).toBe("t2")
		})
	})

	// ========================================================================
	// pruneSubtree
	// ========================================================================

	describe("pruneSubtree", () => {
		test("prunes node and all descendants", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Sub", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "impl", content: "Impl", parentId: "G1.1", taskId: "t1" })

			const pruned = tree.pruneSubtree("G1.1", "t1", "wrong approach")
			expect(pruned).toEqual(["G1.1", "G1.1.1"])
			expect(tree.getNode("G1.1")!.status).toBe("pruned")
			expect(tree.getNode("G1.1.1")!.status).toBe("pruned")
			expect(tree.getNode("G1")!.status).toBe("planned") // parent unaffected
		})

		test("records reason in modification history", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.pruneSubtree("G1", "t1", "user changed direction")
			const node = tree.getNode("G1")!
			expect(node.modifiedBy[0].action).toBe("pruned: user changed direction")
		})

		test("returns empty array for unknown node", () => {
			const tree = new IntentTree(treePath)
			expect(tree.pruneSubtree("X99", "t1")).toEqual([])
		})

		test("skips already pruned nodes", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.pruneSubtree("G1", "t1")
			const pruned2 = tree.pruneSubtree("G1", "t1")
			expect(pruned2).toEqual([])
		})
	})

	// ========================================================================
	// bindCode
	// ========================================================================

	describe("bindCode", () => {
		test("binds a commit to a node", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			const result = tree.bindCode(
				"G1",
				{
					commitHash: "abc1234",
					commitMessage: "fix bug",
					files: ["src/a.ts"],
					timestamp: new Date().toISOString(),
				},
				"t1",
			)
			expect(result).not.toBeNull()
			expect(result!.codeBindings).toHaveLength(1)
			expect(result!.codeBindings[0].commitHash).toBe("abc1234")
		})

		test("returns null for unknown node", () => {
			const tree = new IntentTree(treePath)
			expect(
				tree.bindCode("X99", { commitHash: "abc", commitMessage: "msg", files: [], timestamp: "" }, "t1"),
			).toBeNull()
		})
	})

	// ========================================================================
	// getCurrentActiveNode
	// ========================================================================

	describe("getCurrentActiveNode", () => {
		test("returns null when no in_progress nodes", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			expect(tree.getCurrentActiveNode()).toBeNull()
		})

		test("returns the in_progress node", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.updateNode("G1", { status: "in_progress" }, "t1")
			const active = tree.getCurrentActiveNode()
			expect(active).not.toBeNull()
			expect(active!.shortId).toBe("G1")
		})

		test("returns most recently modified in_progress node", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "path", content: "Path 1", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "path", content: "Path 2", parentId: "G1", taskId: "t1" })
			tree.updateNode("G1.1", { status: "in_progress" }, "t1")
			tree.updateNode("G1.2", { status: "in_progress" }, "t1")
			const active = tree.getCurrentActiveNode()
			expect(active!.shortId).toBe("G1.2")
		})
	})

	// ========================================================================
	// 持久化
	// ========================================================================

	describe("persistence", () => {
		test("save and load round-trip preserves data", async () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Sub", parentId: "G1", taskId: "t1" })
			await tree.save()

			const loaded = await IntentTree.load(treePath)
			expect(loaded.getNode("G1")).toBeDefined()
			expect(loaded.getNode("G1")!.content).toBe("Goal")
			expect(loaded.getNode("G1.1")).toBeDefined()
			expect(loaded.getNode("G1.1")!.content).toBe("Sub")
		})

		test("load from nonexistent file creates empty tree", async () => {
			const loaded = await IntentTree.load(path.join(tmpDir, "nonexistent.json"))
			expect(loaded.isEmpty()).toBe(true)
		})

		test("save is idempotent when no changes", async () => {
			const tree = new IntentTree(treePath)
			await tree.save() // no dirty flag
			// File should not exist since nothing was added
			await expect(fs.access(treePath)).rejects.toThrow()
		})
	})

	// ========================================================================
	// 摘要生成
	// ========================================================================

	describe("toSummary", () => {
		test("returns empty string for empty tree", () => {
			const tree = new IntentTree(treePath)
			expect(tree.toSummary()).toBe("")
		})

		test("includes shortId in brackets", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Fix bug", parentId: null, taskId: "t1" })
			const summary = tree.toSummary()
			expect(summary).toContain("[G1]")
			expect(summary).toContain("Fix bug")
		})

		test("shows CURRENT marker for in_progress node", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.updateNode("G1", { status: "in_progress" }, "t1")
			expect(tree.toSummary()).toContain("← CURRENT")
		})

		test("shows commit count", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.bindCode("G1", { commitHash: "abc", commitMessage: "msg", files: [], timestamp: "" }, "t1")
			expect(tree.toSummary()).toContain("[1 commit(s)]")
		})

		test("shows tree hierarchy with indentation", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Sub", parentId: "G1", taskId: "t1" })
			const lines = tree.toSummary().split("\n")
			expect(lines[0]).toMatch(/^\[G1\]/)
			expect(lines[1]).toMatch(/^  \[G1\.1\]/)
		})
	})

	// ========================================================================
	// 查询
	// ========================================================================

	describe("queries", () => {
		test("getActiveNodes excludes pruned and superseded", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "G1", parentId: null, taskId: "t1" })
			tree.addNode({ type: "path", content: "P1", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "path", content: "P2", parentId: "G1", taskId: "t1" })
			tree.pruneSubtree("G1.1", "t1")
			tree.updateNode("G1.2", { status: "superseded" }, "t1")
			const active = tree.getActiveNodes()
			expect(active).toHaveLength(1) // only G1
			expect(active[0].shortId).toBe("G1")
		})

		test("getSubtreeCommits collects from descendants", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "impl", content: "Impl", parentId: "G1", taskId: "t1" })
			tree.bindCode("G1", { commitHash: "aaa", commitMessage: "m1", files: [], timestamp: "" }, "t1")
			tree.bindCode("G1.1", { commitHash: "bbb", commitMessage: "m2", files: [], timestamp: "" }, "t1")
			const commits = tree.getSubtreeCommits("G1")
			expect(commits).toHaveLength(2)
			expect(commits.map((c) => c.commitHash)).toEqual(["aaa", "bbb"])
		})

		test("getChildren returns child nodes", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "S1", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "S2", parentId: "G1", taskId: "t1" })
			const children = tree.getChildren("G1")
			expect(children).toHaveLength(2)
		})
	})
})
