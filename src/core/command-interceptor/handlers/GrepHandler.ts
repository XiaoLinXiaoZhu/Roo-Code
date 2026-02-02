/**
 * Grep 命令处理器
 *
 * 使用 ripgrep 实现 grep 命令的语义，提供 LLM 友好的输出格式。
 *
 * 支持的功能：
 * - 基本正则搜索
 * - 递归搜索 (-r, -R, --recursive)
 * - 忽略大小写 (-i, --ignore-case)
 * - 显示行号 (-n, --line-number)
 * - 上下文行 (-C, --context, -A, -B)
 * - 文件模式 (--include)
 * - 从 stdin 搜索
 *
 * 不支持的功能会透传到原生 grep：
 * - Perl 正则 (-P)
 * - 二进制文件处理
 * - 复杂的输出格式选项
 */

import * as path from "path"
import * as fs from "fs/promises"

import * as vscode from "vscode"

import { CommandContext, CommandResult, CONSTANTS } from "../types"
import { BaseHandler, ParsedArgs } from "./BaseHandler"
import { getBinPath } from "../../../services/ripgrep"
import { execRipgrepWithArgs, RipgrepMatch } from "./ripgrep-utils"

/**
 * 不支持的 grep 选项（遇到时透传执行）
 */
const UNSUPPORTED_FLAGS = new Set([
	"P",
	"perl-regexp", // Perl 正则
	"z",
	"null-data", // NUL 分隔
	"Z",
	"null", // NUL 输出
	"o",
	"only-matching", // 只输出匹配部分（改变输出格式）
	"c",
	"count", // 只输出计数
	"l",
	"files-with-matches", // 只输出文件名
	"L",
	"files-without-match",
])

/**
 * 带值的选项
 */
const OPTIONS_WITH_VALUE = new Set([
	"A",
	"after-context",
	"B",
	"before-context",
	"C",
	"context",
	"m",
	"max-count",
	"e",
	"regexp",
	"f",
	"file",
	"include",
	"exclude",
])

export class GrepHandler extends BaseHandler {
	readonly name = "grep"
	readonly aliases = ["egrep", "fgrep"]

	canHandle(args: string[]): boolean {
		const parsed = this.parseArgs(args, OPTIONS_WITH_VALUE)

		// 检查是否有不支持的选项
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

		// 提取搜索模式
		const pattern = this.extractPattern(parsed)
		if (!pattern) {
			return this.failure("grep: no pattern specified")
		}

		// 提取搜索选项
		const options = this.extractOptions(parsed)

		// 确定搜索目标
		const files = parsed.positional.slice(pattern === parsed.positional[0] ? 1 : 0)

		// 如果有 stdin，从 stdin 搜索
		if (context.stdin && files.length === 0) {
			return this.searchStdin(pattern, context.stdin, options)
		}

		// 如果没有文件参数，搜索当前目录
		const searchPaths = files.length > 0 ? files : ["."]

		// 过滤被忽略的文件
		const { allowed, blocked } = this.filterIgnoredFiles(searchPaths, context)

		if (allowed.length === 0) {
			const hint = this.formatBlockedFilesHint(blocked)
			return this.failure(`grep: no files to search${hint}`)
		}

		// 使用 ripgrep 执行搜索
		try {
			const results = await this.searchWithRipgrep(context.cwd, allowed, pattern, options)
			const output = this.formatOutput(results, context.cwd)

			const result: CommandResult = {
				stdout: output,
				stderr: "",
				exitCode: results.length > 0 ? 0 : 1,
			}

			// 被忽略文件提示放入 metadata
			if (blocked.length > 0) {
				result.truncationMessage = this.formatBlockedFilesHint(blocked)
			}

			return result
		} catch (error) {
			return this.failure(`grep: ${error}`)
		}
	}

	/**
	 * 从参数中提取搜索模式
	 */
	private extractPattern(parsed: ParsedArgs): string | null {
		// -e pattern 或 --regexp=pattern
		const explicitPattern = parsed.options.get("e") || parsed.options.get("regexp")
		if (explicitPattern) {
			return explicitPattern
		}

		// 第一个位置参数
		if (parsed.positional.length > 0) {
			return parsed.positional[0]
		}

		return null
	}

	/**
	 * 提取搜索选项
	 */
	private extractOptions(parsed: ParsedArgs): GrepOptions {
		return {
			ignoreCase: parsed.flags.has("i") || parsed.flags.has("ignore-case"),
			recursive: parsed.flags.has("r") || parsed.flags.has("R") || parsed.flags.has("recursive"),
			lineNumber: parsed.flags.has("n") || parsed.flags.has("line-number"),
			contextBefore: parseInt(parsed.options.get("B") || parsed.options.get("before-context") || "0"),
			contextAfter: parseInt(parsed.options.get("A") || parsed.options.get("after-context") || "0"),
			contextBoth: parseInt(parsed.options.get("C") || parsed.options.get("context") || "1"),
			maxCount: parseInt(parsed.options.get("m") || parsed.options.get("max-count") || "0"),
			includePattern: parsed.options.get("include"),
			excludePattern: parsed.options.get("exclude"),
			invertMatch: parsed.flags.has("v") || parsed.flags.has("invert-match"),
			wordRegexp: parsed.flags.has("w") || parsed.flags.has("word-regexp"),
			fixedStrings: parsed.flags.has("F") || parsed.flags.has("fixed-strings"),
		}
	}

	/**
	 * 从 stdin 搜索
	 */
	private searchStdin(pattern: string, stdin: string, options: GrepOptions): CommandResult {
		const lines = stdin.split("\n")
		const matches: string[] = []

		let regex: RegExp
		try {
			const flags = options.ignoreCase ? "gi" : "g"
			// 先转换 BRE 语法，再处理 fixedStrings
			const convertedPattern = options.fixedStrings ? pattern : this.convertBREtoRustRegex(pattern)
			const patternStr = options.fixedStrings ? this.escapeRegex(convertedPattern) : convertedPattern
			regex = new RegExp(patternStr, flags)
		} catch (error) {
			return this.failure(`grep: invalid regex: ${error}`)
		}

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const isMatch = regex.test(line)
			const shouldInclude = options.invertMatch ? !isMatch : isMatch

			if (shouldInclude) {
				if (options.lineNumber) {
					matches.push(`${i + 1}:${line}`)
				} else {
					matches.push(line)
				}

				if (options.maxCount > 0 && matches.length >= options.maxCount) {
					break
				}
			}

			// 重置 regex 的 lastIndex
			regex.lastIndex = 0
		}

		return {
			stdout: matches.join("\n"),
			stderr: "",
			exitCode: matches.length > 0 ? 0 : 1,
		}
	}

	/**
	 * 使用 ripgrep 执行搜索
	 */
	private async searchWithRipgrep(
		cwd: string,
		paths: string[],
		pattern: string,
		options: GrepOptions,
	): Promise<RipgrepMatch[]> {
		const vscodeAppRoot = vscode.env.appRoot
		const rgPath = await getBinPath(vscodeAppRoot)

		if (!rgPath) {
			throw new Error("Could not find ripgrep binary")
		}

		// 构建 ripgrep 参数
		const args: string[] = ["--json"]

		if (options.ignoreCase) {
			args.push("-i")
		}

		if (options.fixedStrings) {
			args.push("-F")
		}

		if (options.wordRegexp) {
			args.push("-w")
		}

		if (options.invertMatch) {
			args.push("-v")
		}

		// 上下文行数
		const contextLines = Math.max(options.contextBefore, options.contextAfter, options.contextBoth)
		if (contextLines > 0) {
			args.push("--context", contextLines.toString())
		}

		if (options.includePattern) {
			args.push("--glob", options.includePattern)
		}

		if (options.excludePattern) {
			args.push("--glob", `!${options.excludePattern}`)
		}

		// 添加模式和路径
		// 将 BRE 语法转换为 Rust regex 语法
		const convertedPattern = this.convertBREtoRustRegex(pattern)
		args.push("-e", convertedPattern)
		args.push("--no-messages")

		for (const p of paths) {
			args.push(path.resolve(cwd, p))
		}

		return execRipgrepWithArgs(rgPath, args, cwd, CONSTANTS.MAX_RESULTS)
	}

	/**
	 * 格式化输出（与 search_files 保持一致的 LLM 友好格式）
	 */
	private formatOutput(results: RipgrepMatch[], cwd: string): string {
		if (results.length === 0) {
			return `No results found.`
		}

		const lines: string[] = []

		// 统计信息（与 search_files 格式一致）
		const matchCount = results.length

		if (matchCount >= CONSTANTS.MAX_RESULTS) {
			lines.push(
				`Showing first ${CONSTANTS.MAX_RESULTS} of ${CONSTANTS.MAX_RESULTS}+ results. Use a more specific search if necessary.`,
			)
		} else {
			lines.push(`Found ${matchCount === 1 ? "1 result" : `${matchCount.toLocaleString()} results`}.`)
		}
		lines.push("")

		// 按文件分组输出（与 search_files 格式一致）
		let currentFile = ""
		for (const match of results) {
			const relativePath = this.formatPath(match.file, cwd)

			if (relativePath !== currentFile) {
				if (currentFile !== "") {
					lines.push("")
				}
				currentFile = relativePath
				lines.push(`# ${relativePath}`)
			}

			// 使用 padStart(3) 与 search_files 保持一致
			const lineNum = match.line.toString().padStart(3, " ")
			const text = this.truncateLine(match.text.trimEnd())
			lines.push(`${lineNum} | ${text}`)
		}

		// 每个结果块后添加分隔符
		if (currentFile !== "") {
			lines.push("----")
		}

		return lines.join("\n").trim()
	}

	/**
	 * 转义正则表达式特殊字符
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	}

	/**
	 * 将 GNU grep 的 BRE (Basic Regular Expression) 语法转换为 Rust regex 语法
	 *
	 * BRE 中需要转义才能表示特殊含义的字符，在 Rust regex 中直接使用：
	 * - \| → | (OR)
	 * - \+ → + (一个或多个)
	 * - \? → ? (零个或一个)
	 * - \( → ( (分组开始)
	 * - \) → ) (分组结束)
	 * - \{ → { (量词开始)
	 * - \} → } (量词结束)
	 */
	private convertBREtoRustRegex(pattern: string): string {
		return pattern
			.replace(/\\\|/g, "|")
			.replace(/\\\+/g, "+")
			.replace(/\\\?/g, "?")
			.replace(/\\\(/g, "(")
			.replace(/\\\)/g, ")")
			.replace(/\\\{/g, "{")
			.replace(/\\\}/g, "}")
	}
}

/**
 * Grep 选项
 */
interface GrepOptions {
	ignoreCase: boolean
	recursive: boolean
	lineNumber: boolean
	contextBefore: number
	contextAfter: number
	contextBoth: number
	maxCount: number
	includePattern?: string
	excludePattern?: string
	invertMatch: boolean
	wordRegexp: boolean
	fixedStrings: boolean
}
