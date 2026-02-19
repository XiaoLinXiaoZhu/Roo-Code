import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { IntentTree } from "../IntentTree"

describe("restructure: shortId drift during sequential reparent", () => {
	let tmpDir: string
	let treePath: string

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "intent-restructure-bug-"))
		treePath = path.join(tmpDir, "intent-tree.json")
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	test("shortId drift: recalculateShortIds causes shortId to point to wrong node after reparent", () => {
		const tree = new IntentTree(treePath)

		// 创建 3 个根节点: G1(Goal 1), G2(Goal 2), G3(Goal 3)
		tree.addNode({ type: "goal", content: "Goal 1", parentId: null, taskId: "t1" })
		tree.addNode({ type: "goal", content: "Goal 2", parentId: null, taskId: "t1" })
		tree.addNode({ type: "goal", content: "Goal 3", parentId: null, taskId: "t1" })

		// 创建新父节点 (G4)
		const newParent = tree.addNode({
			type: "goal",
			content: "Common Parent",
			parentId: null,
			taskId: "t1",
		})

		// reparent "G1" -> 成功，但 recalculateShortIds 重新编号
		// roots 从 [G1,G2,G3,G4] 变为 [G2,G3,G4] → recalculate → [G1,G2,G3]
		// 原来的 G2(Goal 2) 变成了 G1, G3(Goal 3) 变成了 G2
		const result1 = tree.reparentNode("G1", newParent.node.id, "t1")
		expect(result1.success).toBe(true)

		// 此时 "G2" 指向的是 Goal 3（不是 Goal 2！）
		const nodeAtG2 = tree.getNode("G2")
		expect(nodeAtG2?.content).toBe("Goal 3") // shortId 漂移的证据

		// 如果用 shortId 循环 reparent，第二次会移动错误的节点
		// 这就是 handleExtractCommonParent 中的 bug 根因
	})

	test("sequential reparent with shortIds moves wrong nodes (demonstrates the bug pattern)", () => {
		const tree = new IntentTree(treePath)

		tree.addNode({ type: "goal", content: "Goal 1", parentId: null, taskId: "t1" })
		tree.addNode({ type: "goal", content: "Goal 2", parentId: null, taskId: "t1" })
		tree.addNode({ type: "goal", content: "Goal 3", parentId: null, taskId: "t1" })

		const newParent = tree.addNode({
			type: "goal",
			content: "Common Parent",
			parentId: null,
			taskId: "t1",
		})

		// 模拟有 bug 的循环：直接用 shortId 依次 reparent
		const movedContents: string[] = []
		for (const nodeId of ["G1", "G2"]) {
			const result = tree.reparentNode(nodeId, newParent.node.id, "t1")
			if (result.success && result.node) {
				movedContents.push(result.node.content)
			}
		}

		// 实际移动的是 Goal 1 和 Goal 3（而非期望的 Goal 1 和 Goal 2）
		expect(movedContents).toEqual(["Goal 1", "Goal 3"])
	})

	test("FIX: pre-resolve shortIds to UUIDs before sequential reparent", () => {
		const tree = new IntentTree(treePath)

		tree.addNode({ type: "goal", content: "Goal 1", parentId: null, taskId: "t1" })
		tree.addNode({ type: "goal", content: "Goal 2", parentId: null, taskId: "t1" })
		tree.addNode({ type: "goal", content: "Goal 3", parentId: null, taskId: "t1" })

		// 先解析 shortId 为 UUID（在任何 reparent 之前）
		const resolvedIds = ["G1", "G2"].map((id) => tree.resolveId(id)!)
		expect(resolvedIds.every((id) => id !== null)).toBe(true)

		const newParent = tree.addNode({
			type: "goal",
			content: "Common Parent",
			parentId: null,
			taskId: "t1",
		})

		// 使用 UUID 进行 reparent
		const movedContents: string[] = []
		for (const uuid of resolvedIds) {
			const result = tree.reparentNode(uuid, newParent.node.id, "t1")
			if (result.success && result.node) {
				movedContents.push(result.node.content)
			}
		}

		// 使用 UUID 正确移动了 Goal 1 和 Goal 2
		expect(movedContents).toEqual(["Goal 1", "Goal 2"])
	})

	test("FIX: extract_common_parent with child nodes also works correctly", () => {
		const tree = new IntentTree(treePath)

		// 创建带子节点的结构
		tree.addNode({ type: "goal", content: "Goal 1", parentId: null, taskId: "t1" })
		tree.addNode({ type: "objective", content: "Obj 1.1", parentId: "G1", taskId: "t1" })
		tree.addNode({ type: "goal", content: "Goal 2", parentId: null, taskId: "t1" })
		tree.addNode({ type: "objective", content: "Obj 2.1", parentId: "G2", taskId: "t1" })

		// 先解析
		const resolvedIds = ["G1", "G2"].map((id) => tree.resolveId(id)!)

		const newParent = tree.addNode({
			type: "goal",
			content: "Common Parent",
			parentId: null,
			taskId: "t1",
		})

		// 使用 UUID reparent
		for (const uuid of resolvedIds) {
			const result = tree.reparentNode(uuid, newParent.node.id, "t1")
			expect(result.success).toBe(true)
		}

		// 验证最终结构
		const children = tree.getChildren(newParent.node.id)
		expect(children).toHaveLength(2)
		expect(children.map((c) => c.content).sort()).toEqual(["Goal 1", "Goal 2"])

		// 子节点也应该正确保留
		const g1Children = tree.getChildren(children.find((c) => c.content === "Goal 1")!.id)
		expect(g1Children).toHaveLength(1)
		expect(g1Children[0].content).toBe("Obj 1.1")
	})
})
