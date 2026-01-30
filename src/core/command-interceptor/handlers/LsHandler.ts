/**
 * Ls 命令处理器
 *
 * 列出目录内容，提供 LLM 友好的格式。
 *
 * 支持的功能：
 * - 基本列表
 * - 长格式 (-l)
 * - 显示隐藏文件 (-a, -A)
 * - 递归列表 (-R)
 * - 人类可读大小 (-h)
 *
 * 不支持的功能会透传：
 * - 颜色输出 (--color)
 * - 排序选项 (-S, -t, -X)
 */

import * as path from "path"
import * as fs from "fs/promises"

import { CommandContext, CommandResult, CONSTANTS } from "../types"
import { BaseHandler } from "./BaseHandler"

/**
 * 不支持的选项
 */
const UNSUPPORTED_FLAGS = new Set(["color", "S", "t", "X", "U", "v", "sort"])

export class LsHandler extends BaseHandler {
	readonly name = "ls"
	readonly aliases = ["dir"]

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

		// 提取选项
		const options: LsOptions = {
			long: parsed.flags.has("l"),
			all: parsed.flags.has("a"),
			almostAll: parsed.flags.has("A"),
			recursive: parsed.flags.has("R"),
			humanReadable: parsed.flags.has("h"),
		}

		// 确定列表路径
		const paths = parsed.positional.length > 0 ? parsed.positional : ["."]

		// 过滤被忽略的路径
		const { allowed, blocked } = this.filterIgnoredFiles(paths, context)

		if (allowed.length === 0) {
			const hint = this.formatBlockedFilesHint(blocked)
			return this.failure(`ls: all paths are blocked by .rooignore${hint}`)
		}

		try {
			const outputs: string[] = []
			const errors: string[] = []
			const showHeaders = allowed.length > 1 || options.recursive

			for (const dirPath of allowed) {
				try {
					const fullPath = path.resolve(context.cwd, dirPath)
					const stat = await fs.stat(fullPath)

					if (stat.isDirectory()) {
						const result = await this.listDirectory(fullPath, dirPath, options, context, showHeaders)
						outputs.push(result)
					} else {
						// 单个文件
						const fileInfo = await this.formatFileInfo(fullPath, path.basename(dirPath), options)
						outputs.push(fileInfo)
					}
				} catch (error) {
					errors.push(`ls: ${dirPath}: ${(error as Error).message}`)
				}
			}

			// 添加被忽略路径提示
			if (blocked.length > 0) {
				outputs.push(this.formatBlockedFilesHint(blocked))
			}

			return {
				stdout: outputs.join("\n").trim(),
				stderr: errors.join("\n"),
				exitCode: errors.length > 0 ? 1 : 0,
			}
		} catch (error) {
			return this.failure(`ls: ${error}`)
		}
	}

	/**
	 * 列出目录内容
	 */
	private async listDirectory(
		fullPath: string,
		displayPath: string,
		options: LsOptions,
		context: CommandContext,
		showHeader: boolean,
	): Promise<string> {
		const entries = await fs.readdir(fullPath, { withFileTypes: true })
		const lines: string[] = []

		if (showHeader) {
			lines.push(`${displayPath}:`)
		}

		// 过滤隐藏文件
		let filteredEntries = entries
		if (!options.all && !options.almostAll) {
			filteredEntries = entries.filter((e) => !e.name.startsWith("."))
		} else if (options.almostAll) {
			filteredEntries = entries.filter((e) => e.name !== "." && e.name !== "..")
		}

		// 过滤被 .rooignore 忽略的文件
		filteredEntries = filteredEntries.filter((e) => {
			if (!context.rooIgnoreController) return true
			const entryPath = path.join(displayPath, e.name)
			return context.rooIgnoreController.validateAccess(entryPath)
		})

		// 排序
		filteredEntries.sort((a, b) => a.name.localeCompare(b.name))

		if (options.long) {
			// 长格式
			for (const entry of filteredEntries) {
				const entryPath = path.join(fullPath, entry.name)
				const info = await this.formatFileInfo(entryPath, entry.name, options)
				lines.push(info)
			}
		} else {
			// 简单格式
			const names = filteredEntries.map((e) => {
				if (e.isDirectory()) {
					return e.name + "/"
				}
				return e.name
			})
			lines.push(names.join("  "))
		}

		// 递归处理子目录
		if (options.recursive) {
			for (const entry of filteredEntries) {
				if (entry.isDirectory()) {
					const subPath = path.join(fullPath, entry.name)
					const subDisplayPath = path.join(displayPath, entry.name)
					lines.push("")
					const subResult = await this.listDirectory(subPath, subDisplayPath, options, context, true)
					lines.push(subResult)
				}
			}
		}

		return lines.join("\n")
	}

	/**
	 * 格式化文件信息（长格式）
	 */
	private async formatFileInfo(filePath: string, name: string, options: LsOptions): Promise<string> {
		try {
			const stat = await fs.stat(filePath)

			const type = stat.isDirectory() ? "d" : stat.isSymbolicLink() ? "l" : "-"
			const size = options.humanReadable ? this.formatSize(stat.size) : stat.size.toString()
			const mtime = this.formatDate(stat.mtime)

			// 简化的权限显示
			const perms = stat.isDirectory() ? "rwxr-xr-x" : "rw-r--r--"

			return `${type}${perms}  ${size.padStart(8)}  ${mtime}  ${name}${stat.isDirectory() ? "/" : ""}`
		} catch {
			return name
		}
	}

	/**
	 * 格式化文件大小
	 */
	private formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`
	}

	/**
	 * 格式化日期
	 */
	private formatDate(date: Date): string {
		const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
		const month = months[date.getMonth()]
		const day = date.getDate().toString().padStart(2, " ")
		const hours = date.getHours().toString().padStart(2, "0")
		const minutes = date.getMinutes().toString().padStart(2, "0")
		return `${month} ${day} ${hours}:${minutes}`
	}
}

/**
 * Ls 选项
 */
interface LsOptions {
	long: boolean
	all: boolean
	almostAll: boolean
	recursive: boolean
	humanReadable: boolean
}
