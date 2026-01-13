import * as vscode from "vscode"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"

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

		// 构建自定义指令
		const customInstructions = this.buildCodeModeInstruction(files)

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
			const child = await (provider as any).delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: taskMessage,
				initialTodos: todos,
				mode: "code",
				customInstructions,
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

	private buildCodeModeInstruction(files?: string): string {
		let instructions = `
你在一个代码编辑任务中执行。

**你的工具权限:**
- ✅ read_file
- ✅ write_to_file
- ✅ apply_diff
- ✅ search_files
- ✅ list_files
- ❌ consultExpert (禁止递归调用)
- ❌ searchProject (禁止递归调用)

**你的任务:**
1. 理解编辑指令
2. 使用 read_file 阅读需要修改的文件
3. 使用 write_to_file 或 apply_diff 进行修改
4. 完成后使用 attempt_completion 返回结果

**返回要求:**
- 提供修改摘要
- 列出所有修改的文件
`.trim()

		if (files) {
			instructions += `\n\n**文件限制:**\n你只能修改以下文件:\n${files}`
		}

		return instructions
	}

	private buildTodos(instruction: string, files?: string): string[] {
		const todos: string[] = ["理解编辑指令"]

		if (files) {
			todos.push(`阅读文件: ${files}`)
		}

		todos.push("进行代码修改")
		todos.push("完成编辑")

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
