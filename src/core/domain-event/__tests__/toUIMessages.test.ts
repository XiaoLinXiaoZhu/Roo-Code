import type { DomainEvent } from "@roo-code/types"
import { toUIMessages } from "../toUIMessages"

describe("toUIMessages", () => {
	test("empty events produce empty messages", () => {
		expect(toUIMessages([])).toEqual([])
	})

	test("user_text maps to say user_feedback", () => {
		const events: DomainEvent[] = [{ id: "e1", ts: 1000, type: "user_text", content: "Hello", images: ["img1"] }]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0]).toMatchObject({
			ts: 1000,
			type: "say",
			say: "user_feedback",
			text: "Hello",
			images: ["img1"],
		})
	})

	test("api_request_started maps correctly", () => {
		const events: DomainEvent[] = [{ id: "e1", ts: 1000, type: "api_request_started", protocol: "anthropic" }]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0]).toMatchObject({
			ts: 1000,
			type: "say",
			say: "api_req_started",
			apiProtocol: "anthropic",
		})
		// text contains JSON with token info
		const parsed = JSON.parse(msgs[0].text!)
		expect(parsed).toMatchObject({ tokensIn: 0, tokensOut: 0, cost: 0 })
	})

	test("api_request_finished maps to say api_req_finished", () => {
		const events: DomainEvent[] = [
			{
				id: "e1",
				ts: 1000,
				type: "api_request_finished",
				parentId: "e0",
				tokensIn: 100,
				tokensOut: 50,
				cost: 0.01,
			},
		]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0].say).toBe("api_req_finished")
	})

	test("assistant_text maps to say text", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "assistant_text", content: "Hello!", partial: false },
		]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0]).toMatchObject({
			ts: 1000,
			type: "say",
			say: "text",
			text: "Hello!",
			partial: false,
		})
	})

	test("assistant_reasoning maps to say reasoning", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "assistant_reasoning", content: "Thinking...", partial: true },
		]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0]).toMatchObject({
			ts: 1000,
			type: "say",
			say: "reasoning",
			reasoning: "Thinking...",
			partial: true,
		})
	})

	test("tool_call maps to ask tool with JSON text", () => {
		const events: DomainEvent[] = [
			{
				id: "e1",
				ts: 1000,
				type: "tool_call",
				toolCallId: "tc1",
				tool: "read_file",
				args: { path: "test.ts" },
			} as DomainEvent,
		]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0].type).toBe("ask")
		expect(msgs[0].ask).toBe("tool")

		const toolData = JSON.parse(msgs[0].text!)
		expect(toolData.tool).toBe("readFile")
		expect(toolData.path).toBe("test.ts")
	})

	test("execute_command tool_result maps to say command_output", () => {
		const events: DomainEvent[] = [
			{
				id: "e1",
				ts: 1000,
				type: "tool_result",
				parentId: "e0",
				toolCallId: "tc1",
				tool: "execute_command",
				exitCode: 0,
				stdout: "output here",
				stderr: "",
			} as DomainEvent,
		]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0]).toMatchObject({
			type: "say",
			say: "command_output",
			text: "output here",
		})
	})

	test("attempt_completion tool_result maps to say completion_result", () => {
		const events: DomainEvent[] = [
			{
				id: "e1",
				ts: 1000,
				type: "tool_result",
				parentId: "e0",
				toolCallId: "tc1",
				tool: "attempt_completion",
				accepted: true,
				feedback: "Looks good!",
			} as DomainEvent,
		]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0]).toMatchObject({
			type: "say",
			say: "completion_result",
			text: "Looks good!",
		})
	})

	test("error maps to say error", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "error", message: "Something went wrong", recoverable: false },
		]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0]).toMatchObject({
			type: "say",
			say: "error",
			text: "Something went wrong",
		})
	})

	test("condense maps with contextCondense data", () => {
		const events: DomainEvent[] = [
			{
				id: "e1",
				ts: 1000,
				type: "condense",
				summary: "Conversation summary",
				cost: 0.005,
				prevContextTokens: 50000,
				newContextTokens: 5000,
				replacesFrom: "e0",
				replacesTo: "e0",
			},
		]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0].say).toBe("condense_context")
		expect(msgs[0].contextCondense).toMatchObject({
			cost: 0.005,
			prevContextTokens: 50000,
			newContextTokens: 5000,
			summary: "Conversation summary",
		})
	})

	test("truncation maps with contextTruncation data", () => {
		const events: DomainEvent[] = [
			{
				id: "e1",
				ts: 1000,
				type: "truncation",
				messagesRemoved: 10,
				prevContextTokens: 100000,
				newContextTokens: 50000,
			},
		]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0].say).toBe("sliding_window_truncation")
		expect(msgs[0].contextTruncation).toMatchObject({
			truncationId: "e1",
			messagesRemoved: 10,
		})
	})

	test("checkpoint maps to say checkpoint_saved", () => {
		const events: DomainEvent[] = [{ id: "e1", ts: 1000, type: "checkpoint" }]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0].say).toBe("checkpoint_saved")
	})

	test("tool_approval_request produces no message", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "tool_approval_request", parentId: "e0", toolCallId: "tc1" },
		]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(0)
	})

	test("tool_approval_response with feedback produces user_feedback", () => {
		const events: DomainEvent[] = [
			{
				id: "e1",
				ts: 1000,
				type: "tool_approval_response",
				parentId: "e0",
				approved: true,
				feedback: "Looks good",
			},
		]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(1)
		expect(msgs[0]).toMatchObject({
			type: "say",
			say: "user_feedback",
			text: "Looks good",
		})
	})

	test("tool_approval_response without feedback produces no message", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "tool_approval_response", parentId: "e0", approved: true },
		]
		const msgs = toUIMessages(events)
		expect(msgs).toHaveLength(0)
	})

	test("full conversation flow produces correct UI messages", () => {
		const events: DomainEvent[] = [
			{ id: "e1", ts: 1000, type: "user_text", content: "Read test.ts" },
			{ id: "e2", ts: 1001, type: "api_request_started", protocol: "anthropic" },
			{ id: "e3", ts: 1002, type: "assistant_text", content: "I'll read that file.", partial: false },
			{
				id: "e4",
				ts: 1003,
				type: "tool_call",
				toolCallId: "tc1",
				tool: "read_file",
				args: { path: "test.ts" },
			} as DomainEvent,
			{
				id: "e5",
				ts: 1004,
				type: "api_request_finished",
				parentId: "e2",
				tokensIn: 500,
				tokensOut: 200,
				cost: 0.01,
			},
			{ id: "e6", ts: 1005, type: "error", message: "Network issue", recoverable: true },
		]
		const msgs = toUIMessages(events)

		const types = msgs.map((m) => m.say ?? m.ask)
		expect(types).toEqual(["user_feedback", "api_req_started", "text", "tool", "api_req_finished", "error"])
	})
})
