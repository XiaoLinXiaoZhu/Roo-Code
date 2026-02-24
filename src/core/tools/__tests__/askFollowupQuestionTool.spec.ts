import { askFollowupQuestionTool } from "../AskFollowupQuestionTool"
import { ToolUse } from "../../../shared/tools"
import { NativeToolCallParser } from "../../assistant-message/NativeToolCallParser"

describe("askFollowupQuestionTool", () => {
	let mockCline: any
	let mockPushToolResult: any
	let toolResult: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockCline = {
			ask: vi.fn().mockResolvedValue({ text: "Test response" }),
			say: vi.fn().mockResolvedValue(undefined),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
		}

		mockPushToolResult = vi.fn((result) => {
			toolResult = result
		})
	})

	it("should parse suggestions without mode attributes", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "ask_followup_question",
			params: {
				question: "What would you like to do?",
			},
			nativeArgs: {
				type: "goal_discovery",
				question: "What would you like to do?",
				follow_up: [
					{ choice: "Option 1", affect: "Does option 1" },
					{ choice: "Option 2", affect: "Does option 2" },
				],
			},
			partial: false,
		}

		await askFollowupQuestionTool.handle(mockCline, block as ToolUse<"ask_followup_question">, {
			askApproval: vi.fn(),
			handleError: vi.fn(),
			pushToolResult: mockPushToolResult,
		})

		expect(mockCline.ask).toHaveBeenCalledWith(
			"followup",
			expect.stringContaining(
				'"suggest":[{"answer":"Option 1","affect":"Does option 1"},{"answer":"Option 2","affect":"Does option 2"}]',
			),
			false,
		)
	})

	it("should parse suggestions with mode attributes", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "ask_followup_question",
			params: {
				question: "What would you like to do?",
			},
			nativeArgs: {
				type: "honest_uncertainty",
				question: "What would you like to do?",
				follow_up: [
					{ choice: "Write code", affect: "Proceed with implementation" },
					{ choice: "Debug issue", affect: "Investigate and diagnose the problem" },
				],
			},
			partial: false,
		}

		await askFollowupQuestionTool.handle(mockCline, block as ToolUse<"ask_followup_question">, {
			askApproval: vi.fn(),
			handleError: vi.fn(),
			pushToolResult: mockPushToolResult,
		})

		expect(mockCline.ask).toHaveBeenCalledWith(
			"followup",
			expect.stringContaining(
				'"suggest":[{"answer":"Write code","affect":"Proceed with implementation"},{"answer":"Debug issue","affect":"Investigate and diagnose the problem"}]',
			),
			false,
		)
	})

	it("should handle mixed suggestions with and without mode attributes", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "ask_followup_question",
			params: {
				question: "What would you like to do?",
			},
			nativeArgs: {
				type: "passive_verification",
				question: "What would you like to do?",
				follow_up: [
					{ choice: "Regular option", affect: "Proceed normally" },
					{ choice: "Plan architecture", affect: "Step back and plan the architecture first" },
				],
			},
			partial: false,
		}

		await askFollowupQuestionTool.handle(mockCline, block as ToolUse<"ask_followup_question">, {
			askApproval: vi.fn(),
			handleError: vi.fn(),
			pushToolResult: mockPushToolResult,
		})

		expect(mockCline.ask).toHaveBeenCalledWith(
			"followup",
			expect.stringContaining(
				'"suggest":[{"answer":"Regular option","affect":"Proceed normally"},{"answer":"Plan architecture","affect":"Step back and plan the architecture first"}]',
			),
			false,
		)
	})

	describe("parameter validation", () => {
		it("should handle missing follow_up parameter", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "ask_followup_question",
				params: {
					question: "What would you like to do?",
				},
				nativeArgs: {
					type: "goal_discovery" as const,
					question: "What would you like to do?",
					follow_up: undefined as any,
				},
				partial: false,
			}

			await askFollowupQuestionTool.handle(mockCline, block as ToolUse<"ask_followup_question">, {
				askApproval: vi.fn(),
				handleError: vi.fn(),
				pushToolResult: mockPushToolResult,
			})

			expect(mockCline.sayAndCreateMissingParamError).toHaveBeenCalledWith("ask_followup_question", "follow_up")
			expect(mockCline.recordToolError).toHaveBeenCalledWith("ask_followup_question")
			expect(mockCline.didToolFailInCurrentTurn).toBe(true)
			expect(mockCline.consecutiveMistakeCount).toBe(1)
			expect(mockCline.ask).not.toHaveBeenCalled()
		})

		it("should handle null follow_up parameter", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "ask_followup_question",
				params: {
					question: "What would you like to do?",
				},
				nativeArgs: {
					type: "goal_discovery" as const,
					question: "What would you like to do?",
					follow_up: null as any,
				},
				partial: false,
			}

			await askFollowupQuestionTool.handle(mockCline, block as ToolUse<"ask_followup_question">, {
				askApproval: vi.fn(),
				handleError: vi.fn(),
				pushToolResult: mockPushToolResult,
			})

			expect(mockCline.sayAndCreateMissingParamError).toHaveBeenCalledWith("ask_followup_question", "follow_up")
			expect(mockCline.recordToolError).toHaveBeenCalledWith("ask_followup_question")
			expect(mockCline.didToolFailInCurrentTurn).toBe(true)
			expect(mockCline.consecutiveMistakeCount).toBe(1)
			expect(mockCline.ask).not.toHaveBeenCalled()
		})

		it("should handle non-array follow_up parameter", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "ask_followup_question",
				params: {
					question: "What would you like to do?",
				},
				nativeArgs: {
					question: "What would you like to do?",
					follow_up: "not an array" as any,
				} as any,
				partial: false,
			}

			await askFollowupQuestionTool.handle(mockCline, block as ToolUse<"ask_followup_question">, {
				askApproval: vi.fn(),
				handleError: vi.fn(),
				pushToolResult: mockPushToolResult,
			})

			expect(mockCline.sayAndCreateMissingParamError).toHaveBeenCalledWith("ask_followup_question", "follow_up")
			expect(mockCline.recordToolError).toHaveBeenCalledWith("ask_followup_question")
			expect(mockCline.didToolFailInCurrentTurn).toBe(true)
			expect(mockCline.consecutiveMistakeCount).toBe(1)
			expect(mockCline.ask).not.toHaveBeenCalled()
		})
	})

	describe("handlePartial with native protocol", () => {
		it("should only send question during partial streaming to avoid raw JSON display", async () => {
			const block: ToolUse<"ask_followup_question"> = {
				type: "tool_use",
				name: "ask_followup_question",
				params: {
					question: "What would you like to do?",
				},
				partial: true,
				nativeArgs: {
					type: "goal_discovery",
					question: "What would you like to do?",
					follow_up: [
						{ choice: "Option 1", affect: "Does option 1" },
						{ choice: "Option 2", affect: "Does option 2" },
					],
				},
			}

			await askFollowupQuestionTool.handle(mockCline, block, {
				askApproval: vi.fn(),
				handleError: vi.fn(),
				pushToolResult: mockPushToolResult,
			})

			// During partial streaming, only the question should be sent (not JSON with suggestions)
			expect(mockCline.ask).toHaveBeenCalledWith("followup", "What would you like to do?", true)
		})

		it("should handle partial with question from params", async () => {
			const block: ToolUse<"ask_followup_question"> = {
				type: "tool_use",
				name: "ask_followup_question",
				params: {
					question: "Choose wisely",
				},
				partial: true,
			}

			await askFollowupQuestionTool.handle(mockCline, block, {
				askApproval: vi.fn(),
				handleError: vi.fn(),
				pushToolResult: mockPushToolResult,
			})

			expect(mockCline.ask).toHaveBeenCalledWith("followup", "Choose wisely", true)
		})
	})

	describe("NativeToolCallParser.createPartialToolUse for ask_followup_question", () => {
		beforeEach(() => {
			NativeToolCallParser.clearAllStreamingToolCalls()
			NativeToolCallParser.clearRawChunkState()
		})

		it("should build nativeArgs with question and follow_up during streaming", () => {
			// Start a streaming tool call
			NativeToolCallParser.startStreamingToolCall("call_123", "ask_followup_question")

			// Simulate streaming JSON chunks
			const chunk1 =
				'{"type":"goal_discovery","question":"What would you like?","follow_up":[{"choice":"Option 1","affect":"Does option 1"}'
			const result1 = NativeToolCallParser.processStreamingChunk("call_123", chunk1)

			expect(result1).not.toBeNull()
			expect(result1?.name).toBe("ask_followup_question")
			expect(result1?.params.question).toBe("What would you like?")
			expect(result1?.nativeArgs).toBeDefined()
			// Use type assertion to access the specific fields
			const nativeArgs = result1?.nativeArgs as {
				type: string
				question: string
				follow_up?: Array<{ choice: string; affect: string }>
			}
			expect(nativeArgs?.type).toBe("goal_discovery")
			expect(nativeArgs?.question).toBe("What would you like?")
			// partial-json should parse the incomplete array
			expect(nativeArgs?.follow_up).toBeDefined()
		})

		it("should finalize with complete nativeArgs", () => {
			NativeToolCallParser.startStreamingToolCall("call_456", "ask_followup_question")

			// Add complete JSON
			const completeJson =
				'{"type":"goal_discovery","question":"Choose an option","follow_up":[{"choice":"Yes","affect":"Confirm"},{"choice":"No","affect":"Decline"}]}'
			NativeToolCallParser.processStreamingChunk("call_456", completeJson)

			const result = NativeToolCallParser.finalizeStreamingToolCall("call_456")

			expect(result).not.toBeNull()
			expect(result?.type).toBe("tool_use")
			expect(result?.name).toBe("ask_followup_question")
			expect(result?.partial).toBe(false)
			// Type guard: regular tools have type 'tool_use', MCP tools have type 'mcp_tool_use'
			if (result?.type === "tool_use") {
				expect(result.nativeArgs).toEqual({
					type: "goal_discovery",
					question: "Choose an option",
					follow_up: [
						{ choice: "Yes", affect: "Confirm" },
						{ choice: "No", affect: "Decline" },
					],
				})
			}
		})
	})
})
