/**
 * CLI 代理层类型定义
 *
 * CLI 代理层的核心思想是：模型使用熟悉的 CLI 命令语法，代理层在进程内拦截并优化输出。
 * 这样既复用了模型的预训练经验，又能获得针对 LLM 优化的输出格式。
 */

import { RooIgnoreController } from "../ignore/RooIgnoreController"

/**
 * 命令执行上下文
 */
export interface CommandContext {
	/** 当前工作目录 */
	cwd: string
	/** RooIgnore 控制器，用于文件访问验证 */
	rooIgnoreController?: RooIgnoreController
	/** 标准输入（用于管道传递） */
	stdin?: string
	/** 环境变量 */
	env?: Record<string, string>
}

/**
 * 命令执行结果
 */
export interface CommandResult {
	/** 标准输出 */
	stdout: string
	/** 标准错误 */
	stderr: string
	/** 退出码 */
	exitCode: number
	/** 是否被截断 */
	truncated?: boolean
	/** 截断提示信息 */
	truncationMessage?: string
}

/**
 * 拦截执行结果
 */
export interface InterceptResult {
	/** 是否成功拦截执行 */
	intercepted: boolean
	/** 执行结果（仅当 intercepted 为 true 时有效） */
	result?: CommandResult
}

/**
 * 管道阶段
 */
export interface PipelineStage {
	/** 原始命令字符串 */
	raw: string
	/** 命令名 */
	command: string
	/** 参数列表 */
	args: string[]
	/** 命令处理器（null 表示透传执行） */
	handler: CommandHandler | null
}

/**
 * 命令处理器接口
 *
 * 每个处理器负责实现一个或多个 CLI 命令的语义。
 * 处理器应该：
 * 1. 在 canHandle() 中检查是否支持给定的参数组合
 * 2. 在 execute() 中实现命令逻辑，并返回 LLM 友好的输出
 * 3. 遵守 .rooignore 规则，过滤被忽略的文件
 */
export interface CommandHandler {
	/** 命令名称 */
	readonly name: string
	/** 命令别名 */
	readonly aliases?: string[]

	/**
	 * 检查是否支持给定的参数组合
	 * 返回 false 时会透传执行
	 */
	canHandle(args: string[]): boolean

	/**
	 * 执行命令
	 */
	execute(args: string[], context: CommandContext): Promise<CommandResult>
}

/**
 * 搜索结果（用于 grep 等搜索命令）
 */
export interface SearchMatch {
	/** 行号 */
	line: number
	/** 匹配的文本 */
	text: string
	/** 是否为匹配行（vs 上下文行） */
	isMatch: boolean
}

/**
 * 文件搜索结果
 */
export interface FileSearchResult {
	/** 文件路径（相对路径） */
	file: string
	/** 匹配结果 */
	matches: SearchMatch[]
}

/**
 * 输出格式化选项
 */
export interface OutputFormatOptions {
	/** 最大输出行数 */
	maxLines?: number
	/** 最大行长度 */
	maxLineLength?: number
	/** 是否显示行号 */
	showLineNumbers?: boolean
	/** 是否按文件分组 */
	groupByFile?: boolean
}

/**
 * 常量定义
 */
export const CONSTANTS = {
	/** 最大搜索结果数 */
	MAX_RESULTS: 300,
	/** 最大行长度 */
	MAX_LINE_LENGTH: 500,
	/** 最大 stdin 大小（超出时透传执行） */
	MAX_STDIN_SIZE: 1024 * 1024, // 1MB
	/** 默认上下文行数 */
	DEFAULT_CONTEXT_LINES: 1,
} as const
