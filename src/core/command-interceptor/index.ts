/**
 * CLI 代理层
 *
 * 提供命令拦截和优化执行的功能。
 *
 * 核心思想：
 * - 模型使用熟悉的 CLI 命令语法
 * - 代理层在进程内拦截并优化输出
 * - 复用预训练经验，获得 LLM 友好的输出
 *
 * 使用示例：
 * ```typescript
 * import { CommandInterceptor } from './command-interceptor';
 *
 * const interceptor = new CommandInterceptor();
 *
 * // 尝试拦截执行
 * const result = await interceptor.tryIntercept('grep -r "TODO" src/', {
 *   cwd: '/path/to/project',
 *   rooIgnoreController: controller,
 * });
 *
 * if (result.intercepted) {
 *   console.log(result.result.stdout);
 * } else {
 *   // 透传到原生执行
 * }
 * ```
 */

// 类型导出
export type {
	CommandContext,
	CommandResult,
	InterceptResult,
	CommandHandler,
	PipelineStage,
	SearchMatch,
	FileSearchResult,
	OutputFormatOptions,
} from "./types"

export { CONSTANTS } from "./types"

// 核心组件导出
export { CommandInterceptor, createCommandInterceptor } from "./CommandInterceptor"
export { ShellParser } from "./ShellParser"
export { PipelineExecutor } from "./PipelineExecutor"

// 处理器导出
export { BaseHandler, GrepHandler, CatHandler, HeadHandler, TailHandler } from "./handlers"
