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
			const result = tree.addNode({ type: "goal", content: "Fix bug", parentId: null, taskId: "t1" })
			expect(result.node.shortId).toBe("G1")
			expect(result.node.type).toBe("goal")
			expect(result.node.content).toBe("Fix bug")
			expect(result.node.status).toBe("planned")
			expect(result.node.parentId).toBeNull()
			expect(result.typeAdjusted).toBe(false)
		})

		test("adds multiple root goals with incrementing shortIds", () => {
			const tree = new IntentTree(treePath)
			const g1 = tree.addNode({ type: "goal", content: "Goal 1", parentId: null, taskId: "t1" })
			const g2 = tree.addNode({ type: "goal", content: "Goal 2", parentId: null, taskId: "t1" })
			expect(g1.node.shortId).toBe("G1")
			expect(g2.node.shortId).toBe("G2")
			expect(g1.typeAdjusted).toBe(false)
			expect(g2.typeAdjusted).toBe(false)
		})

		test("adds child nodes with hierarchical shortIds", () => {
			const tree = new IntentTree(treePath)
			const goal = tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			const sub = tree.addNode({ type: "subgoal", content: "Sub", parentId: goal.node.id, taskId: "t1" })
			const pathNode = tree.addNode({ type: "path", content: "Path", parentId: sub.node.id, taskId: "t1" })
			const impl = tree.addNode({ type: "impl", content: "Impl", parentId: pathNode.node.id, taskId: "t1" })

			expect(sub.node.shortId).toBe("S1.1")
			expect(pathNode.node.shortId).toBe("P1.1.1")
			expect(impl.node.shortId).toBe("I1.1.1.1")
		})

		test("adds child using parent shortId", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			const sub = tree.addNode({ type: "subgoal", content: "Sub", parentId: "G1", taskId: "t1" })
			expect(sub.node.shortId).toBe("S1.1")
			expect(sub.node.parentId).not.toBeNull()
		})

		test("throws error when parentId not found", () => {
			const tree = new IntentTree(treePath)
			expect(() => {
				tree.addNode({ type: "goal", content: "Orphan", parentId: "nonexistent", taskId: "t1" })
			}).toThrow("Parent node 'nonexistent' not found")
			expect(tree.getRootNodes()).toHaveLength(0)
		})

		test("sibling numbering increments correctly", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			const c1 = tree.addNode({ type: "subgoal", content: "Sub 1", parentId: "G1", taskId: "t1" })
			const c2 = tree.addNode({ type: "subgoal", content: "Sub 2", parentId: "G1", taskId: "t1" })
			const c3 = tree.addNode({ type: "subgoal", content: "Sub 3", parentId: "G1", taskId: "t1" })
			expect(c1.node.shortId).toBe("S1.1")
			expect(c2.node.shortId).toBe("S1.2")
			expect(c3.node.shortId).toBe("S1.3")
		})

		test("auto-adjusts type based on parent (goal → subgoal)", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			// 在 goal 下创建 goal，应该自动变成 subgoal
			const child = tree.addNode({ type: "goal", content: "Should be subgoal", parentId: "G1", taskId: "t1" })
			expect(child.node.type).toBe("subgoal")
			expect(child.typeAdjusted).toBe(true)
			expect(child.requestedType).toBe("goal")
		})

		test("auto-adjusts type based on parent (subgoal → path)", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Subgoal", parentId: "G1", taskId: "t1" })
			// 在 subgoal 下创建 goal，应该自动变成 path
			const child = tree.addNode({ type: "goal", content: "Should be path", parentId: "S1.1", taskId: "t1" })
			expect(child.node.type).toBe("path")
			expect(child.typeAdjusted).toBe(true)
			expect(child.requestedType).toBe("goal")
		})

		test("auto-adjusts type based on parent (path → impl)", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Subgoal", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "path", content: "Path", parentId: "S1.1", taskId: "t1" })
			// 在 path 下创建 goal，应该自动变成 impl
			const child = tree.addNode({ type: "goal", content: "Should be impl", parentId: "P1.1.1", taskId: "t1" })
			expect(child.node.type).toBe("impl")
			expect(child.typeAdjusted).toBe(true)
			expect(child.requestedType).toBe("goal")
		})

		test("keeps valid type unchanged", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			// 在 goal 下创建 subgoal，类型不变
			const sub = tree.addNode({ type: "subgoal", content: "Subgoal", parentId: "G1", taskId: "t1" })
			expect(sub.node.type).toBe("subgoal")
			expect(sub.typeAdjusted).toBe(false)
			// 在 goal 下创建 path，类型不变（path 比 goal 低，允许）
			const path = tree.addNode({ type: "path", content: "Path", parentId: "G1", taskId: "t1" })
			expect(path.node.type).toBe("path")
			expect(path.typeAdjusted).toBe(false)
		})

		test("impl can have impl children (for patches)", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "impl", content: "Impl", parentId: "G1", taskId: "t1" })
			// impl 下可以创建 impl（表示 patch）
			const patch = tree.addNode({ type: "impl", content: "Patch", parentId: "I1.1", taskId: "t1" })
			expect(patch.node.type).toBe("impl")
			expect(patch.typeAdjusted).toBe(false)
		})
	})

	// ========================================================================
	// resolveId
	// ========================================================================

	describe("resolveId", () => {
		test("resolves by UUID", () => {
			const tree = new IntentTree(treePath)
			const result = tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			expect(tree.getNode(result.node.id)).toBeDefined()
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

		test("ignores empty string content to prevent accidental clearing", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Original content", parentId: null, taskId: "t1" })
			// Simulate model passing empty content when only updating status
			const updated = tree.updateNode("G1", { status: "in_progress", content: "" }, "t2")
			expect(updated!.status).toBe("in_progress")
			expect(updated!.content).toBe("Original content") // Should NOT be cleared
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
			tree.addNode({ type: "impl", content: "Impl", parentId: "S1.1", taskId: "t1" })

			const pruned = tree.pruneSubtree("S1.1", "t1", "wrong approach")
			expect(pruned).toEqual(["S1.1", "I1.1.1"])
			expect(tree.getNode("S1.1")!.status).toBe("pruned")
			expect(tree.getNode("I1.1.1")!.status).toBe("pruned")
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
			tree.updateNode("P1.1", { status: "in_progress" }, "t1")
			tree.updateNode("P1.2", { status: "in_progress" }, "t1")
			const active = tree.getCurrentActiveNode()
			expect(active!.shortId).toBe("P1.2")
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
			expect(loaded.getNode("S1.1")).toBeDefined()
			expect(loaded.getNode("S1.1")!.content).toBe("Sub")
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

		test("outputs XML format with type as tag name", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Fix bug", parentId: null, taskId: "t1" })
			const summary = tree.toSummary()
			expect(summary).toContain('<goal id="G1"')
			expect(summary).toContain("Fix bug")
			expect(summary).toContain("</goal>")
		})

		test("shows current attribute for in_progress node", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.updateNode("G1", { status: "in_progress" }, "t1")
			expect(tree.toSummary()).toContain('current="true"')
		})

		test("shows commits attribute", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.bindCode("G1", { commitHash: "abc", commitMessage: "msg", files: [], timestamp: "" }, "t1")
			expect(tree.toSummary()).toContain('commits="1"')
		})

		test("shows tree hierarchy with nested XML", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Sub", parentId: "G1", taskId: "t1" })
			const lines = tree.toSummary().split("\n")
			expect(lines[0]).toMatch(/^<goal id="G1"/)
			expect(lines[1]).toMatch(/^  <subgoal id="S1\.1"/)
		})

		test("sanitizes content that conflicts with tag names", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Handle </goal> in content", parentId: null, taskId: "t1" })
			const summary = tree.toSummary()
			// 应该被转义为 ‹/goal›
			expect(summary).toContain("‹/goal›")
			expect(summary).not.toContain("</goal> in content")
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
			tree.pruneSubtree("P1.1", "t1")
			tree.updateNode("P1.2", { status: "superseded" }, "t1")
			const active = tree.getActiveNodes()
			expect(active).toHaveLength(1) // only G1
			expect(active[0].shortId).toBe("G1")
		})

		test("getSubtreeCommits collects from descendants", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "impl", content: "Impl", parentId: "G1", taskId: "t1" })
			tree.bindCode("G1", { commitHash: "aaa", commitMessage: "m1", files: [], timestamp: "" }, "t1")
			tree.bindCode("I1.1", { commitHash: "bbb", commitMessage: "m2", files: [], timestamp: "" }, "t1")
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

	// ========================================================================
	// reparentNode
	// ========================================================================

	describe("reparentNode", () => {
		test("moves node to new parent", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal 1", parentId: null, taskId: "t1" })
			tree.addNode({ type: "goal", content: "Goal 2", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Sub", parentId: "G1", taskId: "t1" })

			const result = tree.reparentNode("S1.1", "G2", "t1")
			expect(result.success).toBe(true)
			expect(result.node!.parentId).not.toBeNull()

			// Verify the node is now under G2
			const children = tree.getChildren("G2")
			expect(children).toHaveLength(1)
			expect(children[0].content).toBe("Sub")
			expect(children[0].shortId).toBe("S2.1")

			// Verify G1 has no children
			expect(tree.getChildren("G1")).toHaveLength(0)
		})

		test("moves node to root", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Sub", parentId: "G1", taskId: "t1" })

			const result = tree.reparentNode("S1.1", null, "t1")
			expect(result.success).toBe(true)
			expect(result.node!.parentId).toBeNull()
			expect(result.node!.shortId).toBe("S1")
			expect(tree.getRootNodes()).toHaveLength(2)
		})

		test("adjusts type when moving to incompatible parent", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal 1", parentId: null, taskId: "t1" })
			tree.addNode({ type: "goal", content: "Goal 2", parentId: null, taskId: "t1" })

			// Move G2 under G1 - should become subgoal
			const result = tree.reparentNode("G2", "G1", "t1")
			expect(result.success).toBe(true)
			expect(result.typeAdjusted).toBe(true)
			expect(result.node!.type).toBe("subgoal")
		})

		test("returns error for nonexistent node", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })

			const result = tree.reparentNode("X99", "G1", "t1")
			expect(result.success).toBe(false)
			expect(result.error).toContain("not found")
		})

		test("returns error for nonexistent parent", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })

			const result = tree.reparentNode("G1", "X99", "t1")
			expect(result.success).toBe(false)
			expect(result.error).toContain("not found")
		})

		test("prevents circular reparenting", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Sub", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "path", content: "Path", parentId: "S1.1", taskId: "t1" })

			// Try to move G1 under its grandchild - should fail
			const result = tree.reparentNode("G1", "P1.1.1", "t1")
			expect(result.success).toBe(false)
			expect(result.error).toContain("descendant")
		})

		test("recalculates shortIds after reparent", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal 1", parentId: null, taskId: "t1" })
			tree.addNode({ type: "goal", content: "Goal 2", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Sub", parentId: "G1", taskId: "t1" })

			const result = tree.reparentNode("S1.1", "G2", "t1")
			expect(result.success).toBe(true)
			expect(result.shortIdChanges.size).toBeGreaterThan(0)

			// The node should have a new shortId under G2
			const movedNode = tree.getNode(result.node!.id)
			expect(movedNode!.shortId).toBe("S2.1")
		})
	})

	// ========================================================================
	// getAvailableNodesList
	// ========================================================================

	describe("getAvailableNodesList", () => {
		test("returns formatted list of active nodes", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Fix the bug", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Identify root cause", parentId: "G1", taskId: "t1" })

			const list = tree.getAvailableNodesList()
			expect(list).toContain("G1")
			expect(list).toContain("goal")
			expect(list).toContain("Fix the bug")
			expect(list).toContain("S1.1")
		})

		test("excludes pruned nodes", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal 1", parentId: null, taskId: "t1" })
			tree.addNode({ type: "goal", content: "Goal 2", parentId: null, taskId: "t1" })
			tree.pruneSubtree("G1", "t1")

			const list = tree.getAvailableNodesList()
			expect(list).not.toContain("G1 (goal")
			expect(list).toContain("G2")
		})

		test("returns message for empty tree", () => {
			const tree = new IntentTree(treePath)
			expect(tree.getAvailableNodesList()).toBe("No nodes available.")
		})
	})

	// ========================================================================
	// shortId 不复用
	// ========================================================================

	describe("shortId no reuse", () => {
		test("does not reuse shortId after node deletion via prune", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Sub 1", parentId: "G1", taskId: "t1" })
			tree.addNode({ type: "subgoal", content: "Sub 2", parentId: "G1", taskId: "t1" })

			// Prune S1.1
			tree.pruneSubtree("S1.1", "t1")

			// Add a new subgoal - should get S1.3, not S1.1
			const result = tree.addNode({ type: "subgoal", content: "Sub 3", parentId: "G1", taskId: "t1" })
			expect(result.node.shortId).toBe("S1.3")
		})
	})

	// ========================================================================
	// 类型调整通知
	// ========================================================================

	describe("type adjustment notification", () => {
		test("returns typeAdjusted=true when type is changed", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })

			// 在 goal 下创建 goal，应该被调整为 subgoal
			const result = tree.addNode({ type: "goal", content: "Should be subgoal", parentId: "G1", taskId: "t1" })

			expect(result.typeAdjusted).toBe(true)
			expect(result.requestedType).toBe("goal")
			expect(result.node.type).toBe("subgoal")
			expect(result.adjustmentReason).toContain("goal")
		})

		test("returns typeAdjusted=false when type is valid", () => {
			const tree = new IntentTree(treePath)
			tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })

			// 在 goal 下创建 subgoal，类型不变
			const result = tree.addNode({ type: "subgoal", content: "Subgoal", parentId: "G1", taskId: "t1" })

			expect(result.typeAdjusted).toBe(false)
			expect(result.requestedType).toBeUndefined()
		})
	})
})
