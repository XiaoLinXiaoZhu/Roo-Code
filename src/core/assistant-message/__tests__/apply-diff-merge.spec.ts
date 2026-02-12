/**
 * Tests for the deferred apply_diff merge logic.
 *
 * When multiple consecutive markdown apply_diff blocks target the same file,
 * they are merged into a single ToolUse block in Task.ts. The merge is triggered
 * by the tool_start/tool_end event sequence from MarkdownToolParser:
 *
 * - tool_end for apply_diff: defer execution (keep partial=true), store as pending
 * - tool_start for same-file apply_diff: merge into pending block
 * - tool_start for different tool/file OR stream finalize: flush pending (set partial=false)
 *
 * This eliminates timing dependencies — the merge decision is based on deterministic
 * events (next tool_start or stream end), not race conditions.
 */

import { MarkdownToolParser } from "../MarkdownToolParser"
import type { ToolUse } from "../../../shared/tools"
import type { AssistantMessageContent } from "../types"

/**
 * Simulates the Task.ts markdown event processing logic for testing.
 * This mirrors the tool_start/tool_end/tool_delta handling in Task.ts.
 */
class DeferredMergeSimulator {
	assistantMessageContent: AssistantMessageContent[] = []
	private streamingToolCallIndices: Map<string, number> = new Map()
	private pendingApplyDiff: { index: number; path: string } | null = null
	private parser = new MarkdownToolParser()

	private flushPendingApplyDiff(): void {
		if (!this.pendingApplyDiff) return
		const { index } = this.pendingApplyDiff
		const toolUse = this.assistantMessageContent[index] as ToolUse
		if (toolUse && toolUse.type === "tool_use" && toolUse.partial) {
			toolUse.partial = false
			const path = toolUse.params.path
			const content = toolUse.params.content || ""
			toolUse.nativeArgs = { path, diff: content } as any
		}
		this.pendingApplyDiff = null
	}

	processChunk(text: string): void {
		const events = this.parser.processChunk(text)
		for (const mdEvent of events) {
			switch (mdEvent.type) {
				case "tool_start": {
					if (
						this.pendingApplyDiff &&
						mdEvent.toolName === "apply_diff" &&
						mdEvent.path === this.pendingApplyDiff.path
					) {
						const pendingIndex = this.pendingApplyDiff.index
						const pendingToolUse = this.assistantMessageContent[pendingIndex] as ToolUse
						if (pendingToolUse) {
							pendingToolUse.params.content = (pendingToolUse.params.content || "") + "\n"
						}
						this.streamingToolCallIndices.set(mdEvent.id, pendingIndex)
						break
					}
					this.flushPendingApplyDiff()
					const toolUse: ToolUse = {
						type: "tool_use",
						name: mdEvent.toolName,
						params:
							mdEvent.toolName === "update_todo_list"
								? { todos: "" }
								: { path: mdEvent.path, content: "" },
						partial: true,
						isMarkdownTool: true,
					}
					;(toolUse as any).id = mdEvent.id
					const toolUseIndex = this.assistantMessageContent.length
					this.streamingToolCallIndices.set(mdEvent.id, toolUseIndex)
					this.assistantMessageContent.push(toolUse)
					break
				}
				case "tool_delta": {
					const toolUseIndex = this.streamingToolCallIndices.get(mdEvent.id)
					if (toolUseIndex !== undefined) {
						const toolUse = this.assistantMessageContent[toolUseIndex] as ToolUse
						if (toolUse && toolUse.type === "tool_use") {
							if (toolUse.name === "update_todo_list") {
								toolUse.params.todos = (toolUse.params.todos || "") + mdEvent.contentDelta
							} else {
								toolUse.params.content = (toolUse.params.content || "") + mdEvent.contentDelta
							}
						}
					}
					break
				}
				case "tool_end": {
					const toolUseIndex = this.streamingToolCallIndices.get(mdEvent.id)
					if (toolUseIndex !== undefined) {
						const toolUse = this.assistantMessageContent[toolUseIndex] as ToolUse
						if (toolUse && toolUse.type === "tool_use") {
							if (toolUse.name === "apply_diff") {
								if (this.pendingApplyDiff) {
									this.flushPendingApplyDiff()
								}
								const path = toolUse.params.path
								const content = toolUse.params.content || ""
								toolUse.nativeArgs = { path, diff: content } as any
								this.pendingApplyDiff = { index: toolUseIndex, path: path || "" }
							} else {
								this.flushPendingApplyDiff()
								toolUse.partial = false
								const path = toolUse.params.path
								const content = toolUse.params.content || ""
								if (toolUse.name === "write_to_file") {
									toolUse.nativeArgs = { path, content } as any
								} else if (toolUse.name === "update_todo_list") {
									toolUse.nativeArgs = { todos: toolUse.params.todos || "" } as any
								}
							}
						}
						this.streamingToolCallIndices.delete(mdEvent.id)
					}
					break
				}
				case "text":
					break
			}
		}
	}

	finalize(): void {
		this.flushPendingApplyDiff()
		const finalizeEvents = this.parser.finalize()
		for (const mdEvent of finalizeEvents) {
			if (mdEvent.type === "tool_end") {
				const toolUseIndex = this.streamingToolCallIndices.get(mdEvent.id)
				if (toolUseIndex !== undefined) {
					const toolUse = this.assistantMessageContent[toolUseIndex] as ToolUse
					if (toolUse && toolUse.type === "tool_use") {
						toolUse.partial = false
						const path = toolUse.params.path
						const content = toolUse.params.content || ""
						if (toolUse.name === "apply_diff") {
							toolUse.nativeArgs = { path, diff: content } as any
						} else if (toolUse.name === "write_to_file") {
							toolUse.nativeArgs = { path, content } as any
						}
					}
				}
			}
		}
	}
}

describe("deferred apply_diff merge", () => {
	test("should merge consecutive same-file apply_diff blocks into one", () => {
		const sim = new DeferredMergeSimulator()

		sim.processChunk(
			"Some text\n\n" +
				"``````apply_diff src/foo.ts\n" +
				"<<<<<<< SEARCH\n:start_line:10\n-------\nold1\n=======\nnew1\n>>>>>>> REPLACE\n" +
				"``````\n\n" +
				"``````apply_diff src/foo.ts\n" +
				"<<<<<<< SEARCH\n:start_line:20\n-------\nold2\n=======\nnew2\n>>>>>>> REPLACE\n" +
				"``````\n\n" +
				"``````apply_diff src/foo.ts\n" +
				"<<<<<<< SEARCH\n:start_line:30\n-------\nold3\n=======\nnew3\n>>>>>>> REPLACE\n" +
				"``````\n",
		)
		sim.finalize()

		// Should produce only ONE tool_use block (all merged)
		const toolBlocks = sim.assistantMessageContent.filter(
			(b) => b.type === "tool_use" && b.name === "apply_diff",
		) as ToolUse[]
		expect(toolBlocks).toHaveLength(1)

		const merged = toolBlocks[0]
		expect(merged.partial).toBe(false)
		expect(merged.params.path).toBe("src/foo.ts")

		// The merged content should contain all three SEARCH/REPLACE blocks
		const content = merged.params.content || ""
		expect(content).toContain("old1")
		expect(content).toContain("old2")
		expect(content).toContain("old3")
		expect(content).toContain("new1")
		expect(content).toContain("new2")
		expect(content).toContain("new3")
	})

	test("should not merge apply_diff blocks targeting different files", () => {
		const sim = new DeferredMergeSimulator()

		sim.processChunk(
			"``````apply_diff src/foo.ts\n" +
				"<<<<<<< SEARCH\n:start_line:10\n-------\nold1\n=======\nnew1\n>>>>>>> REPLACE\n" +
				"``````\n\n" +
				"``````apply_diff src/bar.ts\n" +
				"<<<<<<< SEARCH\n:start_line:20\n-------\nold2\n=======\nnew2\n>>>>>>> REPLACE\n" +
				"``````\n",
		)
		sim.finalize()

		const toolBlocks = sim.assistantMessageContent.filter(
			(b) => b.type === "tool_use" && b.name === "apply_diff",
		) as ToolUse[]
		expect(toolBlocks).toHaveLength(2)
		expect(toolBlocks[0].params.path).toBe("src/foo.ts")
		expect(toolBlocks[1].params.path).toBe("src/bar.ts")
		expect(toolBlocks[0].partial).toBe(false)
		expect(toolBlocks[1].partial).toBe(false)
	})

	test("should flush pending apply_diff when a different tool starts", () => {
		const sim = new DeferredMergeSimulator()

		sim.processChunk(
			"``````apply_diff src/foo.ts\n" +
				"<<<<<<< SEARCH\n:start_line:10\n-------\nold1\n=======\nnew1\n>>>>>>> REPLACE\n" +
				"``````\n\n" +
				"``````write_to src/bar.ts\n" +
				"new file content\n" +
				"``````\n",
		)
		sim.finalize()

		const applyDiffBlocks = sim.assistantMessageContent.filter(
			(b) => b.type === "tool_use" && b.name === "apply_diff",
		) as ToolUse[]
		const writeBlocks = sim.assistantMessageContent.filter(
			(b) => b.type === "tool_use" && b.name === "write_to_file",
		) as ToolUse[]

		expect(applyDiffBlocks).toHaveLength(1)
		expect(applyDiffBlocks[0].partial).toBe(false)
		expect(writeBlocks).toHaveLength(1)
		expect(writeBlocks[0].partial).toBe(false)
	})

	test("should flush pending apply_diff on stream finalize", () => {
		const sim = new DeferredMergeSimulator()

		sim.processChunk(
			"``````apply_diff src/foo.ts\n" +
				"<<<<<<< SEARCH\n:start_line:10\n-------\nold1\n=======\nnew1\n>>>>>>> REPLACE\n" +
				"``````\n",
		)

		// Before finalize, the block should still be partial (deferred)
		const toolBlocks = sim.assistantMessageContent.filter(
			(b) => b.type === "tool_use" && b.name === "apply_diff",
		) as ToolUse[]
		expect(toolBlocks).toHaveLength(1)
		expect(toolBlocks[0].partial).toBe(true)

		sim.finalize()

		// After finalize, should be flushed
		expect(toolBlocks[0].partial).toBe(false)
	})

	test("should handle streaming chunks arriving incrementally", () => {
		const sim = new DeferredMergeSimulator()

		// Simulate chunks arriving one at a time
		sim.processChunk("``````apply_diff src/foo.ts\n")
		sim.processChunk("<<<<<<< SEARCH\n:start_line:10\n-------\n")
		sim.processChunk("old1\n=======\nnew1\n>>>>>>> REPLACE\n")
		sim.processChunk("``````\n\n")
		sim.processChunk("``````apply_diff src/foo.ts\n")
		sim.processChunk("<<<<<<< SEARCH\n:start_line:20\n-------\n")
		sim.processChunk("old2\n=======\nnew2\n>>>>>>> REPLACE\n")
		sim.processChunk("``````\n")
		sim.finalize()

		const toolBlocks = sim.assistantMessageContent.filter(
			(b) => b.type === "tool_use" && b.name === "apply_diff",
		) as ToolUse[]
		expect(toolBlocks).toHaveLength(1)

		const content = toolBlocks[0].params.content || ""
		expect(content).toContain("old1")
		expect(content).toContain("old2")
	})

	test("should build correct nativeArgs with merged diff content", () => {
		const sim = new DeferredMergeSimulator()

		sim.processChunk(
			"``````apply_diff src/foo.ts\n" +
				"<<<<<<< SEARCH\n:start_line:10\n-------\nold1\n=======\nnew1\n>>>>>>> REPLACE\n" +
				"``````\n\n" +
				"``````apply_diff src/foo.ts\n" +
				"<<<<<<< SEARCH\n:start_line:20\n-------\nold2\n=======\nnew2\n>>>>>>> REPLACE\n" +
				"``````\n",
		)
		sim.finalize()

		const toolBlocks = sim.assistantMessageContent.filter(
			(b) => b.type === "tool_use" && b.name === "apply_diff",
		) as ToolUse[]
		expect(toolBlocks).toHaveLength(1)

		const nativeArgs = toolBlocks[0].nativeArgs as any
		expect(nativeArgs).toBeDefined()
		expect(nativeArgs.path).toBe("src/foo.ts")
		expect(nativeArgs.diff).toContain("old1")
		expect(nativeArgs.diff).toContain("old2")
	})
})
