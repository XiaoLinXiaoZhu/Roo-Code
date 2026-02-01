/**
 * Find 命令处理器
 *
 * 使用 fs 原生实现 find 命令的文件搜索功能。
 *
 * 支持的功能：
 * - 按名称搜索 (-name, -iname)
 * - 按类型搜索 (-type f/d)
 * - 限制深度 (-maxdepth)
 * - 从 stdin 读取路径
 *
 * 不支持的功能会透传：
 * - 执行操作 (-exec, -delete)
 * - 时间过滤 (-mtime, -atime)
 * - 权限过滤 (-perm)
 * - 复杂表达式 (-and, -or, -not)
 */

import * as path from "path"
import * as fs from "fs/promises"

import { CommandContext, CommandResult, CONSTANTS } from "../types"
import { BaseHandler, ParsedArgs } from "./BaseHandler"

/**
 * 不支持的选项（遇到时透传执行）
 */
const UNSUPPORTED_FLAGS = new Set([
	"exec",
	"execdir",
	"delete",
	"print0",
	"printf",
	"mtime",
	"atime",
	"ctime",
	"newer",
	"perm",
	"user",
	"group",
	"size",
	"empty",
	"a",
	"and", // -a, -and (AND 操作符)
	"o",
	"or", // -o, -or (OR 操作符)
	"not", // -not (NOT 操作符)
	"!", // ! (NOT 操作符的另一种形式)
])

/**
 * 带值的选项
 */
const OPTIONS_WITH_VALUE = new Set(["name", "iname", "type", "maxdepth", "mindepth", "path", "ipath"])

export class FindHandler extends BaseHandler {
	readonly name = "find"
	readonly aliases: string[] = []

	canHandle(args: string[]): boolean {
		// 直接遍历原始参数，检查 find 风格的选项（单破折号+长名称）
		for (const arg of args) {
			// 检查 ! 操作符（不以 - 开头）
			if (arg === "!") {
				return false
			}

			// 检查是否以 `-` 开头但不是 `--`
			if (arg.startsWith("-") && !arg.startsWith("--")) {
				// 提取选项名称（去掉前导 `-`）
				const optionName = arg.substring(1)

				// 检查是否在不支持的选项列表中
				if (UNSUPPORTED_FLAGS.has(optionName)) {
					return false
				}
			}
		}

		return true
	}

	/**
	 * 解析 find 风格的参数
	 *
	 * find 命令的选项格式是单破折号+长名称（如 -name, -type），而不是 GNU 风格。
	 *
	 * 处理流程：
	 * 1. 遍历 args 数组
	 * 2. 如果参数以 `-` 开头但不是 `--`，提取选项名称（去掉前导 `-`）
	 * 3. 如果选项名称在 OPTIONS_WITH_VALUE 中，下一个参数是值
	 * 4. 否则是标志
	 * 5. 不以 `-` 开头的参数是位置参数（搜索路径）
	 */
	private parseFindArgs(args: string[]): ParsedArgs {
		const flags = new Set<string>()
		const options = new Map<string, string>()
		const positional: string[] = []

		let i = 0
		while (i < args.length) {
			const arg = args[i]

			if (arg === "--") {
				// -- 后面的都是位置参数
				positional.push(...args.slice(i + 1))
				break
			} else if (arg.startsWith("-") && !arg.startsWith("--")) {
				// find 风格的选项：单破折号+长名称
				const optionName = arg.substring(1)

				if (OPTIONS_WITH_VALUE.has(optionName)) {
					// 选项需要值，从下一个参数获取
					if (i + 1 < args.length) {
						options.set(optionName, args[i + 1])
						i++
					} else {
						// 没有值，作为标志处理
						flags.add(optionName)
					}
				} else {
					// 标志
					flags.add(optionName)
				}
			} else {
				// 位置参数（搜索路径）
				positional.push(arg)
			}

			i++
		}

		return { flags, options, positional }
	}

	async execute(args: string[], context: CommandContext): Promise<CommandResult> {
		const parsed = this.parseFindArgs(args)

		// 提取搜索选项
		const options = this.extractOptions(parsed)

		// 确定搜索路径
		const searchPaths = parsed.positional.length > 0 ? parsed.positional : ["."]

		// 过滤被忽略的路径
		const { allowed, blocked } = this.filterIgnoredFiles(searchPaths, context)

		if (allowed.length === 0) {
			const hint = this.formatBlockedFilesHint(blocked)
			return this.failure(`find: no paths to search${hint}`)
		}

		try {
			const results = await this.searchFiles(context.cwd, allowed, options)

			// 过滤结果中被忽略的文件
			const filteredResults = results.filter((file) => {
				if (!context.rooIgnoreController) return true
				return context.rooIgnoreController.validateAccess(file)
			})

			const output = this.formatOutput(filteredResults, context.cwd, blocked)

			return {
				stdout: output,
				stderr: "",
				exitCode: filteredResults.length > 0 ? 0 : 1,
			}
		} catch (error) {
			return this.failure(`find: ${error}`)
		}
	}

	/**
	 * 提取搜索选项
	 */
	private extractOptions(parsed: ReturnType<typeof this.parseArgs>): FindOptions {
		return {
			namePattern: parsed.options.get("name"),
			inamePattern: parsed.options.get("iname"),
			type: parsed.options.get("type") as "f" | "d" | undefined,
			maxDepth: parseInt(parsed.options.get("maxdepth") || "0") || undefined,
			minDepth: parseInt(parsed.options.get("mindepth") || "0") || undefined,
		}
	}

	/**
	 * 使用 fs 原生实现搜索文件
	 */
	private async searchFiles(cwd: string, paths: string[], options: FindOptions): Promise<string[]> {
		const results: string[] = []
		const maxResults = CONSTANTS.MAX_RESULTS

		for (const searchPath of paths) {
			if (results.length >= maxResults) {
				break
			}

			const fullPath = path.resolve(cwd, searchPath)
			await this.recursiveSearch(fullPath, cwd, options, results, maxResults, 0)
		}

		return results
	}

	/**
	 * 递归搜索目录
	 */
	private async recursiveSearch(
		currentPath: string,
		cwd: string,
		options: FindOptions,
		results: string[],
		maxResults: number,
		currentDepth: number,
	): Promise<void> {
		// 检查深度限制
		if (options.maxDepth !== undefined && currentDepth > options.maxDepth) {
			return
		}

		// 检查结果数量限制
		if (results.length >= maxResults) {
			return
		}

		try {
			const stat = await fs.stat(currentPath)

			// 处理单个文件
			if (stat.isFile()) {
				const shouldInclude = this.shouldIncludeFile(currentPath, options)
				if (shouldInclude) {
					const relativePath = path.relative(cwd, currentPath)
					results.push(relativePath)
				}
				return
			}

			// 处理目录
			if (stat.isDirectory()) {
				// 检查是否应该包含目录本身
				if (currentDepth > 0) {
					const shouldInclude = this.shouldIncludeDirectory(currentPath, options)
					if (shouldInclude) {
						const relativePath = path.relative(cwd, currentPath)
						results.push(relativePath)
						if (results.length >= maxResults) {
							return
						}
					}
				}

				// 递归遍历目录内容
				const entries = await fs.readdir(currentPath)
				for (const entry of entries) {
					if (results.length >= maxResults) {
						break
					}

					const entryPath = path.join(currentPath, entry)
					await this.recursiveSearch(entryPath, cwd, options, results, maxResults, currentDepth + 1)
				}
			}
		} catch (error) {
			// 忽略无法访问的文件/目录
		}
	}

	/**
	 * 检查文件是否应该被包含
	 */
	private shouldIncludeFile(filePath: string, options: FindOptions): boolean {
		// 类型过滤：如果指定了 -type d，则不包含文件
		if (options.type === "d") {
			return false
		}

		// 名称模式匹配
		const fileName = path.basename(filePath)

		// 检查 namePattern
		if (options.namePattern) {
			if (!this.matchesPattern(fileName, options.namePattern, false)) {
				return false
			}
		}

		// 检查 inamePattern
		if (options.inamePattern) {
			if (!this.matchesPattern(fileName, options.inamePattern, true)) {
				return false
			}
		}

		return true
	}

	/**
	 * 检查目录是否应该被包含
	 */
	private shouldIncludeDirectory(dirPath: string, options: FindOptions): boolean {
		// 类型过滤：如果指定了 -type f，则不包含目录
		if (options.type === "f") {
			return false
		}

		// 名称模式匹配
		const dirName = path.basename(dirPath)

		// 检查 namePattern
		if (options.namePattern) {
			if (!this.matchesPattern(dirName, options.namePattern, false)) {
				return false
			}
		}

		// 检查 inamePattern
		if (options.inamePattern) {
			if (!this.matchesPattern(dirName, options.inamePattern, true)) {
				return false
			}
		}

		return true
	}

	/**
	 * 匹配文件名模式（支持 glob 通配符 * 和 ?）
	 * @param fileName 文件名
	 * @param pattern glob 模式
	 * @param caseInsensitive 是否忽略大小写
	 */
	private matchesPattern(fileName: string, pattern: string, caseInsensitive: boolean = false): boolean {
		const name = caseInsensitive ? fileName.toLowerCase() : fileName
		const pat = caseInsensitive ? pattern.toLowerCase() : pattern

		// 将 glob 模式转换为正则表达式
		let regexPattern = ""
		for (let i = 0; i < pat.length; i++) {
			const char = pat[i]
			if (char === "*") {
				regexPattern += ".*"
			} else if (char === "?") {
				regexPattern += "."
			} else if ("^$.|+()[]{}\\".includes(char)) {
				regexPattern += "\\" + char
			} else {
				regexPattern += char
			}
		}

		// 匹配整个文件名
		const regex = new RegExp(`^${regexPattern}$`)
		return regex.test(name)
	}

	/**
	 * 格式化输出
	 */
	private formatOutput(results: string[], cwd: string, blockedPaths: string[]): string {
		if (results.length === 0) {
			const hint = this.formatBlockedFilesHint(blockedPaths)
			return `No files found.${hint}`
		}

		const lines: string[] = []

		// 统计信息
		if (results.length >= CONSTANTS.MAX_RESULTS) {
			lines.push(`Showing first ${CONSTANTS.MAX_RESULTS} of ${CONSTANTS.MAX_RESULTS}+ results.`)
		} else {
			lines.push(`Found ${results.length === 1 ? "1 file" : `${results.length.toLocaleString()} files`}.`)
		}
		lines.push("")

		// 文件列表
		for (const file of results) {
			lines.push(file)
		}

		// 添加被忽略路径提示
		const hint = this.formatBlockedFilesHint(blockedPaths)
		if (hint) {
			lines.push("")
			lines.push(hint)
		}

		return lines.join("\n")
	}
}

/**
 * Find 选项
 */
interface FindOptions {
	namePattern?: string
	inamePattern?: string
	type?: "f" | "d"
	maxDepth?: number
	minDepth?: number
}
