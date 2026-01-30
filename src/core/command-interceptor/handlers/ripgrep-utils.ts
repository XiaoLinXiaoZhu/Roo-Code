/**
 * Ripgrep 工具函数
 *
 * 提供 ripgrep 执行和结果解析的通用功能。
 */

import * as childProcess from "child_process"
import * as readline from "readline"
import * as path from "path"

/**
 * Ripgrep 匹配结果
 */
export interface RipgrepMatch {
	/** 文件路径 */
	file: string
	/** 行号 */
	line: number
	/** 匹配的文本 */
	text: string
	/** 是否为匹配行（vs 上下文行） */
	isMatch: boolean
}

/**
 * 执行 ripgrep 并解析 JSON 输出
 *
 * @param rgPath - ripgrep 二进制路径
 * @param args - ripgrep 参数
 * @param cwd - 工作目录
 * @param maxResults - 最大结果数
 * @returns 匹配结果列表
 */
export async function execRipgrepWithArgs(
	rgPath: string,
	args: string[],
	cwd: string,
	maxResults: number,
): Promise<RipgrepMatch[]> {
	return new Promise((resolve, reject) => {
		const rgProcess = childProcess.spawn(rgPath, args, { cwd })

		const rl = readline.createInterface({
			input: rgProcess.stdout,
			crlfDelay: Infinity,
		})

		const results: RipgrepMatch[] = []
		let currentFile = ""
		let lineCount = 0
		const maxLines = maxResults * 5 // 每个结果最多 5 行（包含上下文）

		rl.on("line", (line) => {
			if (lineCount >= maxLines || results.length >= maxResults) {
				rl.close()
				rgProcess.kill()
				return
			}

			lineCount++

			try {
				const parsed = JSON.parse(line)

				if (parsed.type === "begin") {
					currentFile = parsed.data.path.text
				} else if (parsed.type === "match" || parsed.type === "context") {
					results.push({
						file: currentFile,
						line: parsed.data.line_number,
						text: parsed.data.lines.text,
						isMatch: parsed.type === "match",
					})
				}
			} catch {
				// 忽略解析错误
			}
		})

		let errorOutput = ""
		rgProcess.stderr.on("data", (data) => {
			errorOutput += data.toString()
		})

		rl.on("close", () => {
			// ripgrep 返回 1 表示没有匹配，不是错误
			if (errorOutput && !errorOutput.includes("No files were searched")) {
				// 只有真正的错误才 reject
				console.warn(`ripgrep stderr: ${errorOutput}`)
			}
			resolve(results)
		})

		rgProcess.on("error", (error) => {
			reject(new Error(`ripgrep process error: ${error.message}`))
		})
	})
}

/**
 * 格式化 ripgrep 结果为 LLM 友好的输出
 *
 * 输出格式：
 * ```
 * # relative/path/to/file.ts
 *   10 | matching line content
 *   11 | context line
 * ----
 * ```
 */
export function formatRipgrepResults(
	results: RipgrepMatch[],
	cwd: string,
	options: {
		maxLineLength?: number
		showLineNumbers?: boolean
	} = {},
): string {
	const { maxLineLength = 500, showLineNumbers = true } = options

	if (results.length === 0) {
		return "No matches found."
	}

	const lines: string[] = []
	let currentFile = ""

	for (const match of results) {
		const relativePath = path.relative(cwd, match.file).split(path.sep).join("/")

		if (relativePath !== currentFile) {
			if (currentFile !== "") {
				lines.push("----")
				lines.push("")
			}
			currentFile = relativePath
			lines.push(`# ${relativePath}`)
		}

		let lineContent = match.text.trimEnd()
		if (lineContent.length > maxLineLength) {
			lineContent = lineContent.slice(0, maxLineLength) + " [truncated...]"
		}

		if (showLineNumbers) {
			const lineNum = match.line.toString().padStart(4, " ")
			lines.push(`${lineNum} | ${lineContent}`)
		} else {
			lines.push(lineContent)
		}
	}

	if (currentFile !== "") {
		lines.push("----")
	}

	return lines.join("\n")
}
