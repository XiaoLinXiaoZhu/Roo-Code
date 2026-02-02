/**
 * Cat 命令处理器
 *
 * 读取文件内容并输出，提供 LLM 友好的格式。
 *
 * 支持的功能：
 * - 读取单个或多个文件
 * - 显示行号 (-n, --number)
 * - 从 stdin 读取
 *
 * 不支持的功能会透传：
 * - 显示非打印字符 (-v, -e, -t)
 * - 压缩空行 (-s)
 */

import * as fs from "fs/promises"
import * as path from "path"

import { CommandContext, CommandResult } from "../types"
import { BaseHandler } from "./BaseHandler"

/**
 * 不支持的选项
 */
const UNSUPPORTED_FLAGS = new Set([
	"v",
	"show-nonprinting",
	"e",
	"E",
	"show-ends",
	"t",
	"T",
	"show-tabs",
	"s",
	"squeeze-blank",
	"A",
	"show-all",
])

export class CatHandler extends BaseHandler {
	readonly name = "cat"
	readonly aliases: string[] = []

	canHandle(args: string[]): boolean {
		const parsed = this.parseArgs(args)

		for (const flag of parsed.flags) {
			if (UNSUPPORTED_FLAGS.has(flag)) {
				return false
			}
		}

		return true
	}

	async execute(args: string[], context: CommandContext): Promise<CommandResult> {
		const parsed = this.parseArgs(args)
		const showLineNumbers = parsed.flags.has("n") || parsed.flags.has("number")
		const files = parsed.positional

		// 如果没有文件参数，从 stdin 读取
		if (files.length === 0) {
			if (context.stdin) {
				return this.formatStdin(context.stdin, showLineNumbers)
			}
			return this.failure("cat: no input files")
		}

		// 过滤被忽略的文件
		const { allowed, blocked } = this.filterIgnoredFiles(files, context)

		if (allowed.length === 0) {
			const hint = this.formatBlockedFilesHint(blocked)
			return this.failure(`cat: all files are blocked by .rooignore${hint}`)
		}

		// 读取文件内容
		const outputs: string[] = []
		const errors: string[] = []

		for (const file of allowed) {
			try {
				const filePath = path.resolve(context.cwd, file)
				const content = await fs.readFile(filePath, "utf-8")
				const formatted = this.formatFileContent(file, content, showLineNumbers, allowed.length > 1)
				outputs.push(formatted)
			} catch (error) {
				errors.push(`cat: ${file}: ${(error as Error).message}`)
			}
		}

		// 构建结果
		const result: CommandResult = {
			stdout: outputs.join("\n"),
			stderr: errors.join("\n"),
			exitCode: errors.length > 0 ? 1 : 0,
		}

		// 被忽略文件提示放入 metadata（截断由外层 CliOutputTruncator 统一处理）
		if (blocked.length > 0) {
			result.truncationMessage = this.formatBlockedFilesHint(blocked)
		}

		return result
	}

	/**
	 * 格式化 stdin 内容
	 */
	private formatStdin(stdin: string, showLineNumbers: boolean): CommandResult {
		if (!showLineNumbers) {
			return this.success(stdin)
		}

		const lines = stdin.split("\n")
		const numbered = lines.map((line, i) => {
			const lineNum = (i + 1).toString().padStart(6, " ")
			return `${lineNum}  ${line}`
		})

		return this.success(numbered.join("\n"))
	}

	/**
	 * 格式化文件内容
	 */
	private formatFileContent(file: string, content: string, showLineNumbers: boolean, showFileName: boolean): string {
		const lines: string[] = []

		if (showFileName) {
			lines.push(`# ${file}`)
		}

		const contentLines = content.split("\n")

		for (let i = 0; i < contentLines.length; i++) {
			let line = contentLines[i]

			// 截断过长的行
			line = this.truncateLine(line)

			if (showLineNumbers) {
				const lineNum = (i + 1).toString().padStart(6, " ")
				lines.push(`${lineNum}  ${line}`)
			} else {
				lines.push(line)
			}
		}

		if (showFileName) {
			lines.push("----")
		}

		return lines.join("\n")
	}
}
