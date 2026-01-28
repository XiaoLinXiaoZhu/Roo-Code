import { describe, it, expect, beforeEach } from "vitest"
import {
	MarkdownToolParser,
	ParserState,
	mayContainMarkdownTool,
	extractMarkdownTools,
	type MarkdownToolEvent,
} from "../MarkdownToolParser"

describe("MarkdownToolParser", () => {
	let parser: MarkdownToolParser

	beforeEach(() => {
		parser = new MarkdownToolParser()
	})

	describe("基本解析", () => {
		it("应该解析简单的 write_to 工具调用", () => {
			const input = `\`\`\`write_to src/app.ts
function hello() {
  return "world";
}
\`\`\``

			const events = parser.processChunk(input)
			events.push(...parser.finalize())

			// 验证事件序列
			const startEvent = events.find((e) => e.type === "tool_start")
			const endEvent = events.find((e) => e.type === "tool_end")
			const deltaEvents = events.filter((e) => e.type === "tool_delta")

			expect(startEvent).toBeDefined()
			expect(startEvent?.type).toBe("tool_start")
			if (startEvent?.type === "tool_start") {
				expect(startEvent.toolName).toBe("write_to_file")
				expect(startEvent.path).toBe("src/app.ts")
			}

			expect(endEvent).toBeDefined()
			expect(deltaEvents.length).toBeGreaterThan(0)

			// 验证内容
			const content = deltaEvents
				.filter((e): e is Extract<MarkdownToolEvent, { type: "tool_delta" }> => e.type === "tool_delta")
				.map((e) => e.contentDelta)
				.join("")

			expect(content).toBe('function hello() {\n  return "world";\n}\n')
		})

		it("应该解析 apply_diff 工具调用", () => {
			const input = `\`\`\`apply_diff src/utils.ts
<<<<<<< SEARCH
:start_line:10
-------
old code
=======
new code
>>>>>>> REPLACE
\`\`\``

			const events = parser.processChunk(input)
			events.push(...parser.finalize())

			const startEvent = events.find((e) => e.type === "tool_start")
			expect(startEvent?.type).toBe("tool_start")
			if (startEvent?.type === "tool_start") {
				expect(startEvent.toolName).toBe("apply_diff")
				expect(startEvent.path).toBe("src/utils.ts")
			}
		})

		it("应该拒绝不支持的工具名", () => {
			const input = `\`\`\`javascript
console.log("hello");
\`\`\``

			const events = parser.processChunk(input)
			events.push(...parser.finalize())

			// 应该作为普通文本处理
			const textEvents = events.filter((e) => e.type === "text")
			expect(textEvents.length).toBeGreaterThan(0)

			// 不应该有工具事件
			const toolEvents = events.filter((e) => e.type === "tool_start" || e.type === "tool_end")
			expect(toolEvents.length).toBe(0)
		})
	})

	describe("流式解析", () => {
		it("应该正确处理分块输入", () => {
			const chunks = ["```write_to ", "src/app.ts\n", "function ", "hello() {\n", "  return 1;\n", "}\n", "```"]

			const allEvents: MarkdownToolEvent[] = []
			for (const chunk of chunks) {
				allEvents.push(...parser.processChunk(chunk))
			}
			allEvents.push(...parser.finalize())

			const startEvent = allEvents.find((e) => e.type === "tool_start")
			const endEvent = allEvents.find((e) => e.type === "tool_end")

			expect(startEvent).toBeDefined()
			expect(endEvent).toBeDefined()

			if (startEvent?.type === "tool_start") {
				expect(startEvent.toolName).toBe("write_to_file")
				expect(startEvent.path).toBe("src/app.ts")
			}
		})

		it("应该在每个 delta 后更新 buildToolUse", () => {
			parser.processChunk("```write_to src/test.ts\n")

			// 第一个 delta
			parser.processChunk("line1\n")
			let toolUse = parser.buildToolUse(true)
			expect(toolUse).toBeDefined()
			expect(toolUse?.params.content).toBe("line1\n")

			// 第二个 delta
			parser.processChunk("line2\n")
			toolUse = parser.buildToolUse(true)
			expect(toolUse?.params.content).toBe("line1\nline2\n")

			// 完成
			parser.processChunk("```")
			parser.finalize()
			toolUse = parser.buildToolUse(false)
			expect(toolUse?.partial).toBe(false)
		})
	})

	describe("嵌套代码块处理", () => {
		it("应该正确处理内容中的短 fence", () => {
			const input = `\`\`\`\`write_to README.md
# Example

\`\`\`javascript
console.log("hello");
\`\`\`

End of file.
\`\`\`\``

			const events = parser.processChunk(input)
			events.push(...parser.finalize())

			const startEvent = events.find((e) => e.type === "tool_start")
			const endEvent = events.find((e) => e.type === "tool_end")

			expect(startEvent).toBeDefined()
			expect(endEvent).toBeDefined()

			// 验证内容包含嵌套的代码块
			const content = events
				.filter((e): e is Extract<MarkdownToolEvent, { type: "tool_delta" }> => e.type === "tool_delta")
				.map((e) => e.contentDelta)
				.join("")

			expect(content).toContain("```javascript")
			expect(content).toContain("```\n")
		})

		it("应该使用动态 fence 长度", () => {
			// 5 个反引号开始
			const input = `\`\`\`\`\`write_to test.md
Content with \`\`\`\` four backticks
\`\`\`\`\``

			const events = parser.processChunk(input)
			events.push(...parser.finalize())

			const startEvent = events.find((e) => e.type === "tool_start")
			const endEvent = events.find((e) => e.type === "tool_end")

			expect(startEvent).toBeDefined()
			expect(endEvent).toBeDefined()

			const content = events
				.filter((e): e is Extract<MarkdownToolEvent, { type: "tool_delta" }> => e.type === "tool_delta")
				.map((e) => e.contentDelta)
				.join("")

			expect(content).toContain("````")
		})
	})

	describe("边界情况", () => {
		it("应该处理空内容", () => {
			const input = `\`\`\`write_to empty.ts
\`\`\``

			const events = parser.processChunk(input)
			events.push(...parser.finalize())

			const startEvent = events.find((e) => e.type === "tool_start")
			const endEvent = events.find((e) => e.type === "tool_end")

			expect(startEvent).toBeDefined()
			expect(endEvent).toBeDefined()

			const content = events
				.filter((e): e is Extract<MarkdownToolEvent, { type: "tool_delta" }> => e.type === "tool_delta")
				.map((e) => e.contentDelta)
				.join("")

			expect(content).toBe("")
		})

		it("应该处理缺少结束 fence 的情况", () => {
			const input = `\`\`\`write_to incomplete.ts
function test() {
  // no closing fence`

			const events = parser.processChunk(input)
			events.push(...parser.finalize())

			// finalize 应该强制完成
			const endEvent = events.find((e) => e.type === "tool_end")
			expect(endEvent).toBeDefined()
		})

		it("应该处理只有 fence 开始的情况", () => {
			const input = "``"

			const events = parser.processChunk(input)
			events.push(...parser.finalize())

			// 应该作为普通文本
			const textEvents = events.filter((e) => e.type === "text")
			expect(textEvents.length).toBeGreaterThan(0)
		})

		it("应该处理无效的 header 格式", () => {
			const input = `\`\`\`write_to
content without path
\`\`\``

			const events = parser.processChunk(input)
			events.push(...parser.finalize())

			// 应该作为普通文本
			const toolStartEvents = events.filter((e) => e.type === "tool_start")
			expect(toolStartEvents.length).toBe(0)
		})

		it("应该处理路径中的空格", () => {
			const input = `\`\`\`write_to path/with spaces/file.ts
content
\`\`\``

			const events = parser.processChunk(input)
			events.push(...parser.finalize())

			const startEvent = events.find((e) => e.type === "tool_start")
			expect(startEvent).toBeDefined()
			if (startEvent?.type === "tool_start") {
				expect(startEvent.path).toBe("path/with spaces/file.ts")
			}
		})

		it("应该忽略不在行首的代码块", () => {
			const input = `Some text \`\`\`write_to file.ts
content
\`\`\``

			const events = parser.processChunk(input)
			events.push(...parser.finalize())

			// 不应该有工具事件
			const toolStartEvents = events.filter((e) => e.type === "tool_start")
			expect(toolStartEvents.length).toBe(0)

			// 应该全部作为普通文本
			const textEvents = events.filter((e) => e.type === "text")
			expect(textEvents.length).toBeGreaterThan(0)
		})

		it("应该解析换行后的代码块", () => {
			const input = `Some text before
\`\`\`write_to file.ts
content
\`\`\``

			const events = parser.processChunk(input)
			events.push(...parser.finalize())

			// 应该有工具事件
			const startEvent = events.find((e) => e.type === "tool_start")
			expect(startEvent).toBeDefined()
			if (startEvent?.type === "tool_start") {
				expect(startEvent.toolName).toBe("write_to_file")
				expect(startEvent.path).toBe("file.ts")
			}
		})
	})

	describe("状态管理", () => {
		it("应该正确报告解析状态", () => {
			expect(parser.getState()).toBe(ParserState.IDLE)

			parser.processChunk("```write_to test.ts\n")
			expect(parser.getState()).toBe(ParserState.CONTENT_ACCUMULATING)
			expect(parser.isParsingTool()).toBe(true)

			parser.processChunk("content\n```")
			parser.finalize()
			expect(parser.getState()).toBe(ParserState.IDLE)
			expect(parser.isParsingTool()).toBe(false)
		})

		it("应该在 reset 后清除状态", () => {
			parser.processChunk("```write_to test.ts\ncontent")
			expect(parser.isParsingTool()).toBe(true)

			parser.reset()
			expect(parser.isParsingTool()).toBe(false)
			expect(parser.getState()).toBe(ParserState.IDLE)
		})

		it("应该提供当前工具信息", () => {
			parser.processChunk("```write_to src/app.ts\nhello")

			expect(parser.getCurrentToolId()).toBeDefined()
			expect(parser.getCurrentPath()).toBe("src/app.ts")
			expect(parser.getCurrentContent()).toBe("hello")
		})
	})

	describe("buildToolUse", () => {
		it("应该构建正确的 write_to_file ToolUse", () => {
			parser.processChunk("```write_to src/test.ts\nconst x = 1;\n```")
			parser.finalize()

			const toolUse = parser.buildToolUse(false)
			expect(toolUse).toBeDefined()
			expect(toolUse?.type).toBe("tool_use")
			expect(toolUse?.name).toBe("write_to_file")
			expect(toolUse?.params.path).toBe("src/test.ts")
			expect(toolUse?.params.content).toBe("const x = 1;\n")
			expect(toolUse?.nativeArgs).toEqual({
				path: "src/test.ts",
				content: "const x = 1;\n",
			})
		})

		it("应该构建正确的 apply_diff ToolUse", () => {
			const diffContent = "<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n"
			parser.processChunk(`\`\`\`apply_diff src/file.ts\n${diffContent}\`\`\``)
			parser.finalize()

			const toolUse = parser.buildToolUse(false)
			expect(toolUse).toBeDefined()
			expect(toolUse?.name).toBe("apply_diff")
			expect(toolUse?.nativeArgs).toEqual({
				path: "src/file.ts",
				diff: diffContent,
			})
		})

		it("应该在无状态时返回 null", () => {
			const toolUse = parser.buildToolUse(false)
			expect(toolUse).toBeNull()
		})
	})
})

describe("mayContainMarkdownTool", () => {
	it("应该检测 write_to 模式", () => {
		expect(mayContainMarkdownTool("```write_to file.ts")).toBe(true)
		expect(mayContainMarkdownTool("some text ```write_to file.ts")).toBe(true)
	})

	it("应该检测 apply_diff 模式", () => {
		expect(mayContainMarkdownTool("```apply_diff file.ts")).toBe(true)
	})

	it("应该拒绝不匹配的模式", () => {
		expect(mayContainMarkdownTool("```javascript")).toBe(false)
		expect(mayContainMarkdownTool("```write_to")).toBe(false) // 缺少空格和路径
		expect(mayContainMarkdownTool("write_to file.ts")).toBe(false) // 缺少 ```
	})
})

describe("extractMarkdownTools", () => {
	it("应该从文本中提取所有工具调用", () => {
		const text = `
Some text before.

\`\`\`write_to file1.ts
content1
\`\`\`

Middle text.

\`\`\`write_to file2.ts
content2
\`\`\`

Some text after.
`

		const tools = extractMarkdownTools(text)
		expect(tools.length).toBe(2)

		expect(tools[0].name).toBe("write_to_file")
		expect(tools[0].params.path).toBe("file1.ts")
		expect(tools[0].params.content).toBe("content1\n")

		expect(tools[1].name).toBe("write_to_file")
		expect(tools[1].params.path).toBe("file2.ts")
		expect(tools[1].params.content).toBe("content2\n")
	})

	it("应该处理空文本", () => {
		const tools = extractMarkdownTools("")
		expect(tools.length).toBe(0)
	})

	it("应该处理无工具调用的文本", () => {
		const tools = extractMarkdownTools("Just some regular text without any tool calls.")
		expect(tools.length).toBe(0)
	})
})
