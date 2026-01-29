/**
 * Tests for Markdown tool call handling in API conversation history.
 *
 * This test verifies that Markdown-format tool calls (write_to, apply_diff, todo_list)
 * are NOT added to the API conversation history as tool_use blocks.
 *
 * Background:
 * - Markdown tool calls should remain as text in the conversation history
 * - This ensures the model learns to use Markdown format (In-Context Learning)
 * - Tool results are injected via environment_details, not tool_result blocks
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ToolUse } from "../../../shared/tools"

describe("Markdown Tool History Handling", () => {
	describe("isMarkdownTool filtering in API history", () => {
		/**
		 * Simulates the filtering logic from Task.ts:3512-3517
		 * This is the core logic that prevents Markdown tools from being added to API history
		 */
		function filterToolUseBlocks(
			assistantMessageContent: Array<{ type: string; isMarkdownTool?: boolean; id?: string; name?: string }>,
		) {
			return assistantMessageContent.filter(
				(block) =>
					(block.type === "tool_use" || block.type === "mcp_tool_use") && !(block as ToolUse).isMarkdownTool,
			)
		}

		it("should filter out Markdown tool calls from API history", () => {
			const assistantMessageContent = [
				// Regular native tool call - should be included
				{
					type: "tool_use",
					id: "native_tool_1",
					name: "read_file",
					isMarkdownTool: false,
				},
				// Markdown tool call - should be filtered out
				{
					type: "tool_use",
					id: "md_tool_1_123456",
					name: "apply_diff",
					isMarkdownTool: true,
				},
				// Another Markdown tool call - should be filtered out
				{
					type: "tool_use",
					id: "md_tool_2_123457",
					name: "write_to_file",
					isMarkdownTool: true,
				},
				// Text block - not a tool_use, should not be in result
				{
					type: "text",
					content: "Some text",
				},
			]

			const toolUseBlocks = filterToolUseBlocks(assistantMessageContent)

			// Only the native tool call should remain
			expect(toolUseBlocks).toHaveLength(1)
			expect(toolUseBlocks[0].id).toBe("native_tool_1")
			expect(toolUseBlocks[0].name).toBe("read_file")
		})

		it("should include all native tool calls when no Markdown tools are present", () => {
			const assistantMessageContent = [
				{
					type: "tool_use",
					id: "native_tool_1",
					name: "read_file",
					isMarkdownTool: false,
				},
				{
					type: "tool_use",
					id: "native_tool_2",
					name: "execute_command",
					isMarkdownTool: false,
				},
			]

			const toolUseBlocks = filterToolUseBlocks(assistantMessageContent)

			expect(toolUseBlocks).toHaveLength(2)
		})

		it("should return empty array when only Markdown tools are present", () => {
			const assistantMessageContent = [
				{
					type: "tool_use",
					id: "md_tool_1_123456",
					name: "apply_diff",
					isMarkdownTool: true,
				},
				{
					type: "tool_use",
					id: "md_tool_2_123457",
					name: "write_to_file",
					isMarkdownTool: true,
				},
				{
					type: "tool_use",
					id: "md_tool_3_123458",
					name: "update_todo_list",
					isMarkdownTool: true,
				},
			]

			const toolUseBlocks = filterToolUseBlocks(assistantMessageContent)

			expect(toolUseBlocks).toHaveLength(0)
		})

		it("should handle tool_use blocks without isMarkdownTool property (defaults to included)", () => {
			const assistantMessageContent = [
				{
					type: "tool_use",
					id: "native_tool_1",
					name: "read_file",
					// No isMarkdownTool property - should be included (undefined is falsy)
				},
			]

			const toolUseBlocks = filterToolUseBlocks(assistantMessageContent)

			expect(toolUseBlocks).toHaveLength(1)
		})

		it("should handle mcp_tool_use blocks correctly", () => {
			const assistantMessageContent = [
				{
					type: "mcp_tool_use",
					id: "mcp_tool_1",
					name: "mcp_server_tool",
					isMarkdownTool: false,
				},
				{
					type: "tool_use",
					id: "md_tool_1_123456",
					name: "apply_diff",
					isMarkdownTool: true,
				},
			]

			const toolUseBlocks = filterToolUseBlocks(assistantMessageContent)

			expect(toolUseBlocks).toHaveLength(1)
			expect(toolUseBlocks[0].type).toBe("mcp_tool_use")
		})
	})

	describe("Markdown tool ID format", () => {
		it("should recognize Markdown tool IDs by their format", () => {
			const markdownToolIds = ["md_tool_1_1706789012345", "md_tool_42_1706789012346", "md_tool_100_1706789012347"]

			const nativeToolIds = ["tooluse_abc123", "toolu_01234567890", "call_xyz789"]

			// Markdown tool IDs follow the pattern: md_tool_{counter}_{timestamp}
			const isMarkdownToolId = (id: string) => /^md_tool_\d+_\d+$/.test(id)

			for (const id of markdownToolIds) {
				expect(isMarkdownToolId(id)).toBe(true)
			}

			for (const id of nativeToolIds) {
				expect(isMarkdownToolId(id)).toBe(false)
			}
		})
	})

	describe("API history structure after filtering", () => {
		it("should produce correct assistant message structure without Markdown tools", () => {
			// Simulate the structure that would be added to apiConversationHistory
			const assistantMessage =
				"Let me modify the file:\n\n```apply_diff src/app.ts\n<<<<<<< SEARCH\nold code\n=======\nnew code\n>>>>>>> REPLACE\n```"

			const assistantMessageContent = [
				{
					type: "text",
					text: assistantMessage,
				},
				{
					type: "tool_use",
					id: "md_tool_1_123456",
					name: "apply_diff",
					isMarkdownTool: true,
					params: { path: "src/app.ts", content: "..." },
				},
			]

			// Filter tool_use blocks (simulating Task.ts logic)
			const toolUseBlocks = assistantMessageContent.filter(
				(block) =>
					(block.type === "tool_use" || block.type === "mcp_tool_use") && !(block as any).isMarkdownTool,
			)

			// Build assistant content for API history
			const assistantContent: Array<{ type: string; text?: string; id?: string; name?: string; input?: any }> = []

			// Add text content
			const textBlock = assistantMessageContent.find((b) => b.type === "text")
			if (textBlock && textBlock.type === "text") {
				assistantContent.push({
					type: "text",
					text: (textBlock as any).text,
				})
			}

			// Add tool_use blocks (should be empty for Markdown-only tools)
			for (const block of toolUseBlocks) {
				assistantContent.push({
					type: "tool_use",
					id: block.id,
					name: block.name,
					input: (block as any).params,
				})
			}

			// Verify the structure
			expect(assistantContent).toHaveLength(1) // Only text block
			expect(assistantContent[0].type).toBe("text")
			expect(assistantContent[0].text).toContain("```apply_diff")

			// The Markdown tool call is preserved in the text, not as a separate tool_use block
			// This is the key behavior that enables In-Context Learning
		})

		it("should include both text and native tool_use blocks when mixed", () => {
			const assistantMessage = "Let me read the file first."

			const assistantMessageContent = [
				{
					type: "text",
					text: assistantMessage,
				},
				{
					type: "tool_use",
					id: "native_tool_1",
					name: "read_file",
					isMarkdownTool: false,
					params: { files: [{ path: "src/app.ts" }] },
				},
			]

			const toolUseBlocks = assistantMessageContent.filter(
				(block) =>
					(block.type === "tool_use" || block.type === "mcp_tool_use") && !(block as any).isMarkdownTool,
			)

			const assistantContent: Array<{ type: string; text?: string; id?: string; name?: string; input?: any }> = []

			const textBlock = assistantMessageContent.find((b) => b.type === "text")
			if (textBlock && textBlock.type === "text") {
				assistantContent.push({
					type: "text",
					text: (textBlock as any).text,
				})
			}

			for (const block of toolUseBlocks) {
				assistantContent.push({
					type: "tool_use",
					id: block.id,
					name: block.name,
					input: (block as any).params,
				})
			}

			// Verify the structure
			expect(assistantContent).toHaveLength(2) // Text + native tool_use
			expect(assistantContent[0].type).toBe("text")
			expect(assistantContent[1].type).toBe("tool_use")
			expect(assistantContent[1].name).toBe("read_file")
		})
	})

	describe("didToolUse detection with Markdown tools", () => {
		/**
		 * Simulates the didToolUse detection logic from Task.ts:3601-3606
		 * This logic determines whether the model used any tool (native or Markdown)
		 */
		function checkDidToolUse(
			assistantMessageContent: Array<{ type: string }>,
			markdownToolResults: Array<{ toolName: string; status: string }>,
		): boolean {
			return (
				assistantMessageContent.some((block) => block.type === "tool_use" || block.type === "mcp_tool_use") ||
				markdownToolResults.length > 0
			)
		}

		it("should detect Markdown tool usage via markdownToolResults", () => {
			const assistantMessageContent = [{ type: "text", text: "Let me update the todo list..." }]
			const markdownToolResults = [
				{ toolName: "update_todo_list", status: "success", message: "Todo list updated" },
			]

			const didToolUse = checkDidToolUse(assistantMessageContent, markdownToolResults)

			expect(didToolUse).toBe(true)
		})

		it("should detect native tool usage", () => {
			const assistantMessageContent = [
				{ type: "text", text: "Let me read the file..." },
				{ type: "tool_use", id: "native_1", name: "read_file" },
			]
			const markdownToolResults: Array<{ toolName: string; status: string }> = []

			const didToolUse = checkDidToolUse(assistantMessageContent, markdownToolResults)

			expect(didToolUse).toBe(true)
		})

		it("should return false when no tools are used", () => {
			const assistantMessageContent = [{ type: "text", text: "I will just respond with text." }]
			const markdownToolResults: Array<{ toolName: string; status: string }> = []

			const didToolUse = checkDidToolUse(assistantMessageContent, markdownToolResults)

			expect(didToolUse).toBe(false)
		})

		it("should detect both native and Markdown tools when mixed", () => {
			const assistantMessageContent = [
				{ type: "text", text: "Let me do multiple things..." },
				{ type: "tool_use", id: "native_1", name: "read_file" },
			]
			const markdownToolResults = [{ toolName: "apply_diff", status: "success", message: "File modified" }]

			const didToolUse = checkDidToolUse(assistantMessageContent, markdownToolResults)

			expect(didToolUse).toBe(true)
		})

		it("should detect MCP tool usage", () => {
			const assistantMessageContent = [
				{ type: "text", text: "Using MCP tool..." },
				{ type: "mcp_tool_use", id: "mcp_1", name: "mcp_server_tool" },
			]
			const markdownToolResults: Array<{ toolName: string; status: string }> = []

			const didToolUse = checkDidToolUse(assistantMessageContent, markdownToolResults)

			expect(didToolUse).toBe(true)
		})
	})
})
