/**
 * Head 命令处理器
 *
 * 输出文件或 stdin 的前 N 行。
 *
 * 支持的功能：
 * - 指定行数 (-n, --lines)
 * - 指定字节数 (-c, --bytes)
 * - 多文件处理
 * - 从 stdin 读取
 */

import * as fs from "fs/promises"
import * as path from "path"

import { CommandContext, CommandResult } from "../types"
import { BaseHandler } from "./BaseHandler"

/**
 * 带值的选项
 */
const OPTIONS_WITH_VALUE = new Set(["n", "lines", "c", "bytes"])

export class HeadHandler extends BaseHandler {
	readonly name = "head"
	readonly aliases: string[] = []

	canHandle(_args: string[]): boolean {
		// head 命令的所有常用选项都支持
		return true
	}

	async execute(args: string[], context: CommandContext): Promise<CommandResult> {
		const parsed = this.parseArgs(args, OPTIONS_WITH_VALUE)

		// 解析行数或字节数
		const lineCount = this.parseCount(parsed.options.get("n") || parsed.options.get("lines"), 10)
		const byteCount = this.parseCount(parsed.options.get("c") || parsed.options.get("bytes"), 0)

		const files = parsed.positional

		// 如果没有文件参数，从 stdin 读取
		if (files.length === 0) {
			if (context.stdin) {
				return this.processContent(context.stdin, lineCount, byteCount)
			}
			return this.failure("head: no input")
		}

		// 过滤被忽略的文件
		const { allowed, blocked } = this.filterIgnoredFiles(files, context)

		if (allowed.length === 0) {
			const hint = this.formatBlockedFilesHint(blocked)
			return this.failure(`head: all files are blocked by .rooignore${hint}`)
		}

		// 处理文件
		const outputs: string[] = []
		const errors: string[] = []
		const showHeaders = allowed.length > 1

		for (const file of allowed) {
			try {
				const filePath = path.resolve(context.cwd, file)
				const content = await fs.readFile(filePath, "utf-8")

				if (showHeaders) {
					outputs.push(`==> ${file} <==`)
				}

				const result = this.processContent(content, lineCount, byteCount)
				outputs.push(result.stdout)

				if (showHeaders) {
					outputs.push("")
				}
			} catch (error) {
				errors.push(`head: ${file}: ${(error as Error).message}`)
			}
		}

		// 添加被忽略文件提示
		if (blocked.length > 0) {
			outputs.push(this.formatBlockedFilesHint(blocked))
		}

		return {
			stdout: outputs.join("\n").trimEnd(),
			stderr: errors.join("\n"),
			exitCode: errors.length > 0 ? 1 : 0,
		}
	}

	/**
	 * 解析数量参数
	 */
	private parseCount(value: string | undefined, defaultValue: number): number {
		if (!value) {
			return defaultValue
		}

		// 支持 -n -10 形式（负数表示排除最后 N 行，但我们简化处理）
		const num = parseInt(value, 10)
		return isNaN(num) ? defaultValue : Math.abs(num)
	}

	/**
	 * 处理内容
	 */
	private processContent(content: string, lineCount: number, byteCount: number): CommandResult {
		let output: string

		if (byteCount > 0) {
			// 按字节截取
			output = content.slice(0, byteCount)
		} else {
			// 按行截取
			const lines = content.split("\n")
			output = lines.slice(0, lineCount).join("\n")
		}

		return this.success(output)
	}
}
