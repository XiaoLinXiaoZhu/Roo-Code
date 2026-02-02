/**
 * 管道执行器
 *
 * 负责执行管道命令链，支持：
 * - 纯拦截执行（所有命令都有 handler）
 * - 纯透传执行（所有命令都没有 handler）
 * - 混合执行（部分拦截、部分透传）
 *
 * 管道语义：
 * - 前一个命令的 stdout 是下一个命令的 stdin
 * - 非零退出码会中断管道（除非设置了 pipefail）
 */

import { execa } from "execa"

import { CommandContext, CommandResult, PipelineStage, CONSTANTS } from "./types"

export class PipelineExecutor {
	constructor(private context: CommandContext) {}

	/**
	 * 执行管道命令链
	 */
	async execute(stages: PipelineStage[]): Promise<CommandResult> {
		// 空管道
		if (stages.length === 0) {
			return { stdout: "", stderr: "", exitCode: 0 }
		}

		// 单个透传阶段（整个命令不可拦截）
		if (stages.length === 1 && !stages[0].handler && stages[0].command === "") {
			return this.executeNativeCommand(stages[0].raw)
		}

		// 检查是否所有阶段都不可拦截
		const allPassthrough = stages.every((s) => !s.handler)
		if (allPassthrough) {
			// 重建原始命令并透传
			const fullCommand = stages.map((s) => s.raw).join(" | ")
			return this.executeNativeCommand(fullCommand)
		}

		// 混合执行或纯拦截执行
		return this.executePipeline(stages)
	}

	/**
	 * 执行管道（逐阶段）
	 */
	private async executePipeline(stages: PipelineStage[]): Promise<CommandResult> {
		let currentInput = this.context.stdin || ""
		let lastResult: CommandResult = { stdout: "", stderr: "", exitCode: 0 }
		const allStderr: string[] = []
		const allMetadata: string[] = [] // 收集所有阶段的元信息

		for (let i = 0; i < stages.length; i++) {
			const stage = stages[i]

			try {
				if (stage.handler) {
					// 进程内执行
					lastResult = await stage.handler.execute(stage.args, {
						...this.context,
						stdin: currentInput,
					})
				} else {
					// 透传执行
					lastResult = await this.executeNativeStage(stage.command, stage.args, currentInput)
				}

				// 收集 stderr
				if (lastResult.stderr) {
					allStderr.push(lastResult.stderr)
				}

				// 收集元信息（截断提示等），不传递给下一阶段
				if (lastResult.truncationMessage) {
					allMetadata.push(lastResult.truncationMessage)
				}

				// 管道语义：前一个命令的 stdout 是下一个命令的 stdin
				// 注意：只传递 stdout，不传递 metadata
				currentInput = lastResult.stdout

				// 管道语义：非零退出码中断管道
				if (lastResult.exitCode !== 0) {
					break
				}
			} catch (error) {
				// 执行错误，返回错误信息
				return {
					stdout: currentInput,
					stderr: `Error executing stage ${i + 1} (${stage.command}): ${error}`,
					exitCode: 1,
				}
			}
		}

		// 合并最终结果
		const result: CommandResult = {
			stdout: lastResult.stdout,
			stderr: allStderr.join("\n"),
			exitCode: lastResult.exitCode,
		}

		// 合并所有阶段的元信息
		if (allMetadata.length > 0) {
			result.truncated = true
			result.truncationMessage = allMetadata.join("\n")
		}

		return result
	}

	/**
	 * 执行原生命令（透传）
	 */
	private async executeNativeCommand(command: string): Promise<CommandResult> {
		try {
			const result = await execa({
				shell: true,
				cwd: this.context.cwd,
				reject: false,
				stdin: this.context.stdin ? "pipe" : "ignore",
				env: { ...process.env, ...this.context.env },
			})`${command}`

			return {
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode ?? 0,
			}
		} catch (error) {
			return {
				stdout: "",
				stderr: `Command execution failed: ${error}`,
				exitCode: 1,
			}
		}
	}

	/**
	 * 执行单个原生阶段（带 stdin）
	 */
	private async executeNativeStage(command: string, args: string[], stdin: string): Promise<CommandResult> {
		// 检查 stdin 大小
		if (stdin.length > CONSTANTS.MAX_STDIN_SIZE) {
			return {
				stdout: "",
				stderr: `stdin too large (${stdin.length} bytes), max ${CONSTANTS.MAX_STDIN_SIZE} bytes`,
				exitCode: 1,
			}
		}

		try {
			const result = await execa(command, args, {
				cwd: this.context.cwd,
				input: stdin || undefined,
				reject: false,
				env: { ...process.env, ...this.context.env },
			})

			return {
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode ?? 0,
			}
		} catch (error) {
			return {
				stdout: "",
				stderr: `Stage execution failed: ${error}`,
				exitCode: 1,
			}
		}
	}
}
