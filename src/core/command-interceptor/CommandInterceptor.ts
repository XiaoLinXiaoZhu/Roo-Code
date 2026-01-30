/**
 * 命令拦截器
 *
 * CLI 代理层的核心组件，负责：
 * 1. 解析 shell 命令
 * 2. 判断是否可以拦截执行
 * 3. 分配命令处理器
 * 4. 执行管道命令链
 *
 * 设计原则：
 * - 保守拦截：不确定能处理的命令，直接透传
 * - 优雅降级：任何错误都 fallback 到原生执行
 * - 渐进增强：从最常用的命令开始，逐步扩展
 */

import { CommandContext, CommandHandler, CommandResult, InterceptResult, PipelineStage } from "./types"
import { ShellParser } from "./ShellParser"
import { PipelineExecutor } from "./PipelineExecutor"
import { GrepHandler, CatHandler, HeadHandler, TailHandler, FindHandler, LsHandler, WcHandler } from "./handlers"

export class CommandInterceptor {
	private handlers = new Map<string, CommandHandler>()
	private parser = new ShellParser()

	constructor() {
		this.registerBuiltinHandlers()
	}

	/**
	 * 注册内置命令处理器
	 */
	private registerBuiltinHandlers(): void {
		const handlers: CommandHandler[] = [
			new GrepHandler(),
			new CatHandler(),
			new HeadHandler(),
			new TailHandler(),
			new FindHandler(),
			new LsHandler(),
			new WcHandler(),
		]

		for (const handler of handlers) {
			this.handlers.set(handler.name, handler)
			for (const alias of handler.aliases ?? []) {
				this.handlers.set(alias, handler)
			}
		}
	}

	/**
	 * 注册自定义命令处理器
	 */
	registerHandler(handler: CommandHandler): void {
		this.handlers.set(handler.name, handler)
		for (const alias of handler.aliases ?? []) {
			this.handlers.set(alias, handler)
		}
	}

	/**
	 * 检查命令是否可以被拦截
	 */
	canIntercept(command: string): boolean {
		const stages = this.parser.parsePipeline(command)

		// 如果解析失败（返回单个空命令阶段），不拦截
		if (stages.length === 1 && stages[0].command === "") {
			return false
		}

		// 检查是否至少有一个阶段可以被拦截
		for (const stage of stages) {
			const handler = this.handlers.get(stage.command)
			if (handler?.canHandle(stage.args)) {
				return true
			}
		}

		return false
	}

	/**
	 * 尝试拦截执行命令
	 *
	 * @returns InterceptResult，包含是否成功拦截和执行结果
	 */
	async tryIntercept(command: string, context: CommandContext): Promise<InterceptResult> {
		try {
			// 1. 解析管道
			const stages = this.parser.parsePipeline(command)

			// 2. 如果解析失败，不拦截
			if (stages.length === 1 && stages[0].command === "") {
				return { intercepted: false }
			}

			// 3. 为每个阶段分配 handler
			let hasHandler = false
			for (const stage of stages) {
				const handler = this.handlers.get(stage.command)
				if (handler?.canHandle(stage.args)) {
					stage.handler = handler
					hasHandler = true
				}
			}

			// 4. 如果没有任何阶段可以处理，不拦截
			if (!hasHandler) {
				return { intercepted: false }
			}

			// 5. 执行管道
			const executor = new PipelineExecutor(context)
			const result = await executor.execute(stages)

			return {
				intercepted: true,
				result,
			}
		} catch (error) {
			// 任何错误都不拦截，让原生执行处理
			console.warn(`Command intercept failed, falling back to native: ${error}`)
			return { intercepted: false }
		}
	}

	/**
	 * 执行命令（强制拦截）
	 *
	 * 与 tryIntercept 不同，此方法假设命令可以被拦截。
	 * 如果拦截失败，会抛出错误而不是返回 intercepted: false。
	 */
	async execute(command: string, context: CommandContext): Promise<CommandResult> {
		const result = await this.tryIntercept(command, context)

		if (!result.intercepted) {
			throw new Error(`Command cannot be intercepted: ${command}`)
		}

		return result.result!
	}

	/**
	 * 获取所有已注册的命令名称
	 */
	getRegisteredCommands(): string[] {
		return Array.from(new Set(this.handlers.keys()))
	}
}

/**
 * 创建默认的命令拦截器实例
 */
export function createCommandInterceptor(): CommandInterceptor {
	return new CommandInterceptor()
}
