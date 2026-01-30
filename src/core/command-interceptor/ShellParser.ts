/**
 * Shell 命令解析器
 *
 * 使用 shell-quote 库解析 shell 命令，支持：
 * - 基本引号解析
 * - 管道分割
 * - 转义字符
 *
 * 不支持的语法会被检测并标记为透传执行：
 * - 命令替换 $(cmd) 或 `cmd`
 * - 进程替换 <(cmd) 或 >(cmd)
 * - Here-doc <<EOF
 * - 复杂重定向 2>&1
 */

import { parse as shellParse, ParseEntry } from "shell-quote"

import { PipelineStage } from "./types"

/**
 * 不支持的 shell 语法模式
 * 匹配到这些模式时，整个命令会被透传执行
 */
const UNSUPPORTED_PATTERNS = [
	/\$\([^)]+\)/, // $(cmd) - 命令替换
	/`[^`]+`/, // `cmd` - 命令替换（旧语法）
	/<\([^)]+\)/, // <(cmd) - 进程替换
	/>\([^)]+\)/, // >(cmd) - 进程替换
	/<<\w+/, // <<EOF - Here-doc
	/\d+>&\d+/, // 2>&1 - 文件描述符重定向
	/&>/, // &> - stdout+stderr 重定向
	/\|&/, // |& - 管道 stderr
]

export class ShellParser {
	/**
	 * 解析命令字符串为管道阶段列表
	 *
	 * @param command - 原始命令字符串
	 * @returns 管道阶段列表，每个阶段包含命令名和参数
	 */
	parsePipeline(command: string): PipelineStage[] {
		// 1. 检测不支持的语法
		if (this.hasUnsupportedSyntax(command)) {
			// 返回单个阶段，标记为不可拦截
			return [this.createPassthroughStage(command)]
		}

		try {
			// 2. 使用 shell-quote 解析
			const parsed = shellParse(command)

			// 3. 按管道符分割
			return this.splitByPipe(parsed, command)
		} catch (error) {
			// 解析失败，透传执行
			console.warn(`Shell parse failed, falling back to passthrough: ${error}`)
			return [this.createPassthroughStage(command)]
		}
	}

	/**
	 * 检测命令是否包含不支持的语法
	 */
	private hasUnsupportedSyntax(command: string): boolean {
		return UNSUPPORTED_PATTERNS.some((pattern) => pattern.test(command))
	}

	/**
	 * 创建透传阶段（不可拦截）
	 */
	private createPassthroughStage(command: string): PipelineStage {
		return {
			raw: command,
			command: "",
			args: [],
			handler: null,
		}
	}

	/**
	 * 按管道符分割解析结果
	 */
	private splitByPipe(parsed: ParseEntry[], originalCommand: string): PipelineStage[] {
		const stages: PipelineStage[] = []
		let currentTokens: string[] = []
		let currentRaw: string[] = []

		for (const entry of parsed) {
			if (typeof entry === "object" && "op" in entry) {
				if (entry.op === "|") {
					// 遇到管道符，保存当前阶段
					if (currentTokens.length > 0) {
						stages.push(this.createStage(currentTokens, currentRaw.join(" ")))
						currentTokens = []
						currentRaw = []
					}
				} else {
					// 其他操作符（如 &&, ||, ;）暂不支持，透传整个命令
					return [this.createPassthroughStage(originalCommand)]
				}
			} else if (typeof entry === "string") {
				currentTokens.push(entry)
				currentRaw.push(entry)
			} else if (typeof entry === "object" && "comment" in entry) {
				// 忽略注释
				continue
			} else {
				// 未知类型，透传
				return [this.createPassthroughStage(originalCommand)]
			}
		}

		// 保存最后一个阶段
		if (currentTokens.length > 0) {
			stages.push(this.createStage(currentTokens, currentRaw.join(" ")))
		}

		// 如果没有解析出任何阶段，透传
		if (stages.length === 0) {
			return [this.createPassthroughStage(originalCommand)]
		}

		return stages
	}

	/**
	 * 从 token 列表创建管道阶段
	 */
	private createStage(tokens: string[], raw: string): PipelineStage {
		const [command, ...args] = tokens
		return {
			raw,
			command: command || "",
			args,
			handler: null, // 由 CommandInterceptor 填充
		}
	}
}
