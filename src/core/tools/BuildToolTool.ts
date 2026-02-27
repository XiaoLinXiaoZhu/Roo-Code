import * as path from "path"
import * as os from "os"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"

/**
 * BuildToolTool - 构建工具的工具
 *
 * Agent as Tools 架构的封装工具，用于构建可复用的 CLI 工具。
 * 通过专有系统提示词提供工具构建规范，不增加额外约束。
 */

interface BuildToolParams {
	requirement: string
	inputHint?: string
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

		if (!requirement) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("build_tool", "requirement"))
			return
		}

		task.consecutiveMistakeCount = 0

		const provider = task.providerRef.deref()
		if (!provider) {
			pushToolResult(formatResponse.toolError("Provider reference lost"))
			return
		}

		const toolMessage = JSON.stringify({
			tool: "buildTool",
			requirement,
			inputHint,
			outputHint,
		})

		const didApprove = await askApproval("tool", toolMessage)
		if (!didApprove) {
			pushToolResult(formatResponse.toolDenied())
			return
		}

		const existingToolsInfo = await this.getExistingToolsInfo(task.cwd)
		const systemPrompt = this.buildSystemPrompt()
		const taskMessage = this.buildTaskMessage(requirement, inputHint, outputHint, existingToolsInfo)

		try {
			const child = await (provider as any).delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: taskMessage,
				mode: "tool-builder",
				systemPromptOverride: systemPrompt,
			})

			pushToolResult(`已创建工具构建子任务 ${child.taskId}, 正在构建...`)
		} catch (error: any) {
			await handleError("creating tool builder subtask", error)
		}
	}
	private buildSystemPrompt(): string {
		return `# 身份

你是一个工具构建专家。你的职责是根据需求描述，独立完成可复用 CLI 工具的设计和实现。

你自主决定所有实现细节：技术选型、参数设计、缓存策略、错误处理方式。

# 工具构建规范

## 核心原则
- 一个工具只做一件事，做好它
- 失败时给出有用的错误信息，不要静默失败
- 必须支持 \`--help\` 参数，输出用法说明
- 优先使用标准格式（JSON、CSV）作为输出

## 输出限制（防止上下文溢出）
工具必须强制执行以下默认输出限制：
- 文本：stdout 最多 2000 字符。超出时截断并提示 '[TRUNCATED, full output: /path/to/file]'，完整结果写入文件
- 图片：默认 800x600。支持 --focus x,y（归一化坐标）和 --scale factor 用于渐进式探索

## 存放位置
根据工具的通用性选择：
- **全局工具** (~/.roo/tools/)：跨项目通用的工具，必须配备 README.md
- **项目工具** (.roo/tools/)：仅对当前项目有意义的工具，README 可选

优先考虑全局复用。

# 工作流程

1. 检查已有工具是否满足需求（如果有已有工具信息）
2. 决定技术选型和存放位置
3. 创建工具目录结构
4. 实现工具主程序
5. 添加 --help 支持和错误处理
6. 测试工具功能
7. attempt_completion 返回：工具路径 + --help 输出 + 使用示例

# 编辑规范

写入文件时，请你优先写入框架+占位符，然后逐个占位符填充，等待工具调用返回后再替换下一处。每一次修改不要超过500字，以防工具调用超时。`
	}
	private async getExistingToolsInfo(cwd: string): Promise<string> {
		const fs = await import("fs/promises")
		const infoParts: string[] = []

		const globalToolDir = path.join(os.homedir(), ".roo", "tools")
		try {
			const globalTools = await fs.readdir(globalToolDir)
			if (globalTools.length > 0) {
				infoParts.push(`**全局工具** (${globalToolDir}):`)
				for (const tool of globalTools.slice(0, 10)) {
					infoParts.push(`- ${tool}`)
				}
				if (globalTools.length > 10) {
					infoParts.push(`- ... 还有 ${globalTools.length - 10} 个工具`)
				}
			}
		} catch {
			// 目录不存在，忽略
		}

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
		let message = `需求：${requirement}`

		if (inputHint) {
			message += `\n\n期望输入：${inputHint}`
		}

		if (outputHint) {
			message += `\n\n期望输出：${outputHint}`
		}

		if (existingToolsInfo) {
			message += `\n\n已有工具：\n${existingToolsInfo}`
		}

		return message
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
