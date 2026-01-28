/**
 * MarkdownToolParser - 解析 Markdown 格式的工具调用
 *
 * 支持的格式：
 * ```write_to path/to/file.ts
 * file content here
 * ```
 *
 * ```apply_diff path/to/file.ts
 * diff content here
 * ```
 *
 * 优势：
 * - 零转义开销（无需 \n, \" 等）
 * - 天然支持流式解析
 * - 与模型预训练分布高度一致
 */

import type { ToolName } from "@roo-code/types"
import type { ToolUse, NativeToolArgs } from "../../shared/tools"

/**
 * 支持 Markdown 格式的工具列表
 * 这些工具的内容参数较长，使用 Markdown 格式可以显著减少 token 消耗
 */
export const MARKDOWN_SUPPORTED_TOOLS = ["write_to", "apply_diff"] as const
export type MarkdownSupportedTool = (typeof MARKDOWN_SUPPORTED_TOOLS)[number]

/**
 * Markdown 工具名到标准工具名的映射
 */
const MARKDOWN_TOOL_NAME_MAP: Record<MarkdownSupportedTool, ToolName> = {
	write_to: "write_to_file",
	apply_diff: "apply_diff",
}

/**
 * 解析器状态
 */
export enum ParserState {
	/** 空闲状态，等待检测代码块开始 */
	IDLE = "IDLE",
	/** 检测到 fence 开始（`字符） */
	FENCE_OPENING = "FENCE_OPENING",
	/** 正在解析 header（工具名和参数） */
	HEADER_PARSING = "HEADER_PARSING",
	/** 正在累积内容 */
	CONTENT_ACCUMULATING = "CONTENT_ACCUMULATING",
	/** 检测到可能的结束 fence */
	FENCE_CLOSING_CANDIDATE = "FENCE_CLOSING_CANDIDATE",
	/** 解析完成 */
	COMPLETE = "COMPLETE",
	/** 解析失败（回退为普通文本） */
	FAILED = "FAILED",
}

/**
 * 流式解析事件类型
 */
export type MarkdownToolEvent =
	| { type: "tool_start"; id: string; toolName: ToolName; path: string }
	| { type: "tool_delta"; id: string; contentDelta: string }
	| { type: "tool_end"; id: string }
	| { type: "text"; content: string }

/**
 * 单个工具调用的解析状态
 */
interface ToolParseState {
	id: string
	state: ParserState
	fenceLength: number
	toolName: MarkdownSupportedTool | null
	canonicalToolName: ToolName | null
	path: string
	content: string
	closingFenceBuffer: string
	headerLine: string
}

/**
 * MarkdownToolParser - 流式 Markdown 工具调用解析器
 *
 * 设计原则：
 * 1. 状态机驱动：每个字符触发状态转换
 * 2. 延迟确认：结束 fence 需要完整匹配后才确认
 * 3. 回溯缓冲：误判的结束 fence 可以回溯到内容
 */
export class MarkdownToolParser {
	/** 当前解析状态 */
	private state: ToolParseState | null = null

	/** 最后完成的工具调用状态（用于 finalize 后的 buildToolUse） */
	private lastCompletedState: ToolParseState | null = null

	/** 生成唯一 ID 的计数器 */
	private static idCounter = 0

	/** 待处理的文本缓冲区（用于检测代码块开始） */
	private pendingBuffer = ""

	/** 跟踪当前是否在行首（用于检测代码块开始） */
	private atLineStart = true

	/**
	 * 生成唯一的工具调用 ID
	 */
	private static generateId(): string {
		return `md_tool_${++this.idCounter}_${Date.now()}`
	}

	/**
	 * 重置解析器状态
	 */
	public reset(): void {
		this.state = null
		this.lastCompletedState = null
		this.pendingBuffer = ""
		this.atLineStart = true
	}

	/**
	 * 检查是否正在解析工具调用
	 */
	public isParsingTool(): boolean {
		return (
			this.state !== null && this.state.state !== ParserState.COMPLETE && this.state.state !== ParserState.FAILED
		)
	}

	/**
	 * 获取当前解析状态（用于调试）
	 */
	public getState(): ParserState {
		return this.state?.state ?? ParserState.IDLE
	}

	/**
	 * 处理流式文本 chunk
	 *
	 * @param chunk - 新到达的文本片段
	 * @returns 解析事件数组
	 */
	public processChunk(chunk: string): MarkdownToolEvent[] {
		const events: MarkdownToolEvent[] = []
		const input = this.pendingBuffer + chunk
		this.pendingBuffer = ""

		let i = 0
		while (i < input.length) {
			const char = input[i]

			switch (this.state?.state ?? ParserState.IDLE) {
				case ParserState.IDLE:
					// 检测代码块开始
					if (char === "\n") {
						// 换行符，标记下一个字符在行首
						events.push({ type: "text", content: char })
						this.atLineStart = true
						i++
					} else if (char === "`" && this.atLineStart) {
						// 只有在行首才开始检测代码块
						this.state = {
							id: MarkdownToolParser.generateId(),
							state: ParserState.FENCE_OPENING,
							fenceLength: 1,
							toolName: null,
							canonicalToolName: null,
							path: "",
							content: "",
							closingFenceBuffer: "",
							headerLine: "",
						}
						i++
					} else {
						// 普通文本
						events.push({ type: "text", content: char })
						this.atLineStart = false
						i++
					}
					break

				case ParserState.FENCE_OPENING:
					if (char === "`") {
						// 继续累积 fence
						this.state!.fenceLength++
						i++
					} else if (this.state!.fenceLength >= 3) {
						// fence 长度足够，开始解析 header
						this.state!.state = ParserState.HEADER_PARSING
						// 不增加 i，让下一轮处理 header 字符
					} else {
						// fence 长度不足，回退为普通文本
						events.push({ type: "text", content: "`".repeat(this.state!.fenceLength) })
						this.state = null
						// 回退的反引号不在行首，所以当前字符也不在行首
						this.atLineStart = false
						// 不增加 i，让下一轮重新处理当前字符
					}
					break

				case ParserState.HEADER_PARSING:
					if (char === "\n") {
						// header 行结束，解析工具名和路径
						const parseResult = this.parseHeader(this.state!.headerLine)
						if (parseResult) {
							this.state!.toolName = parseResult.toolName
							this.state!.canonicalToolName = parseResult.canonicalToolName
							this.state!.path = parseResult.path
							this.state!.state = ParserState.CONTENT_ACCUMULATING

							// 发出 tool_start 事件
							events.push({
								type: "tool_start",
								id: this.state!.id,
								toolName: parseResult.canonicalToolName,
								path: parseResult.path,
							})
						} else {
							// header 解析失败，回退为普通文本
							const fenceStr = "`".repeat(this.state!.fenceLength)
							events.push({ type: "text", content: fenceStr + this.state!.headerLine + "\n" })
							this.state!.state = ParserState.FAILED
							this.state = null
						}
						i++
					} else {
						// 累积 header 字符
						this.state!.headerLine += char
						i++
					}
					break

				case ParserState.CONTENT_ACCUMULATING:
					if (char === "`" && this.isAtLineStart()) {
						// 可能是结束 fence
						this.state!.state = ParserState.FENCE_CLOSING_CANDIDATE
						this.state!.closingFenceBuffer = "`"
						i++
					} else if (char === "\n") {
						// 换行符，标记行首
						this.state!.content += char
						events.push({ type: "tool_delta", id: this.state!.id, contentDelta: char })
						i++
					} else {
						// 普通内容字符
						this.state!.content += char
						events.push({ type: "tool_delta", id: this.state!.id, contentDelta: char })
						i++
					}
					break

				case ParserState.FENCE_CLOSING_CANDIDATE:
					if (char === "`") {
						// 继续累积候选结束 fence
						this.state!.closingFenceBuffer += char
						i++
					} else if (char === "\n") {
						// 行结束，判断是否为有效结束 fence
						if (this.state!.closingFenceBuffer.length >= this.state!.fenceLength) {
							// 有效结束 fence，不将结束 fence 作为内容发出
							// 清除 closingFenceBuffer，避免其被包含在内容中
							this.state!.closingFenceBuffer = ""
							this.state!.state = ParserState.COMPLETE
							// 保存完成的状态
							this.lastCompletedState = { ...this.state! }
							events.push({ type: "tool_end", id: this.state!.id })
							i++
						} else {
							// 无效结束 fence，回溯到内容
							this.state!.content += this.state!.closingFenceBuffer
							events.push({
								type: "tool_delta",
								id: this.state!.id,
								contentDelta: this.state!.closingFenceBuffer,
							})
							this.state!.closingFenceBuffer = ""
							this.state!.state = ParserState.CONTENT_ACCUMULATING
							// 不增加 i，让下一轮处理当前字符
						}
					} else {
						// 遇到非 ` 字符或输入结束，判断是否为有效结束 fence
						if (this.state!.closingFenceBuffer.length >= this.state!.fenceLength) {
							// 有效结束 fence（后面可能有语言标识符等，忽略），不将结束 fence 作为内容发出
							// 清除 closingFenceBuffer，避免其被包含在内容中
							this.state!.closingFenceBuffer = ""
							this.state!.state = ParserState.COMPLETE
							// 保存完成的状态
							this.lastCompletedState = { ...this.state! }
							events.push({ type: "tool_end", id: this.state!.id })
							// 跳过剩余的行内容直到换行
							while (i < input.length && input[i] !== "\n") {
								i++
							}
							if (i < input.length && input[i] === "\n") {
								i++
							}
						} else {
							// 无效结束 fence，回溯到内容
							this.state!.content += this.state!.closingFenceBuffer
							events.push({
								type: "tool_delta",
								id: this.state!.id,
								contentDelta: this.state!.closingFenceBuffer,
							})
							this.state!.closingFenceBuffer = ""
							this.state!.state = ParserState.CONTENT_ACCUMULATING
							// 不增加 i，让下一轮处理当前字符
						}
					}
					break

				case ParserState.COMPLETE:
				case ParserState.FAILED:
					// 解析已完成或失败，重置状态
					// 注意：不清除 lastCompletedState，因为它被 buildToolUse 使用
					this.state = null
					// 不增加 i，让下一轮以 IDLE 状态处理当前字符
					break
			}
		}

		// 如果在 FENCE_OPENING 或 HEADER_PARSING 状态结束，保存到 pendingBuffer
		if (
			this.state &&
			(this.state.state === ParserState.FENCE_OPENING || this.state.state === ParserState.HEADER_PARSING)
		) {
			// 保持状态，等待更多输入
		}

		return events
	}

	/**
	 * 强制完成当前解析（用于流结束时）
	 *
	 * @returns 最终事件（如果有未完成的工具调用）
	 */
	public finalize(): MarkdownToolEvent[] {
		const events: MarkdownToolEvent[] = []

		if (this.state) {
			switch (this.state.state) {
				case ParserState.CONTENT_ACCUMULATING:
					// 流结束但工具调用未完成，强制完成
					events.push({ type: "tool_end", id: this.state.id })
					// 保存完成的状态（在 reset 前保存）
					this.lastCompletedState = { ...this.state }
					break

				case ParserState.FENCE_CLOSING_CANDIDATE:
					// 检查 closingFenceBuffer 是否是有效的结束 fence
					if (this.state.closingFenceBuffer.length >= this.state.fenceLength) {
						// 有效结束 fence，不将其作为内容
						// 清除 closingFenceBuffer
						this.state.closingFenceBuffer = ""
					} else {
						// 无效结束 fence，将其作为内容
						this.state.content += this.state.closingFenceBuffer
						events.push({
							type: "tool_delta",
							id: this.state.id,
							contentDelta: this.state.closingFenceBuffer,
						})
					}
					events.push({ type: "tool_end", id: this.state.id })
					// 保存完成的状态（在 reset 前保存）
					this.lastCompletedState = { ...this.state }
					break

				case ParserState.FENCE_OPENING:
				case ParserState.HEADER_PARSING: {
					// 未完成的 fence 或 header，作为普通文本
					const fenceStr = "`".repeat(this.state.fenceLength)
					events.push({ type: "text", content: fenceStr + this.state.headerLine })
					break
				}
			}
		}

		// 只清除 state，保留 lastCompletedState
		this.state = null
		this.pendingBuffer = ""
		return events
	}

	/**
	 * 检查当前是否在行首
	 */
	private isAtLineStart(): boolean {
		if (!this.state) return true
		const content = this.state.content
		if (content.length === 0) return true
		return content[content.length - 1] === "\n"
	}

	/**
	 * 解析 header 行
	 *
	 * 格式：toolName path
	 * 例如：write_to src/app.ts
	 *
	 * @param headerLine - header 行内容（不含换行符）
	 * @returns 解析结果，或 null 如果格式无效
	 */
	private parseHeader(
		headerLine: string,
	): { toolName: MarkdownSupportedTool; canonicalToolName: ToolName; path: string } | null {
		const trimmed = headerLine.trim()
		const spaceIndex = trimmed.indexOf(" ")

		if (spaceIndex === -1) {
			// 没有空格，无法分离工具名和路径
			return null
		}

		const toolName = trimmed.substring(0, spaceIndex) as MarkdownSupportedTool
		const path = trimmed.substring(spaceIndex + 1).trim()

		// 验证工具名
		if (!MARKDOWN_SUPPORTED_TOOLS.includes(toolName)) {
			return null
		}

		// 验证路径非空
		if (!path) {
			return null
		}

		return {
			toolName,
			canonicalToolName: MARKDOWN_TOOL_NAME_MAP[toolName],
			path,
		}
	}

	/**
	 * 从解析状态构建 ToolUse 对象
	 *
	 * @param partial - 是否为部分结果
	 * @returns ToolUse 对象，或 null 如果状态无效
	 */
	public buildToolUse(partial: boolean = false): ToolUse | null {
		// 优先使用 lastCompletedState（finalize 后可用）
		const state = this.lastCompletedState || this.state

		if (!state || !state.canonicalToolName) {
			return null
		}

		const toolName = state.canonicalToolName

		// 构建 params（字符串化参数，用于显示）
		const params: Record<string, string> = {
			path: state.path,
			content: state.content,
		}

		// 构建 nativeArgs（类型化参数，用于执行）
		let nativeArgs: NativeToolArgs[keyof NativeToolArgs] | undefined

		if (toolName === "write_to_file") {
			nativeArgs = {
				path: state.path,
				content: state.content,
			} as NativeToolArgs["write_to_file"]
		} else if (toolName === "apply_diff") {
			nativeArgs = {
				path: state.path,
				diff: state.content,
			} as NativeToolArgs["apply_diff"]
		}

		return {
			type: "tool_use",
			id: state.id,
			name: toolName,
			params,
			partial,
			nativeArgs,
			isMarkdownTool: true,
		} as ToolUse
	}

	/**
	 * 获取当前工具调用的 ID
	 */
	public getCurrentToolId(): string | null {
		return this.state?.id ?? null
	}

	/**
	 * 获取当前工具调用的路径
	 */
	public getCurrentPath(): string | null {
		return this.state?.path ?? null
	}

	/**
	 * 获取当前工具调用的内容
	 */
	public getCurrentContent(): string | null {
		return this.state?.content ?? null
	}
}

/**
 * 检查文本是否可能包含 Markdown 工具调用
 *
 * 这是一个快速检查，用于决定是否需要使用完整的解析器
 *
 * @param text - 要检查的文本
 * @returns 是否可能包含 Markdown 工具调用
 */
export function mayContainMarkdownTool(text: string): boolean {
	// 检查是否包含支持的工具名模式
	for (const toolName of MARKDOWN_SUPPORTED_TOOLS) {
		if (text.includes("```" + toolName + " ")) {
			return true
		}
	}
	return false
}

/**
 * 从完整文本中提取所有 Markdown 工具调用
 *
 * 这是一个非流式的便捷方法，用于一次性解析完整文本
 *
 * @param text - 要解析的完整文本
 * @returns 解析出的 ToolUse 数组
 */
export function extractMarkdownTools(text: string): ToolUse[] {
	const parser = new MarkdownToolParser()
	const tools: ToolUse[] = []

	const events = parser.processChunk(text)
	events.push(...parser.finalize())

	// 收集所有完成的工具调用
	const toolStates = new Map<string, { toolName: ToolName; path: string; content: string }>()

	for (const event of events) {
		switch (event.type) {
			case "tool_start":
				toolStates.set(event.id, {
					toolName: event.toolName,
					path: event.path,
					content: "",
				})
				break
			case "tool_delta": {
				const state = toolStates.get(event.id)
				if (state) {
					state.content += event.contentDelta
				}
				break
			}
			case "tool_end": {
				const finalState = toolStates.get(event.id)
				if (finalState) {
					const toolUse = buildToolUseFromState(event.id, finalState)
					if (toolUse) {
						tools.push(toolUse)
					}
					toolStates.delete(event.id)
				}
				break
			}
		}
	}

	return tools
}

/**
 * 从状态构建 ToolUse
 */
function buildToolUseFromState(
	id: string,
	state: { toolName: ToolName; path: string; content: string },
): ToolUse | null {
	const { toolName, path, content } = state

	const params: Record<string, string> = {
		path,
		content,
	}

	let nativeArgs: NativeToolArgs[keyof NativeToolArgs] | undefined

	if (toolName === "write_to_file") {
		nativeArgs = { path, content } as NativeToolArgs["write_to_file"]
	} else if (toolName === "apply_diff") {
		nativeArgs = { path, diff: content } as NativeToolArgs["apply_diff"]
	}

	return {
		type: "tool_use",
		id,
		name: toolName,
		params,
		partial: false,
		nativeArgs,
	} as ToolUse
}
