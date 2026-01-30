/**
 * Wc 命令处理器
 *
 * 统计文件的行数、单词数、字符数。
 *
 * 支持的功能：
 * - 行数统计 (-l, --lines)
 * - 单词数统计 (-w, --words)
 * - 字符数统计 (-c, --bytes, -m, --chars)
 * - 从 stdin 读取
 * - 多文件统计
 */

import * as path from "path"
import * as fs from "fs/promises"

import { CommandContext, CommandResult } from "../types"
import { BaseHandler } from "./BaseHandler"

export class WcHandler extends BaseHandler {
	readonly name = "wc"
	readonly aliases: string[] = []

	canHandle(_args: string[]): boolean {
		// wc 命令的所有常用选项都支持
		return true
	}

	async execute(args: string[], context: CommandContext): Promise<CommandResult> {
		const parsed = this.parseArgs(args)

		// 提取选项
		const options: WcOptions = {
			lines: parsed.flags.has("l") || parsed.flags.has("lines"),
			words: parsed.flags.has("w") || parsed.flags.has("words"),
			chars:
				parsed.flags.has("c") ||
				parsed.flags.has("bytes") ||
				parsed.flags.has("m") ||
				parsed.flags.has("chars"),
		}

		// 如果没有指定任何选项，默认显示全部
		if (!options.lines && !options.words && !options.chars) {
			options.lines = true
			options.words = true
			options.chars = true
		}

		const files = parsed.positional

		// 如果没有文件参数，从 stdin 读取
		if (files.length === 0) {
			if (context.stdin) {
				const stats = this.countStats(context.stdin)
				return this.success(this.formatStats(stats, options))
			}
			return this.failure("wc: no input")
		}

		// 过滤被忽略的文件
		const { allowed, blocked } = this.filterIgnoredFiles(files, context)

		if (allowed.length === 0) {
			const hint = this.formatBlockedFilesHint(blocked)
			return this.failure(`wc: all files are blocked by .rooignore${hint}`)
		}

		// 统计文件
		const results: FileStats[] = []
		const errors: string[] = []
		let total: Stats = { lines: 0, words: 0, chars: 0 }

		for (const file of allowed) {
			try {
				const filePath = path.resolve(context.cwd, file)
				const content = await fs.readFile(filePath, "utf-8")
				const stats = this.countStats(content)

				results.push({ file, stats })

				total.lines += stats.lines
				total.words += stats.words
				total.chars += stats.chars
			} catch (error) {
				errors.push(`wc: ${file}: ${(error as Error).message}`)
			}
		}

		// 格式化输出
		const output = this.formatOutput(results, total, options, allowed.length > 1, blocked)

		return {
			stdout: output,
			stderr: errors.join("\n"),
			exitCode: errors.length > 0 ? 1 : 0,
		}
	}

	/**
	 * 统计内容
	 */
	private countStats(content: string): Stats {
		// 空内容特殊处理
		if (content.length === 0) {
			return { lines: 0, words: 0, chars: 0 }
		}

		const lines = content.split("\n").length - (content.endsWith("\n") ? 1 : 0)
		const words = content.split(/\s+/).filter((w) => w.length > 0).length
		const chars = content.length

		return { lines, words, chars }
	}

	/**
	 * 格式化单个统计结果
	 */
	private formatStats(stats: Stats, options: WcOptions, filename?: string): string {
		const parts: string[] = []

		if (options.lines) {
			parts.push(stats.lines.toString().padStart(8))
		}
		if (options.words) {
			parts.push(stats.words.toString().padStart(8))
		}
		if (options.chars) {
			parts.push(stats.chars.toString().padStart(8))
		}

		if (filename) {
			parts.push(` ${filename}`)
		}

		return parts.join("")
	}

	/**
	 * 格式化输出
	 */
	private formatOutput(
		results: FileStats[],
		total: Stats,
		options: WcOptions,
		showTotal: boolean,
		blockedFiles: string[],
	): string {
		const lines: string[] = []

		for (const { file, stats } of results) {
			lines.push(this.formatStats(stats, options, file))
		}

		if (showTotal) {
			lines.push(this.formatStats(total, options, "total"))
		}

		// 添加被忽略文件提示
		const hint = this.formatBlockedFilesHint(blockedFiles)
		if (hint) {
			lines.push("")
			lines.push(hint)
		}

		return lines.join("\n")
	}
}

/**
 * Wc 选项
 */
interface WcOptions {
	lines: boolean
	words: boolean
	chars: boolean
}

/**
 * 统计结果
 */
interface Stats {
	lines: number
	words: number
	chars: number
}

/**
 * 文件统计结果
 */
interface FileStats {
	file: string
	stats: Stats
}
