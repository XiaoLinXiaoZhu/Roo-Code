/**
 * V2ExecTool — 脚本执行工具 (v2)
 *
 * 核心优势：模型提供 script + runtime，工具写入临时文件执行，
 * 彻底消除 shell 引号转义问题。
 *
 * 完整功能：OutputInterceptor 大输出持久化、双重超时、
 * 用户交互、配置集成、流式输出。
 */

import fs from "fs/promises"
import * as path from "path"
import { spawn, type ChildProcess } from "child_process"
import { existsSync, mkdirSync } from "fs"
import os from "os"
import * as vscode from "vscode"

import {
	type CommandExecutionStatus,
	type PersistedCommandOutput,
	DEFAULT_TERMINAL_OUTPUT_PREVIEW_SIZE,
} from "@roo-code/types"

import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"
import { BaseTool, ToolCallbacks } from "../BaseTool"
import { BaseTerminal } from "../../../integrations/terminal/BaseTerminal"
import { OutputInterceptor } from "../../../integrations/terminal/OutputInterceptor"
import { getTaskDirectoryPath } from "../../../utils/storage"
import { Package } from "../../../shared/package"
import { unescapeHtmlEntities } from "../../../utils/text-normalization"
import type { ToolUse } from "../../../shared/tools"

const IS_WINDOWS = process.platform === "win32"
const DEFAULT_RUNTIME = IS_WINDOWS ? "cmd" : "sh"

/** runtime → temp file extension */
const RUNTIME_EXT: Record<string, string> = {
	sh: ".sh",
	bash: ".sh",
	cmd: ".cmd",
	pwsh: ".ps1",
	bun: ".ts",
	node: ".mjs",
	deno: ".ts",
	python: ".py",
	python3: ".py",
	uv: ".py",
}

/** runtime → spawn command builder */
function buildSpawnCmd(runtime: string, tmpFile: string): [string, string[]] {
	switch (runtime) {
		case "cmd":
			return ["cmd", ["/c", tmpFile]]
		case "sh":
		case "bash":
			return [runtime, [tmpFile]]
		case "pwsh":
			return ["pwsh", ["-NoProfile", "-File", tmpFile]]
		case "bun":
			return ["bun", ["run", tmpFile]]
		case "node":
			return ["node", [tmpFile]]
		case "deno":
			return ["deno", ["run", "--allow-all", tmpFile]]
		case "python":
		case "python3":
			return [runtime, [tmpFile]]
		case "uv":
			return ["uv", ["run", "python", tmpFile]]
		default:
			return [runtime, [tmpFile]]
	}
}

interface V2ExecParams {
	script: string
	runtime?: string | null
	cwd?: string | null
	timeout?: number | null
}

export class V2ExecTool extends BaseTool<"exec"> {
	readonly name = "exec" as const

	async execute(params: V2ExecParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError, askApproval } = callbacks
		const { script, cwd: customCwd, timeout: timeoutSeconds } = params
		const runtime = params.runtime ?? DEFAULT_RUNTIME

		try {
			if (!script) {
				task.consecutiveMistakeCount++
				task.recordToolError("exec")
				pushToolResult(await task.sayAndCreateMissingParamError("exec", "script"))
				return
			}

			// rooIgnore command validation
			const ignoredFileAttemptedToAccess = task.rooIgnoreController?.validateCommand(script)
			if (ignoredFileAttemptedToAccess) {
				await task.say("rooignore_error", ignoredFileAttemptedToAccess)
				pushToolResult(formatResponse.rooIgnoreError(ignoredFileAttemptedToAccess))
				return
			}

			task.consecutiveMistakeCount = 0

			// Build approval message as JSON for UI (runtime badge + syntax highlighting)
			const approvalPayload = JSON.stringify({ runtime, script })
			const didApprove = await askApproval("command", approvalPayload)
			if (!didApprove) {
				return
			}

			// Resolve and validate working directory
			const workingDir = customCwd
				? path.isAbsolute(customCwd)
					? customCwd
					: path.resolve(task.cwd, customCwd)
				: task.cwd

			try {
				await fs.access(workingDir)
			} catch {
				pushToolResult(
					`<command_result status="error"><error>Working directory '${workingDir}' does not exist.</error></command_result>`,
				)
				return
			}

			// Read config: timeouts, allowlist, preview size
			const executionId = task.lastMessageTs?.toString() ?? Date.now().toString()
			const provider = await task.providerRef.deref()
			const providerState = await provider?.getState()

			const commandExecutionTimeoutSeconds = vscode.workspace
				.getConfiguration(Package.name)
				.get<number>("commandExecutionTimeout", 0)
			const commandTimeoutAllowlist = vscode.workspace
				.getConfiguration(Package.name)
				.get<string[]>("commandTimeoutAllowlist", [])
			const isCommandAllowlisted = commandTimeoutAllowlist.some((prefix) => script.startsWith(prefix.trim()))
			const userTimeoutMs = isCommandAllowlisted ? 0 : commandExecutionTimeoutSeconds * 1000
			const agentTimeoutMs = typeof timeoutSeconds === "number" && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 0
			const defaultTimeoutMs = 120 * 1000

			// Setup OutputInterceptor for large output persistence
			const globalStoragePath = provider?.context?.globalStorageUri?.fsPath
			let interceptor: OutputInterceptor | undefined
			if (globalStoragePath) {
				const taskDir = await getTaskDirectoryPath(globalStoragePath, task.taskId)
				const storageDir = path.join(taskDir, "command-output")
				const terminalOutputPreviewSize =
					providerState?.terminalOutputPreviewSize ?? DEFAULT_TERMINAL_OUTPUT_PREVIEW_SIZE
				interceptor = new OutputInterceptor({
					executionId,
					taskId: task.taskId,
					command: `[${runtime}] ${script.slice(0, 80)}`,
					storageDir,
					previewSize: terminalOutputPreviewSize,
				})
			}

			// Write script to temp file
			const ext = RUNTIME_EXT[runtime] ?? ""
			const tempDir = path.join(os.tmpdir(), "roo-v2-exec")
			if (!existsSync(tempDir)) {
				mkdirSync(tempDir, { recursive: true })
			}
			const tmpFile = path.join(tempDir, `_exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`)

			try {
				const scriptContent = runtime === "cmd" ? `@${script}\n` : script
				await fs.writeFile(tmpFile, scriptContent, "utf8")

				const [cmd, args] = buildSpawnCmd(runtime, tmpFile)
				const result = await this.runProcess(
					task,
					executionId,
					cmd,
					args,
					workingDir,
					interceptor,
					agentTimeoutMs || defaultTimeoutMs,
					userTimeoutMs,
				)

				// Format and push result
				const output = this.formatResult(result, workingDir, task.cwd)
				pushToolResult(output)
			} finally {
				try {
					await fs.unlink(tmpFile)
				} catch {
					/* ignore */
				}
			}
		} catch (error) {
			await handleError("executing exec", error as Error)
		}
	}

	private async runProcess(
		task: Task,
		executionId: string,
		cmd: string,
		args: string[],
		cwd: string,
		interceptor: OutputInterceptor | undefined,
		agentTimeoutMs: number,
		userTimeoutMs: number,
	): Promise<{
		stdout: string
		stderr: string
		exitCode: number
		durationMs: number
		persistedResult?: PersistedCommandOutput
	}> {
		const start = Date.now()
		let accumulatedOutput = ""
		const maxAccumulatedOutputSize = 100_000
		let runInBackground = false
		let hasAskedForCommandOutput = false
		let userMessage: { text?: string; images?: string[] } | undefined
		let persistedResult: PersistedCommandOutput | undefined

		return new Promise((resolve) => {
			const proc = spawn(cmd, args, {
				cwd,
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env },
			})

			// Send started status
			this.postStatus(task, { executionId, status: "started", pid: proc.pid, command: `[${cmd}]` })

			// Track process for external abort
			task.terminalProcess = {
				command: cmd,
				isHot: true,
				run: async () => {},
				continue: () => {
					runInBackground = true
				},
				abort: () => {
					proc.kill()
				},
				hasUnretrievedOutput: () => accumulatedOutput.length > 0,
				getUnretrievedOutput: () => accumulatedOutput,
				trimRetrievedOutput: () => {},
			} as any

			const onData = async (chunk: Buffer) => {
				const text = chunk.toString("utf8")
				accumulatedOutput += text
				if (accumulatedOutput.length > maxAccumulatedOutputSize) {
					accumulatedOutput = accumulatedOutput.slice(-maxAccumulatedOutputSize)
				}

				// Write to interceptor for persistence
				interceptor?.write(text)

				// Send compressed output to webview
				const compressed = BaseTerminal.compressTerminalOutput(accumulatedOutput)
				this.postStatus(task, { executionId, status: "output", output: compressed })

				// Ask user for interaction (once)
				if (!runInBackground && !hasAskedForCommandOutput) {
					hasAskedForCommandOutput = true
					try {
						const { response, text: userText, images } = await task.ask("command_output", "")
						runInBackground = true
						if (response === "messageResponse") {
							userMessage = { text: userText, images }
						}
					} catch {
						// Silently handle ask errors
					}
				}
			}

			proc.stdout?.on("data", onData)
			proc.stderr?.on("data", onData)

			// Dual timeout setup
			let agentTimerId: NodeJS.Timeout | undefined
			let userTimerId: NodeJS.Timeout | undefined
			let isUserTimedOut = false

			if (agentTimeoutMs > 0) {
				agentTimerId = setTimeout(() => {
					runInBackground = true
					task.supersedePendingAsk()
				}, agentTimeoutMs)
			}

			if (userTimeoutMs > 0) {
				userTimerId = setTimeout(() => {
					isUserTimedOut = true
					proc.kill()
				}, userTimeoutMs)
			}

			proc.on("close", async (code) => {
				clearTimeout(agentTimerId)
				clearTimeout(userTimerId)
				task.terminalProcess = undefined

				// Finalize interceptor
				if (interceptor) {
					persistedResult = await interceptor.finalize()
				}

				// Send exited status
				this.postStatus(task, { executionId, status: "exited", exitCode: code ?? 1 })

				// Send command_output say message
				const compressed = BaseTerminal.compressTerminalOutput(accumulatedOutput)
				task.say("command_output", compressed)

				if (isUserTimedOut) {
					resolve({
						stdout: accumulatedOutput,
						stderr: `Command terminated after exceeding user-configured ${userTimeoutMs / 1000}s timeout.`,
						exitCode: 1,
						durationMs: Date.now() - start,
						persistedResult,
					})
					return
				}

				if (userMessage) {
					// User sent feedback while command was running
					await task.say("user_feedback", userMessage.text, userMessage.images)
				}

				resolve({
					stdout: accumulatedOutput,
					stderr: "",
					exitCode: code ?? 1,
					durationMs: Date.now() - start,
					persistedResult,
				})
			})

			proc.on("error", async (err) => {
				clearTimeout(agentTimerId)
				clearTimeout(userTimerId)
				task.terminalProcess = undefined

				if (interceptor) {
					persistedResult = await interceptor.finalize()
				}

				this.postStatus(task, { executionId, status: "exited", exitCode: 1 })

				resolve({
					stdout: "",
					stderr: err.message,
					exitCode: 1,
					durationMs: Date.now() - start,
					persistedResult,
				})
			})
		})
	}

	private formatResult(
		result: {
			stdout: string
			stderr: string
			exitCode: number
			durationMs: number
			persistedResult?: PersistedCommandOutput
		},
		cwd: string,
		workspaceRoot: string,
	): string {
		const { exitCode, durationMs, persistedResult } = result
		const success = exitCode === 0
		const cwdPosix = cwd.replace(/\\/g, "/")

		// Use persisted output format when output was truncated and spilled to disk
		if (persistedResult?.truncated) {
			return this.formatPersistedOutput(persistedResult, exitCode, cwdPosix, workspaceRoot)
		}

		const lines: string[] = []
		lines.push(
			`<command_result cwd="${cwdPosix}" exit_code="${exitCode}" success="${success}" duration_ms="${durationMs}">`,
		)

		const stdout = result.stdout.trim()
		const stderr = result.stderr.trim()
		const hasOutput = stdout || stderr

		if (hasOutput) {
			lines.push(`<output>`)
			if (stdout) lines.push(stdout)
			if (stderr) lines.push(stderr)
			lines.push(`</output>`)
		}

		if (!hasOutput && success) {
			lines.push(
				`<notice>No output produced. If you need to confirm execution, append \`&& echo done\` (shell) or use a language runtime (bun/node/python) with explicit print statements.</notice>`,
			)
		}

		if (!success) {
			lines.push(
				`<notice>Command execution was not successful. Inspect the output and adjust as needed.</notice>`,
			)
		}

		lines.push(`</command_result>`)
		return lines.join("\n")
	}

	private formatPersistedOutput(
		result: PersistedCommandOutput,
		exitCode: number,
		cwdPosix: string,
		workspaceRoot: string,
	): string {
		const success = exitCode === 0
		const sizeStr = this.formatBytes(result.totalBytes)

		let artifactPath = result.artifactPath || ""
		if (artifactPath && workspaceRoot) {
			const rel = path.relative(workspaceRoot, artifactPath)
			if (!rel.startsWith("..")) artifactPath = rel
		}

		const lines: string[] = []
		lines.push(
			`<command_result cwd="${cwdPosix}" exit_code="${exitCode}" success="${success}" output_size="${sizeStr}" truncated="true">`,
		)
		lines.push(`<preview>`)
		lines.push(result.preview)
		lines.push(`</preview>`)

		const noticeLines: string[] = []
		if (!success) {
			noticeLines.push(`Command execution was not successful. Inspect the output and adjust as needed.`)
		}
		noticeLines.push(`Output truncated (${sizeStr} total). Full output saved to: ${artifactPath}`)
		noticeLines.push(`To investigate, use grep or sed to read the file selectively:`)
		noticeLines.push(`  grep -n "keyword" "${artifactPath}"`)
		noticeLines.push(`  sed -n '1,100p' "${artifactPath}"`)
		noticeLines.push(`  tail -n 200 "${artifactPath}"`)
		noticeLines.push(
			`Tip: For commands with large output, redirect to a file: exec({ script: "your-command > /tmp/output.txt 2>&1", ... }) then read the file.`,
		)

		lines.push(`<notice>${noticeLines.join("\n")}</notice>`)
		lines.push(`</command_result>`)
		return lines.join("\n")
	}

	private formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
	}

	private async postStatus(task: Task, status: CommandExecutionStatus): Promise<void> {
		const provider = await task.providerRef.deref()
		provider?.postMessageToWebview({ type: "commandExecutionStatus", text: JSON.stringify(status) })
	}

	override async handlePartial(task: Task, block: ToolUse<"exec">): Promise<void> {
		const nativeArgs = block.nativeArgs as V2ExecParams | undefined
		const script = nativeArgs?.script
		if (script) {
			const runtime = nativeArgs?.runtime ?? DEFAULT_RUNTIME
			const payload = JSON.stringify({ runtime, script })
			await task.ask("command", payload, block.partial).catch(() => {})
		}
	}
}

export const execTool = new V2ExecTool()
