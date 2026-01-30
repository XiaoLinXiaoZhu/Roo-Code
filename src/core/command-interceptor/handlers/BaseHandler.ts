/**
 * 命令处理器基类
 *
 * 提供通用功能：
 * - 参数解析辅助方法
 * - 输出格式化
 * - .rooignore 过滤
 */

import * as path from "path"

import { CommandContext, CommandHandler, CommandResult, CONSTANTS } from "../types"

/**
 * 解析后的命令参数
 */
export interface ParsedArgs {
	/** 标志参数（如 -r, --recursive） */
	flags: Set<string>
	/** 带值的选项（如 -n 10, --context=2） */
	options: Map<string, string>
	/** 位置参数（非标志、非选项的参数） */
	positional: string[]
}

export abstract class BaseHandler implements CommandHandler {
	abstract readonly name: string
	abstract readonly aliases?: string[]

	abstract canHandle(args: string[]): boolean
	abstract execute(args: string[], context: CommandContext): Promise<CommandResult>

	/**
	 * 解析命令行参数
	 *
	 * 支持的格式：
	 * - 短标志：-r, -v
	 * - 长标志：--recursive, --verbose
	 * - 短选项：-n 10, -C 2
	 * - 长选项：--context=2, --max-count=10
	 * - 组合短标志：-rv（等同于 -r -v）
	 */
	protected parseArgs(args: string[], optionsWithValue: Set<string> = new Set()): ParsedArgs {
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
			} else if (arg.startsWith("--")) {
				// 长选项
				const eqIndex = arg.indexOf("=")
				if (eqIndex !== -1) {
					// --option=value
					const key = arg.slice(2, eqIndex)
					const value = arg.slice(eqIndex + 1)
					options.set(key, value)
				} else {
					const key = arg.slice(2)
					if (optionsWithValue.has(key) && i + 1 < args.length) {
						// --option value
						options.set(key, args[i + 1])
						i++
					} else {
						// --flag
						flags.add(key)
					}
				}
			} else if (arg.startsWith("-") && arg.length > 1) {
				// 短选项或组合标志
				const chars = arg.slice(1)

				if (chars.length === 1) {
					// 单个短选项
					if (optionsWithValue.has(chars) && i + 1 < args.length) {
						options.set(chars, args[i + 1])
						i++
					} else {
						flags.add(chars)
					}
				} else {
					// 组合短标志或带值的短选项
					// 检查第一个字符是否是带值选项
					if (optionsWithValue.has(chars[0])) {
						// -n10 形式
						options.set(chars[0], chars.slice(1))
					} else {
						// -rv 形式，拆分为多个标志
						for (const char of chars) {
							flags.add(char)
						}
					}
				}
			} else {
				// 位置参数
				positional.push(arg)
			}

			i++
		}

		return { flags, options, positional }
	}

	/**
	 * 过滤被 .rooignore 忽略的文件
	 */
	protected filterIgnoredFiles(files: string[], context: CommandContext): { allowed: string[]; blocked: string[] } {
		if (!context.rooIgnoreController) {
			return { allowed: files, blocked: [] }
		}

		const allowed: string[] = []
		const blocked: string[] = []

		for (const file of files) {
			if (context.rooIgnoreController.validateAccess(file)) {
				allowed.push(file)
			} else {
				blocked.push(file)
			}
		}

		return { allowed, blocked }
	}

	/**
	 * 截断过长的行
	 */
	protected truncateLine(line: string, maxLength: number = CONSTANTS.MAX_LINE_LENGTH): string {
		if (line.length <= maxLength) {
			return line
		}
		return line.slice(0, maxLength) + " [truncated...]"
	}

	/**
	 * 格式化文件路径（转为相对路径）
	 */
	protected formatPath(filePath: string, cwd: string): string {
		const relativePath = path.relative(cwd, filePath)
		// 使用 POSIX 风格路径
		return relativePath.split(path.sep).join("/")
	}

	/**
	 * 创建成功结果
	 */
	protected success(stdout: string, stderr: string = ""): CommandResult {
		return { stdout, stderr, exitCode: 0 }
	}

	/**
	 * 创建失败结果
	 */
	protected failure(stderr: string, exitCode: number = 1): CommandResult {
		return { stdout: "", stderr, exitCode }
	}

	/**
	 * 格式化被忽略文件的提示
	 */
	protected formatBlockedFilesHint(blockedFiles: string[]): string {
		if (blockedFiles.length === 0) {
			return ""
		}
		return `\n🔒 ${blockedFiles.length} file(s) skipped (.rooignore)`
	}
}
