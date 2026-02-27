import * as vscode from "vscode"
import crypto from "crypto"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"

/**
 * ApplyEditTool - 应用编辑工具
 *
 * Agent as Tools 架构的封装工具，用于编辑代码。
 * 通过专有系统提示词提供代码编辑规范，不增加额外约束。
 *
 * 内部实现:
 * - 构建代码编辑专有系统提示词
 * - 创建一个 code 模式的子任务
 * - 执行编辑操作并验证
 */

interface ApplyEditParams {
	instruction: string
	files?: string
	context?: string
	validate?: string
}

export class ApplyEditTool extends BaseTool<"apply_edit"> {
	readonly name = "apply_edit" as const
	override readonly isDelegationTool = true

	parseLegacy(params: Partial<Record<string, string>>): ApplyEditParams {
		return {
			instruction: params.instruction || "",
			files: params.files,
			context: params.context,
			validate: params.validate,
		}
	}

	async execute(params: ApplyEditParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { instruction, files, context, validate } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		if (!instruction) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("apply_edit", "instruction"))
			return
		}

		task.consecutiveMistakeCount = 0

		const provider = task.providerRef.deref()
		if (!provider) {
			pushToolResult(formatResponse.toolError("Provider reference lost"))
			return
		}

		const toolMessage = JSON.stringify({
			tool: "applyEdit",
			instruction,
			files,
			context,
		})

		const didApprove = await askApproval("tool", toolMessage)
		if (!didApprove) {
			pushToolResult(formatResponse.toolDenied())
			return
		}

		try {
			if (task.enableCheckpoints) {
				task.checkpointSave(true)
			}

			const systemPrompt = this.buildSystemPrompt(validate)
			const taskMessage = this.buildTaskMessage(instruction, files, context)

			const child = await provider.delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: taskMessage,
				mode: "code",
				systemPromptOverride: systemPrompt,
			})

			pushToolResult(`已创建编辑子任务 ${child.taskId}, 正在进行代码修改...`)
		} catch (error: any) {
			await handleError("creating edit subtask", error)
		}
	}

	/**
	 * 代码编辑专有系统提示词
	 *
	 * 设计思路：仅提供代码编辑规范，不增加额外约束。
	 * 这个子任务只负责"按指令修改代码"，不负责 debug、架构决策等。
	 */
	private buildSystemPrompt(validate?: string): string {
		const validationSection = this.buildValidationSection(validate)

		return `# 身份

你是一个精确的代码编辑器。你的唯一职责是按照指令修改代码，确保修改正确且不引入副作用。

# 工作流程

1. **读取**：完整读取目标文件，理解当前代码结构和上下文
2. **修改**：按指令执行最小化的精确修改
3. **验证**：${validationSection}
4. **交付**：使用 attempt_completion 提交修改摘要

# 编辑规范

- 做最小化修改——只改指令要求的部分，不重构无关代码
- 保持现有代码风格（缩进、命名约定、注释风格）

# 边界

- 如果指令不清晰或信息不足，直接通过 attempt_completion 说明缺失内容，不要猜测
- 不要做指令之外的"改进"或"优化"
- 不要添加指令未要求的注释或文档`
	}

	private buildValidationSection(validate?: string): string {
		if (validate === "none" || validate === "false") {
			return "跳过验证"
		}
		if (validate) {
			return `运行 \`${validate}\` 验证修改`
		}
		return "根据项目类型运行合适的校验（如类型检查、lint、测试等）"
	}

	private buildTaskMessage(instruction: string, files?: string, context?: string): string {
		let message = `编辑指令：${instruction}`

		if (files) {
			message += `\n\n修改范围：${files}`
		}

		if (context) {
			message += `\n\n上下文：${context}`
		}

		return message
	}

	override async handlePartial(task: Task, block: ToolUse<"apply_edit">): Promise<void> {
		const instruction: string | undefined = block.params.instruction
		const files: string | undefined = block.params.files
		const context: string | undefined = block.params.context

		const partialMessage = JSON.stringify({
			tool: "applyEdit",
			instruction,
			files,
			context,
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const applyEditTool = new ApplyEditTool()
