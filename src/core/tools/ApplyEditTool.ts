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
	 * 可选:校验命令
	 * - "none" - 跳过校验
	 * - 具体命令如 "npm run typecheck"、"pytest tests/"
	 * - 不传则由子代理根据项目类型自行判断
	 */
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
		const taskMessage = this.buildEditMessage(instruction, files, context, validate)

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

	private buildEditMessage(instruction: string, files?: string, context?: string, validate?: string): string {
		// 清晰明确的任务要求
		let message = `<task>
编辑代码：${instruction}
</task>`

		if (files) {
			message += `\n\n<scope>
修改范围：${files}
</scope>`
		}

		if (context) {
			message += `\n\n<context>
${context}
</context>`
		}

		message += `\n\n<deliverable>
完成后使用 attempt_completion 提交：
- 修改了哪些文件
- 每个文件的变更摘要`

		// 根据 validate 参数生成验证要求
		const validationInstruction = this.buildValidationInstruction(validate)
		if (validationInstruction) {
			message += `\n- ${validationInstruction}`
		}

		message += `\n</deliverable>`

		return message
	}

	private buildValidationInstruction(validate?: string): string {
		// 无需校验
		if (validate === "none" || validate === "false") {
			return "无需校验"
		}

		// 如果用户传入了具体命令，直接使用
		if (validate) {
			return `验证：运行 \`${validate}\` 并报告结果`
		}

		// 默认：让子代理自行判断合适的校验方式
		return "验证：根据项目类型运行合适的校验（如类型检查、lint、测试等）"
	}

	private buildTodos(instruction: string, files?: string): TodoItem[] {
		const todos: TodoItem[] = []

		// Step 1: 信息获取
		if (files) {
			todos.push({
				id: crypto.randomUUID(),
				content: `读取目标文件：${files}`,
				status: "pending",
			})
		} else {
			todos.push({
				id: crypto.randomUUID(),
				content: "定位需要修改的文件",
				status: "pending",
			})
		}

		// Step 2: 分析指令（注入 instruction，先想后做）
		todos.push({
			id: crypto.randomUUID(),
			content: `分析编辑指令：${instruction}`,
			status: "pending",
		})

		// Step 3: 提供退路（符合诚实透明原则）
		todos.push({
			id: crypto.randomUUID(),
			content: "若信息不足，调用 attempt_completion 说明缺失内容",
			status: "pending",
		})

		// Step 4: 执行修改
		todos.push({
			id: crypto.randomUUID(),
			content: "执行代码修改",
			status: "pending",
		})

		// Step 5: 验证
		todos.push({
			id: crypto.randomUUID(),
			content: "运行 lint 和 type-check 验证",
			status: "pending",
		})

		// Step 6: 交付（末端重申质量要求）
		todos.push({
			id: crypto.randomUUID(),
			content: "attempt_completion 提交结果：修改摘要及变更范围",
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
			instruction: instruction,
			files: files,
			context: context,
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const applyEditTool = new ApplyEditTool()
