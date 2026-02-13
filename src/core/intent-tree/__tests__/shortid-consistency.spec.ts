import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { IntentTree } from "../IntentTree"

describe("shortId consistency between addNode and recalculateShortIds", () => {
	let tmpDir: string
	let treePath: string

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "intent-shortid-test-"))
		treePath = path.join(tmpDir, "intent-tree.json")
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	test("root nodes: addNode after reparent produces consistent shortId", () => {
		const tree = new IntentTree(treePath)

		// G1 → rootMaxChildIndex=1, S2 → rootMaxChildIndex=2
		const g1 = tree.addNode({ type: "goal", content: "Goal 1", parentId: null, taskId: "t1" })
		const s = tree.addNode({ type: "objective", content: "Sub root", parentId: null, taskId: "t1" })

		expect(g1.node.shortId).toBe("G1")
		expect(s.node.shortId).toBe("O2") // Global counter: 2

		// reparent S2 under G1 → recalculateShortIds syncs rootMaxChildIndex to 1
		tree.reparentNode("O2", "G1", "t1")

		// Now add a new root goal — should get G2 (not G3)
		const g2 = tree.addNode({ type: "goal", content: "Goal 2", parentId: null, taskId: "t1" })
		expect(g2.node.shortId).toBe("G2")

		// A second recalculate should NOT change G2
		const changes = tree.recalculateShortIds()
		const g2Change = [...changes.values()].find((c) => c.old === "G2")
		expect(g2Change).toBeUndefined() // No change — consistent
	})

	test("child nodes: addNode after reparent produces sequential shortId without gaps", () => {
		const tree = new IntentTree(treePath)

		tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
		tree.addNode({ type: "objective", content: "Sub 1", parentId: "G1", taskId: "t1" })
		tree.addNode({ type: "objective", content: "Sub 2", parentId: "G1", taskId: "t1" })
		tree.addNode({ type: "objective", content: "Sub 3", parentId: "G1", taskId: "t1" })

		// G1 children: S1.1, S1.2, S1.3

		// Reparent S1.2 to root → recalculate compacts to S1.1, S1.2 and syncs maxChildIndex=2
		tree.reparentNode("O1.2", null, "t1")

		// Add new child — should get S1.3 (not S1.4)
		const newChild = tree.addNode({ type: "objective", content: "Sub 4", parentId: "G1", taskId: "t1" })
		expect(newChild.node.shortId).toBe("O1.3")

		// Children should be sequential: S1.1, S1.2, S1.3
		const childIds = tree.getChildren("G1").map((n) => n.shortId)
		expect(childIds).toEqual(["O1.1", "O1.2", "O1.3"])
	})

	test("reparent + addNode + reparent: shortIds remain stable", () => {
		const tree = new IntentTree(treePath)

		tree.addNode({ type: "goal", content: "Goal 1", parentId: null, taskId: "t1" })
		tree.addNode({ type: "goal", content: "Goal 2", parentId: null, taskId: "t1" })
		tree.addNode({ type: "objective", content: "Sub A", parentId: "G1", taskId: "t1" })

		// Reparent Sub from G1 to G2
		tree.reparentNode("O1.1", "G2", "t1")

		// Add new child to G1
		const newChild = tree.addNode({ type: "objective", content: "Sub B", parentId: "G1", taskId: "t1" })
		expect(newChild.node.shortId).toBe("O1.1") // G1 had 0 children after reparent, maxChildIndex synced to 0, so next is 1

		// Reparent Sub A back to G1
		tree.reparentNode("O2.1", "G1", "t1")

		// G1 should now have 2 children with sequential IDs
		const g1Children = tree.getChildren("G1").map((n) => n.shortId)
		expect(g1Children).toHaveLength(2)
		// After recalculate, children are renumbered sequentially
		expect(g1Children[0]).toBe("O1.1")
		expect(g1Children[1]).toBe("O1.2")
	})

	test("pure addNode + prune + addNode still preserves no-reuse guarantee", () => {
		const tree = new IntentTree(treePath)

		tree.addNode({ type: "goal", content: "Goal", parentId: null, taskId: "t1" })
		tree.addNode({ type: "objective", content: "Sub 1", parentId: "G1", taskId: "t1" })
		tree.addNode({ type: "objective", content: "Sub 2", parentId: "G1", taskId: "t1" })

		// Prune S1.1 (no recalculate involved)
		tree.pruneSubtree("O1.1", "t1")

		// Add new child — should get S1.3 (not S1.1), preserving no-reuse
		const result = tree.addNode({ type: "objective", content: "Sub 3", parentId: "G1", taskId: "t1" })
		expect(result.node.shortId).toBe("O1.3")
	})
})
