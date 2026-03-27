import type { DomainEvent } from "@roo-code/types"
import { toConversationTurns } from "../toConversationTurns"

describe("toConversationTurns", () => {
	test("empty events produce empty turns", () => {
		expect(toConversationTurns([])).toEqual([])
	})

	test("user text becomes a user turn", () => {
		const events: DomainEvent[] = [{ id: "e1", ts: 1000, type: "user_text", content: "Hello" }]
		const turns = toConversationTurns(events)
		expect(turns).toHaveLength(1)
		expect(turns[0].role).toBe("user")
		if (turns[0].role === "user") {
			expect(turns[0].content).toEqual([{ type: "text", text: "Hello" }])
		}
	})

	test("user text with images includes image blocks", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "user_text", content: "Look at this", images: ["data:image/png;base64,abc"] },
		]
		const turns = toConversationTurns(events)
		expect(turns).toHaveLength(1)
		if (turns[0].role === "user") {
			expect(turns[0].content).toHaveLength(2)
			expect(turns[0].content[0]).toEqual({ type: "text", text: "Look at this" })
			expect(turns[0].content[1]).toEqual({
				type: "image",
				source: "data:image/png;base64,abc",
				mediaType: "image/png",
			})
		}
	})

	test("assistant text becomes an assistant turn", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "user_text", content: "Hi" },
			{ id: "e2", ts: 1001, type: "assistant_text", content: "Hello!", partial: false },
		]
		const turns = toConversationTurns(events)
		expect(turns).toHaveLength(2)
		expect(turns[0].role).toBe("user")
		expect(turns[1].role).toBe("assistant")
		if (turns[1].role === "assistant") {
			expect(turns[1].content).toEqual([{ type: "text", text: "Hello!" }])
		}
	})

	test("partial assistant text is skipped", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "user_text", content: "Hi" },
			{ id: "e2", ts: 1001, type: "assistant_text", content: "Hel", partial: true },
			{ id: "e3", ts: 1002, type: "assistant_text", content: "Hello!", partial: false },
		]
		const turns = toConversationTurns(events)
		expect(turns).toHaveLength(2)
		if (turns[1].role === "assistant") {
			// Only the final non-partial text is included
			expect(turns[1].content).toEqual([{ type: "text", text: "Hello!" }])
		}
	})

	test("tool call + tool result creates assistant and user turns", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "user_text", content: "Read file" },
			{
				id: "e2",
				ts: 1001,
				type: "tool_call",
				toolCallId: "tc1",
				tool: "read_file",
				args: { path: "test.ts" },
			} as DomainEvent,
			{
				id: "e3",
				ts: 1002,
				type: "tool_result",
				parentId: "e2",
				toolCallId: "tc1",
				tool: "read_file",
				content: "file content",
				truncated: false,
			} as DomainEvent,
		]
		const turns = toConversationTurns(events)
		// user("Read file") → assistant(tool_call) → user(tool_result)
		expect(turns).toHaveLength(3)
		expect(turns[0].role).toBe("user")
		expect(turns[1].role).toBe("assistant")
		expect(turns[2].role).toBe("user")

		if (turns[1].role === "assistant") {
			expect(turns[1].content[0]).toMatchObject({
				type: "tool_call",
				toolCallId: "tc1",
				toolName: "read_file",
			})
		}
		if (turns[2].role === "user") {
			expect(turns[2].content[0]).toMatchObject({
				type: "tool_result",
				toolCallId: "tc1",
				content: "file content",
			})
		}
	})

	test("execute_command result extracts stdout/stderr", () => {
		const events: DomainEvent[] = [
			{
				id: "e1",
				ts: 1000,
				type: "tool_call",
				toolCallId: "tc1",
				tool: "execute_command",
				args: { command: "ls" },
			} as DomainEvent,
			{
				id: "e2",
				ts: 1001,
				type: "tool_result",
				parentId: "e1",
				toolCallId: "tc1",
				tool: "execute_command",
				exitCode: 0,
				stdout: "file1\nfile2",
				stderr: "",
			} as DomainEvent,
		]
		const turns = toConversationTurns(events)
		if (turns[1]?.role === "user") {
			const result = turns[1].content[0]
			if (result.type === "tool_result") {
				expect(result.content).toBe("file1\nfile2")
				expect(result.isError).toBeUndefined()
			}
		}
	})

	test("failed tool result has isError flag", () => {
		const events: DomainEvent[] = [
			{
				id: "e1",
				ts: 1000,
				type: "tool_call",
				toolCallId: "tc1",
				tool: "write_to_file",
				args: { path: "test.ts", content: "x" },
			} as DomainEvent,
			{
				id: "e2",
				ts: 1001,
				type: "tool_result",
				parentId: "e1",
				toolCallId: "tc1",
				tool: "write_to_file",
				success: false,
				error: "Permission denied",
			} as DomainEvent,
		]
		const turns = toConversationTurns(events)
		if (turns[1]?.role === "user") {
			const result = turns[1].content[0]
			if (result.type === "tool_result") {
				expect(result.content).toBe("Permission denied")
				expect(result.isError).toBe(true)
			}
		}
	})

	test("reasoning events become reasoning content blocks", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "user_text", content: "Think about this" },
			{ id: "e2", ts: 1001, type: "assistant_reasoning", content: "Let me think...", partial: false },
			{ id: "e3", ts: 1002, type: "assistant_text", content: "Here's my answer", partial: false },
		]
		const turns = toConversationTurns(events)
		expect(turns).toHaveLength(2) // user, assistant
		if (turns[1].role === "assistant") {
			expect(turns[1].content).toHaveLength(2)
			expect(turns[1].content[0]).toMatchObject({ type: "reasoning", text: "Let me think..." })
			expect(turns[1].content[1]).toMatchObject({ type: "text", text: "Here's my answer" })
		}
	})

	test("condense event replaces a range of events", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "user_text", content: "First message" },
			{ id: "e2", ts: 1001, type: "assistant_text", content: "First reply", partial: false },
			{ id: "e3", ts: 1002, type: "user_text", content: "Second message" },
			{ id: "e4", ts: 1003, type: "assistant_text", content: "Second reply", partial: false },
			{
				id: "e5",
				ts: 1004,
				type: "condense",
				summary: "Summary of conversation so far",
				cost: 0.01,
				prevContextTokens: 5000,
				newContextTokens: 500,
				replacesFrom: "e1",
				replacesTo: "e4",
			},
			{ id: "e6", ts: 1005, type: "user_text", content: "New message after condense" },
		]
		const turns = toConversationTurns(events)
		// condense summary and new user message merge into one user turn (no assistant turn between them)
		expect(turns).toHaveLength(1)
		if (turns[0].role === "user") {
			expect(turns[0].content).toHaveLength(2)
			expect(turns[0].content[0]).toMatchObject({ type: "text", text: "Summary of conversation so far" })
			expect(turns[0].content[1]).toMatchObject({ type: "text", text: "New message after condense" })
		}
	})

	test("non-conversation events are skipped", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "user_text", content: "Hello" },
			{ id: "e2", ts: 1001, type: "api_request_started", protocol: "anthropic" },
			{ id: "e3", ts: 1002, type: "assistant_text", content: "Hi", partial: false },
			{
				id: "e4",
				ts: 1003,
				type: "api_request_finished",
				parentId: "e2",
				tokensIn: 100,
				tokensOut: 50,
				cost: 0.01,
			},
			{ id: "e5", ts: 1004, type: "checkpoint" },
			{ id: "e6", ts: 1005, type: "error", message: "oops", recoverable: true },
		]
		const turns = toConversationTurns(events)
		expect(turns).toHaveLength(2) // user + assistant only
		expect(turns[0].role).toBe("user")
		expect(turns[1].role).toBe("assistant")
	})

	test("multiple consecutive user events merge into one turn", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "user_text", content: "Part 1" },
			{ id: "e2", ts: 1001, type: "user_feedback", content: "Part 2" },
		]
		const turns = toConversationTurns(events)
		expect(turns).toHaveLength(1)
		if (turns[0].role === "user") {
			expect(turns[0].content).toHaveLength(2)
			expect(turns[0].content[0]).toMatchObject({ type: "text", text: "Part 1" })
			expect(turns[0].content[1]).toMatchObject({ type: "text", text: "Part 2" })
		}
	})
})
