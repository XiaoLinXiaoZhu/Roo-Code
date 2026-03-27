// pnpm --filter @roo-code/types test src/__tests__/domain-event.test.ts

import type {
	DomainEvent,
	DomainEventByType,
	ToolCallEvent,
	ToolCallByName,
	ToolResultEvent,
	ToolResultByName,
} from "../domain-event.js"

describe("DomainEvent type system", () => {
	/**
	 * 测试事件创建和类型窄化
	 */
	describe("event creation and narrowing", () => {
		test("UserTextEvent can be created with correct shape", () => {
			const event: DomainEvent = {
				id: "evt_001",
				ts: Date.now(),
				type: "user_text",
				content: "Hello, world!",
				images: ["data:image/png;base64,..."],
			}
			expect(event.type).toBe("user_text")
			if (event.type === "user_text") {
				expect(event.content).toBe("Hello, world!")
				expect(event.images).toHaveLength(1)
			}
		})

		test("AssistantTextEvent supports partial streaming", () => {
			const event: DomainEvent = {
				id: "evt_002",
				ts: Date.now(),
				type: "assistant_text",
				content: "I'll help you with",
				partial: true,
			}
			if (event.type === "assistant_text") {
				expect(event.partial).toBe(true)
			}
		})

		test("ApiRequestFinishedEvent has required parentId", () => {
			const event: DomainEvent = {
				id: "evt_003",
				ts: Date.now(),
				type: "api_request_finished",
				parentId: "evt_002",
				tokensIn: 1000,
				tokensOut: 500,
				cost: 0.01,
			}
			if (event.type === "api_request_finished") {
				expect(event.parentId).toBe("evt_002")
				expect(event.cost).toBe(0.01)
			}
		})
	})

	describe("tool call discriminated union", () => {
		test("ToolCallEvent narrows by tool field", () => {
			const toolCall: ToolCallEvent = {
				id: "evt_010",
				ts: Date.now(),
				type: "tool_call",
				toolCallId: "toolu_abc123",
				tool: "read_file",
				args: { path: "src/index.ts", start_line: 1, end_line: 50 },
			}

			if (toolCall.tool === "read_file") {
				// TypeScript 应该能窄化到 ReadFileToolCall
				expect(toolCall.args.path).toBe("src/index.ts")
				expect(toolCall.args.start_line).toBe(1)
			}
		})

		test("ExecuteCommandToolCall has correct args shape", () => {
			const toolCall: ToolCallEvent = {
				id: "evt_011",
				ts: Date.now(),
				type: "tool_call",
				toolCallId: "toolu_def456",
				tool: "execute_command",
				args: { command: "ls -la", cwd: "/tmp" },
			}

			if (toolCall.tool === "execute_command") {
				expect(toolCall.args.command).toBe("ls -la")
				expect(toolCall.args.cwd).toBe("/tmp")
			}
		})

		test("ExecToolCall has runtime and timeout args", () => {
			const toolCall: ToolCallEvent = {
				id: "evt_012",
				ts: Date.now(),
				type: "tool_call",
				toolCallId: "toolu_ghi789",
				tool: "exec",
				args: { script: "echo hello", runtime: "bun", timeout: 30 },
			}

			if (toolCall.tool === "exec") {
				expect(toolCall.args.runtime).toBe("bun")
				expect(toolCall.args.timeout).toBe(30)
			}
		})
	})

	describe("tool result discriminated union", () => {
		test("ToolResultEvent narrows by tool field", () => {
			const result: ToolResultEvent = {
				id: "evt_020",
				ts: Date.now(),
				type: "tool_result",
				parentId: "evt_010",
				toolCallId: "toolu_abc123",
				tool: "read_file",
				content: "file content here",
				truncated: false,
			}

			if (result.tool === "read_file") {
				expect(result.content).toBe("file content here")
				expect(result.truncated).toBe(false)
			}
		})

		test("ExecuteCommandToolResult has exit code and output", () => {
			const result: ToolResultEvent = {
				id: "evt_021",
				ts: Date.now(),
				type: "tool_result",
				parentId: "evt_011",
				toolCallId: "toolu_def456",
				tool: "execute_command",
				exitCode: 0,
				stdout: "hello\n",
				stderr: "",
			}

			if (result.tool === "execute_command") {
				expect(result.exitCode).toBe(0)
				expect(result.stdout).toBe("hello\n")
			}
		})
	})

	describe("helper types", () => {
		test("ToolCallByName narrows correctly", () => {
			// 类型级别测试：确保 ToolCallByName<"read_file"> 等价于 ReadFileToolCall
			const call: ToolCallByName<"read_file"> = {
				id: "evt_030",
				ts: Date.now(),
				type: "tool_call",
				toolCallId: "toolu_xxx",
				tool: "read_file",
				args: { path: "test.ts" },
			}
			expect(call.tool).toBe("read_file")
		})

		test("ToolResultByName narrows correctly", () => {
			const result: ToolResultByName<"execute_command"> = {
				id: "evt_031",
				ts: Date.now(),
				type: "tool_result",
				parentId: "evt_011",
				toolCallId: "toolu_xxx",
				tool: "execute_command",
				exitCode: 0,
				stdout: "",
				stderr: "",
			}
			expect(result.exitCode).toBe(0)
		})

		test("DomainEventByType narrows correctly", () => {
			const event: DomainEventByType<"condense"> = {
				id: "evt_032",
				ts: Date.now(),
				type: "condense",
				summary: "Previous conversation summary...",
				cost: 0.005,
				prevContextTokens: 50000,
				newContextTokens: 5000,
				replacesFrom: "evt_001",
				replacesTo: "evt_020",
			}
			expect(event.summary).toContain("summary")
		})
	})

	describe("event relationships via parentId", () => {
		test("tool lifecycle: call → approval → result", () => {
			const events: DomainEvent[] = []

			// 1. 工具调用
			const toolCall: DomainEvent = {
				id: "evt_100",
				ts: 1000,
				type: "tool_call",
				toolCallId: "toolu_001",
				tool: "write_to_file",
				args: { path: "test.txt", content: "hello" },
			}
			events.push(toolCall)

			// 2. 审批请求
			const approvalReq: DomainEvent = {
				id: "evt_101",
				ts: 1001,
				type: "tool_approval_request",
				parentId: "evt_100",
				toolCallId: "toolu_001",
			}
			events.push(approvalReq)

			// 3. 审批响应
			const approvalResp: DomainEvent = {
				id: "evt_102",
				ts: 1002,
				type: "tool_approval_response",
				parentId: "evt_101",
				approved: true,
			}
			events.push(approvalResp)

			// 4. 工具结果
			const toolResult: DomainEvent = {
				id: "evt_103",
				ts: 1003,
				type: "tool_result",
				parentId: "evt_100",
				toolCallId: "toolu_001",
				tool: "write_to_file",
				success: true,
				diff: "+hello",
			}
			events.push(toolResult)

			// 验证事件链
			expect(events).toHaveLength(4)

			// 通过 parentId 可以追溯关联
			const resultsForCall = events.filter((e) => e.parentId === "evt_100")
			expect(resultsForCall).toHaveLength(2) // approval_request + tool_result
		})

		test("API request lifecycle: start → finish", () => {
			const events: DomainEvent[] = [
				{
					id: "evt_200",
					ts: 2000,
					type: "api_request_started",
					protocol: "anthropic",
				},
				{
					id: "evt_201",
					ts: 2500,
					type: "api_request_finished",
					parentId: "evt_200",
					tokensIn: 5000,
					tokensOut: 1000,
					cost: 0.02,
				},
			]

			const finished = events.find((e) => e.type === "api_request_finished")
			expect(finished?.parentId).toBe("evt_200")
		})
	})

	describe("condense and truncation events", () => {
		test("CondenseEvent replaces a range of events", () => {
			const condense: DomainEvent = {
				id: "evt_300",
				ts: 3000,
				type: "condense",
				summary: "User asked to refactor the auth module. Assistant made changes to 3 files.",
				cost: 0.005,
				prevContextTokens: 100000,
				newContextTokens: 10000,
				replacesFrom: "evt_001",
				replacesTo: "evt_200",
			}

			if (condense.type === "condense") {
				expect(condense.replacesFrom).toBe("evt_001")
				expect(condense.replacesTo).toBe("evt_200")
				expect(condense.newContextTokens).toBeLessThan(condense.prevContextTokens)
			}
		})

		test("TruncationEvent records removed message count", () => {
			const truncation: DomainEvent = {
				id: "evt_301",
				ts: 3001,
				type: "truncation",
				messagesRemoved: 20,
				prevContextTokens: 100000,
				newContextTokens: 50000,
			}

			if (truncation.type === "truncation") {
				expect(truncation.messagesRemoved).toBe(20)
			}
		})
	})
})
