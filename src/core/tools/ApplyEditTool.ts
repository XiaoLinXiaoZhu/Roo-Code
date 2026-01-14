import * as vscode from "vscode"
import crypto from "crypto"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import type { TodoItem, TodoStatus } from "@roo-code/types"

/**
 * ApplyEditTool - 应用编辑工具
 *
 * 这是一个"Agent as Tools"架构的封装工具,用于编辑代码。
 *
 * 内部实现:
 * - 创建一个 code 模式的子任务
 * - 执行编辑操作
 * - 可选:运行代码校验
 * - 返回编辑结果
 */

interface ApplyEditParams {
	/**
	 * 自然语言编辑指令
	 * @example "把这个函数的错误处理改成 try-catch"
	 * @example "添加类型注解到所有参数"
	 */
	instruction: string

	/**
	 * 可选:限制可编辑的文件
	 */
	files?: string

	/**
	 * 可选:上下文信息
	 */
	context?: string

	/**
	 * 可选:是否运行校验
	 * @default true
	 */
	validate?: string
}

export class ApplyEditTool extends BaseTool<"apply_edit"> {
	readonly name = "apply_edit" as const

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
		const { askApproval, handleError, pushToolResult, toolCallId } = callbacks

		// 验证必需参数
		if (!instruction) {
			task.consecutiveMistakeCount++
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("apply_edit", "instruction"))
			return
		}

		task.consecutiveMistakeCount = 0

		// 构建任务消息
		const taskMessage = this.buildEditMessage(instruction, files, context)

		// 获取 Provider
		const provider = task.providerRef.deref()
		if (!provider) {
			pushToolResult(formatResponse.toolError("Provider reference lost"))
			return
		}

		// 创建工具消息用于审批
		const toolMessage = JSON.stringify({
			tool: "applyEdit",
			instruction: instruction,
			files: files,
			context: context,
		})

		// 请求审批
		const didApprove = await askApproval("tool", toolMessage)
		if (!didApprove) {
			pushToolResult(formatResponse.toolDenied())
			return
		}

		try {
			// 创建检查点
			if (task.enableCheckpoints) {
				task.checkpointSave(true)
			}

			// 构建待办事项
			const todos = this.buildTodos(instruction, files)

			// 委派到 code 模式的子任务
			const child = await provider.delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: taskMessage,
				initialTodos: todos,
				mode: "code",
			})

			// 等待子任务完成并返回结果
			pushToolResult(`已创建编辑子任务 ${child.taskId}, 正在进行代码修改...`)

			// 注意: 这里我们不等待子任务完成,因为父任务会被暂停
			// 子任务完成后会通过 reopenParentFromDelegation 恢复父任务
		} catch (error: any) {
			await handleError("creating edit subtask", error)
		}
	}

	private buildEditMessage(instruction: string, files?: string, context?: string): string {
		let message = `你需要按照以下指令编辑代码:\n\n**指令:**\n${instruction}`

		if (files) {
			message += `\n\n**需要修改的文件:**\n${files}`
		}

		if (context) {
			message += `\n\n**额外上下文:**\n${context}`
		}

		return message
	}

	private buildTodos(instruction: string, files?: string): TodoItem[] {
		const todos: TodoItem[] = []

		if (files) {
			todos.push({ id: crypto.randomUUID(), content: `阅读指定文件：${files}`, status: "pending" })
		}
		todos.push({ id: crypto.randomUUID(), content: "分析编辑指令：" + instruction, status: "pending" })
		todos.push({
			id: crypto.randomUUID(),
			content: "若信息不足，直接调用 attempt_completion 说明缺失内容",
			status: "pending",
		})
		todos.push({ id: crypto.randomUUID(), content: "修改代码", status: "pending" })
		todos.push({
			id: crypto.randomUUID(),
			content: "验证代码（运行 Lint、TypeScript 检查等）",
			status: "pending",
		})
		todos.push({
			id: crypto.randomUUID(),
			content: "调用 attempt_completion 提交结果：包含修改摘要及范围",
			status: "pending",
		})

		return todos
	}

	override async handlePartial(task: Task, block: ToolUse<"apply_edit">): Promise<void> {
		const instruction: string | undefined = block.params.instruction
		const files: string | undefined = block.params.files
		const context: string | undefined = block.params.context

		const partialMessage = JSON.stringify({
			tool: "applyEdit",
			instruction: this.removeClosingTag("instruction", instruction, block.partial),
			files: this.removeClosingTag("files", files, block.partial),
			context: this.removeClosingTag("context", context, block.partial),
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const applyEditTool = new ApplyEditTool()
