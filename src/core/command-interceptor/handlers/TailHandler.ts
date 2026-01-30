/**
 * Tail 命令处理器
 *
 * 输出文件或 stdin 的最后 N 行。
 *
 * 支持的功能：
 * - 指定行数 (-n, --lines)
 * - 指定字节数 (-c, --bytes)
 * - 多文件处理
 * - 从 stdin 读取
 *
 * 不支持的功能会透传：
 * - 实时跟踪 (-f, --follow)
 * - PID 跟踪 (--pid)
 */

import * as fs from "fs/promises"
import * as path from "path"

import { CommandContext, CommandResult } from "../types"
import { BaseHandler } from "./BaseHandler"

/**
 * 不支持的选项
 */
const UNSUPPORTED_FLAGS = new Set(["f", "follow", "F", "retry", "pid"])

/**
 * 带值的选项
 */
const OPTIONS_WITH_VALUE = new Set(["n", "lines", "c", "bytes", "pid"])

export class TailHandler extends BaseHandler {
	readonly name = "tail"
	readonly aliases: string[] = []

	canHandle(args: string[]): boolean {
		const parsed = this.parseArgs(args, OPTIONS_WITH_VALUE)

		for (const flag of parsed.flags) {
			if (UNSUPPORTED_FLAGS.has(flag)) {
				return false
			}
		}

		for (const [key] of parsed.options) {
			if (UNSUPPORTED_FLAGS.has(key)) {
				return false
			}
		}

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
			return this.failure("tail: no input")
		}

		// 过滤被忽略的文件
		const { allowed, blocked } = this.filterIgnoredFiles(files, context)

		if (allowed.length === 0) {
			const hint = this.formatBlockedFilesHint(blocked)
			return this.failure(`tail: all files are blocked by .rooignore${hint}`)
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
				errors.push(`tail: ${file}: ${(error as Error).message}`)
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
	 *
	 * 支持格式：
	 * - 10 (最后 10 行)
	 * - +10 (从第 10 行开始)
	 * - -10 (最后 10 行)
	 */
	private parseCount(value: string | undefined, defaultValue: number): number {
		if (!value) {
			return defaultValue
		}

		// 处理 +N 格式（从第 N 行开始，我们简化为返回负数标记）
		if (value.startsWith("+")) {
			const num = parseInt(value.slice(1), 10)
			return isNaN(num) ? defaultValue : -num // 负数表示从第 N 行开始
		}

		const num = parseInt(value, 10)
		return isNaN(num) ? defaultValue : Math.abs(num)
	}

	/**
	 * 处理内容
	 */
	private processContent(content: string, lineCount: number, byteCount: number): CommandResult {
		let output: string

		if (byteCount > 0) {
			// 按字节截取（最后 N 字节）
			output = content.slice(-byteCount)
		} else if (lineCount < 0) {
			// +N 格式：从第 N 行开始
			const lines = content.split("\n")
			const startLine = Math.abs(lineCount) - 1
			output = lines.slice(startLine).join("\n")
		} else {
			// 最后 N 行
			const lines = content.split("\n")
			// 处理末尾空行
			if (lines[lines.length - 1] === "") {
				output = lines.slice(-lineCount - 1, -1).join("\n")
			} else {
				output = lines.slice(-lineCount).join("\n")
			}
		}

		return this.success(output)
	}
}
