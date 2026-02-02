/**
 * CLI 输出截断处理器
 *
 * 当 CLI 输出超过限制时：
 * 1. 截断输出，只保留尾部内容
 * 2. 将完整输出保存到 .roo/cli-output/ 目录
 * 3. 返回截断提示，告诉模型如何查看完整输出
 */

import * as fs from "fs/promises"
import * as path from "path"

/**
 * 默认最大输出大小（字符数）
 * 50KB 约等于 12500 个 token（按 4 字符/token 估算）
 */
const DEFAULT_MAX_OUTPUT_SIZE = 50 * 1024

/**
 * 保留的尾部大小（字符数）
 * 截断时保留最后这么多字符
 */
const TAIL_SIZE = 40 * 1024

/**
 * CLI 输出目录名
 */
const CLI_OUTPUT_DIR = ".roo/cli-output"

export interface TruncationResult {
	/** 处理后的输出（可能被截断） */
	output: string
	/** 是否发生了截断 */
	truncated: boolean
	/** 完整输出的文件路径（如果截断了） */
	fullOutputPath?: string
	/** 截断提示信息 */
	truncationMessage?: string
}

/**
 * 处理 CLI 输出，必要时进行截断
 *
 * @param output - 原始输出
 * @param cwd - 工作目录（用于保存完整输出）
 * @param command - 执行的命令（用于生成文件名）
 * @param maxSize - 最大输出大小（默认 50KB）
 */
export async function truncateCliOutput(
	output: string,
	cwd: string,
	command: string,
	maxSize: number = DEFAULT_MAX_OUTPUT_SIZE,
): Promise<TruncationResult> {
	// 不需要截断
	if (output.length <= maxSize) {
		return { output, truncated: false }
	}

	// 需要截断
	const truncatedOutput = output.slice(-TAIL_SIZE)
	const omittedSize = output.length - TAIL_SIZE

	// 保存完整输出到文件
	const fullOutputPath = await saveFullOutput(cwd, command, output)
	const relativePath = path.relative(cwd, fullOutputPath)

	// 生成截断提示
	const truncationMessage = formatTruncationMessage(omittedSize, relativePath)

	return {
		output: truncatedOutput,
		truncated: true,
		fullOutputPath,
		truncationMessage,
	}
}

/**
 * 保存完整输出到文件
 */
async function saveFullOutput(cwd: string, command: string, output: string): Promise<string> {
	const outputDir = path.join(cwd, CLI_OUTPUT_DIR)

	// 确保目录存在
	await fs.mkdir(outputDir, { recursive: true })

	// 生成文件名：时间戳 + 命令摘要
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
	const commandSlug = sanitizeCommand(command)
	const fileName = `${timestamp}_${commandSlug}.txt`
	const filePath = path.join(outputDir, fileName)

	// 写入文件
	const header = `# Command: ${command}\n# Timestamp: ${new Date().toISOString()}\n# Output size: ${output.length} characters\n\n`
	await fs.writeFile(filePath, header + output, "utf-8")

	return filePath
}

/**
 * 将命令转换为安全的文件名
 */
function sanitizeCommand(command: string): string {
	// 取命令的前 30 个字符，替换不安全字符
	return (
		command
			.slice(0, 30)
			.replace(/[^a-zA-Z0-9_-]/g, "_")
			.replace(/_+/g, "_")
			.replace(/^_|_$/g, "") || "command"
	)
}

/**
 * 格式化截断提示信息
 */
function formatTruncationMessage(omittedSize: number, relativePath: string): string {
	const omittedKB = Math.round(omittedSize / 1024)
	return `[Output truncated: ${omittedKB}KB omitted, showing last ${Math.round(TAIL_SIZE / 1024)}KB]
Full output saved to: ${relativePath}
💡 To investigate: grep -n "keyword" ${relativePath} or sed -n '1,100p' ${relativePath}`
}

/**
 * 清理旧的 CLI 输出文件（保留最近 N 个）
 *
 * @param cwd - 工作目录
 * @param keepCount - 保留的文件数量（默认 20）
 */
export async function cleanupOldOutputs(cwd: string, keepCount: number = 20): Promise<void> {
	const outputDir = path.join(cwd, CLI_OUTPUT_DIR)

	try {
		const files = await fs.readdir(outputDir)
		const txtFiles = files
			.filter((f) => f.endsWith(".txt"))
			.sort()
			.reverse()

		// 删除超出数量的旧文件
		for (const file of txtFiles.slice(keepCount)) {
			await fs.unlink(path.join(outputDir, file))
		}
	} catch {
		// 目录不存在或其他错误，忽略
	}
}
