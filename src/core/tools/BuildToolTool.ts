import * as path from "path"
import * as os from "os"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import { TodoItem } from "@roo-code/types"

/**
 * BuildToolTool - 构建工具的工具
 *
 * 这是一个"Agent as Tools"架构的封装工具,用于构建可复用的 CLI 工具。
 *
 * 设计原则:
 * - 主 agent 只描述"需要什么能力"
 * - 子 agent 决定"如何实现"（技术选型、缓存位置、参数设计等）
 *
 * 交付物:
 * - 工具路径
 * - --help 输出
 * - 使用示例
 */

interface BuildToolParams {
	/**
	 * 工具需要实现的功能描述
	 * @example "截取指定窗口的截图，支持指定区域裁切"
	 */
	requirement: string

	/**
	 * 可选: 期望的输入格式/类型提示
	 * @example "窗口名称、可选的裁切区域"
	 */
	inputHint?: string

	/**
	 * 可选: 期望的输出格式/类型提示
	 * @example "图片文件路径"
	 */
	outputHint?: string
}

export class BuildToolTool extends BaseTool<"build_tool"> {
	readonly name = "build_tool" as const
	override readonly isDelegationTool = true

	parseLegacy(params: Partial<Record<string, string>>): BuildToolParams {
		return {
			requirement: params.requirement || "",
			inputHint: params.inputHint,
			outputHint: params.outputHint,
		}
	}

	async execute(params: BuildToolParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { requirement, inputHint, outputHint } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		// 验证必需参数
		if (!requirement) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("build_tool", "requirement"))
			return
		}

		task.consecutiveMistakeCount = 0

		// 获取已有工具信息（用于缓存检查）
		const existingToolsInfo = await this.getExistingToolsInfo(task.cwd)

		// 构建任务消息
		const taskMessage = this.buildTaskMessage(requirement, inputHint, outputHint, existingToolsInfo)

		// 获取 Provider
		const provider = task.providerRef.deref()
		if (!provider) {
			pushToolResult(formatResponse.toolError("Provider reference lost"))
			return
		}

		// 创建工具消息用于审批
		const toolMessage = JSON.stringify({
			tool: "buildTool",
			requirement,
			inputHint,
			outputHint,
		})

		// 请求审批
		const didApprove = await askApproval("tool", toolMessage)
		if (!didApprove) {
			pushToolResult(formatResponse.toolDenied())
			return
		}

		const todos = this.buildTodos(existingToolsInfo)

		try {
			// 委派到 tool-builder 模式的子任务
			const child = await (provider as any).delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: taskMessage,
				initialTodos: todos,
				mode: "tool-builder", // 使用专门的 tool-builder 模式
			})

			// 等待子任务完成并返回结果
			pushToolResult(`已创建工具构建子任务 ${child.taskId}, 正在构建...`)

			// 注意: 这里我们不等待子任务完成,因为父任务会被暂停
			// 子任务完成后会通过 reopenParentFromDelegation 恢复父任务
		} catch (error: any) {
			await handleError("creating tool builder subtask", error)
		}
	}

	private async getExistingToolsInfo(cwd: string): Promise<string> {
		const fs = await import("fs/promises")
		const infoParts: string[] = []

		// 检查全局工具目录
		const globalToolDir = path.join(os.homedir(), ".roo", "tools")
		try {
			const globalTools = await fs.readdir(globalToolDir)
			if (globalTools.length > 0) {
				infoParts.push(`**全局工具** (${globalToolDir}):`)
				for (const tool of globalTools.slice(0, 10)) {
					// 限制显示数量
					infoParts.push(`- ${tool}`)
				}
				if (globalTools.length > 10) {
					infoParts.push(`- ... 还有 ${globalTools.length - 10} 个工具`)
				}
			}
		} catch {
			// 目录不存在，忽略
		}

		// 检查项目工具目录
		const projectToolDir = path.join(cwd, ".roo", "tools")
		try {
			const projectTools = await fs.readdir(projectToolDir)
			if (projectTools.length > 0) {
				infoParts.push(`\n**项目工具** (${projectToolDir}):`)
				for (const tool of projectTools.slice(0, 10)) {
					infoParts.push(`- ${tool}`)
				}
				if (projectTools.length > 10) {
					infoParts.push(`- ... 还有 ${projectTools.length - 10} 个工具`)
				}
			}
		} catch {
			// 目录不存在，忽略
		}

		return infoParts.length > 0 ? infoParts.join("\n") : ""
	}

	private buildTaskMessage(
		requirement: string,
		inputHint: string | undefined,
		outputHint: string | undefined,
		existingToolsInfo: string,
	): string {
		let message = `<requirement>
${requirement}
</requirement>`

		if (inputHint) {
			message += `\n\n<input_hint>\n${inputHint}\n</input_hint>`
		}

		if (outputHint) {
			message += `\n\n<output_hint>\n${outputHint}\n</output_hint>`
		}

		if (existingToolsInfo) {
			message += `\n\n<existing_tools>\n${existingToolsInfo}\n</existing_tools>`
		}

		// 强调输出限制要求
		message += `\n\n<output_limits>
CRITICAL: Built tools MUST enforce these default output limits:
- Text: max 2000 chars to stdout. If exceeded, truncate with '[TRUNCATED, full output: /path/to/file]' and write complete result to file.
- Images: default 800x600. Support --focus x,y (0-1 normalized coords) for progressive exploration, and --scale factor for zoom.
These limits prevent context overflow when the tool is used repeatedly.
</output_limits>`

		return message
	}

	private buildTodos(existingToolsInfo: string): TodoItem[] {
		const todos: TodoItem[] = []

		if (existingToolsInfo) {
			todos.push({
				id: crypto.randomUUID(),
				content: "检查已有工具是否满足需求",
				status: "pending",
			})
		}

		todos.push({
			id: crypto.randomUUID(),
			content: "决定技术选型和缓存位置",
			status: "pending",
		})

		todos.push({
			id: crypto.randomUUID(),
			content: "创建工具目录结构",
			status: "pending",
		})

		todos.push({
			id: crypto.randomUUID(),
			content: "实现工具主程序",
			status: "pending",
		})

		todos.push({
			id: crypto.randomUUID(),
			content: "添加 --help 支持和错误处理",
			status: "pending",
		})

		todos.push({
			id: crypto.randomUUID(),
			content: "测试工具功能",
			status: "pending",
		})

		todos.push({
			id: crypto.randomUUID(),
			content: "attempt_completion 返回路径 + --help 输出 + 示例",
			status: "pending",
		})

		return todos
	}

	override async handlePartial(task: Task, block: ToolUse<"build_tool">): Promise<void> {
		const requirement: string | undefined = block.params.requirement
		const inputHint: string | undefined = block.params.inputHint
		const outputHint: string | undefined = block.params.outputHint

		const partialMessage = JSON.stringify({
			tool: "buildTool",
			requirement,
			inputHint,
			outputHint,
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const buildToolTool = new BuildToolTool()
