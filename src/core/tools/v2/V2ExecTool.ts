/**
 * V2ExecTool — 脚本执行工具 (v2)
 *
 * 模型提供 script（脚本内容）和 runtime（执行运行时），
 * 工具将脚本写入临时文件后用指定运行时执行。
 * 彻底消除 shell 引号转义问题。
 *
 * 独立实现，不复用 ExecuteCommandTool。
 */

import fs from "fs/promises"
import * as path from "path"
import { spawn } from "child_process"
import { existsSync, mkdirSync } from "fs"
import os from "os"

import type { ToolName, CommandExecutionStatus } from "@roo-code/types"

import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"
import { BaseTool, ToolCallbacks } from "../BaseTool"

const IS_WINDOWS = process.platform === "win32"
const DEFAULT_RUNTIME = IS_WINDOWS ? "cmd" : "sh"

/** runtime → 临时文件扩展名 */
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

/** runtime → 执行命令构造器 */
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
	runtime?: string
	cwd?: string
	timeout?: number
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

			task.consecutiveMistakeCount = 0

			// Build approval message as JSON so UI can extract runtime for label
			const approvalPayload = JSON.stringify({ runtime, script })
			const didApprove = await askApproval("command", approvalPayload)
			if (!didApprove) {
				return
			}

			// Resolve working directory
			const workingDir = customCwd
				? path.isAbsolute(customCwd)
					? customCwd
					: path.resolve(task.cwd, customCwd)
				: task.cwd
			const timeoutMs = (timeoutSeconds ?? 120) * 1000
			const executionId = task.lastMessageTs?.toString() ?? Date.now().toString()

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
				const result = await this.runProcess(task, executionId, cmd, args, workingDir, timeoutMs)

				// Format output as XML
				const lines = this.formatResult(result, workingDir)
				pushToolResult(lines)
			} finally {
				// Cleanup temp file
				try {
					await fs.unlink(tmpFile)
				} catch {
					// ignore cleanup errors
				}
			}
		} catch (error) {
			await handleError("executing exec", error as Error)
		}
	}

	private async postStatus(task: Task, status: CommandExecutionStatus): Promise<void> {
		const provider = await task.providerRef.deref()
		provider?.postMessageToWebview({ type: "commandExecutionStatus", text: JSON.stringify(status) })
	}

	private runProcess(
		task: Task,
		executionId: string,
		cmd: string,
		args: string[],
		cwd: string,
		timeoutMs: number,
	): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
		return new Promise((resolve) => {
			const start = Date.now()
			let accumulatedOutput = ""
			const stdoutChunks: Buffer[] = []
			const stderrChunks: Buffer[] = []

			const proc = spawn(cmd, args, {
				cwd,
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env },
			})

			// Send started status
			this.postStatus(task, { executionId, status: "started", pid: proc.pid, command: `[${cmd}]` })

			proc.stdout?.on("data", (chunk: Buffer) => {
				stdoutChunks.push(chunk)
				accumulatedOutput += chunk.toString("utf8")
				// Send streaming output to webview
				this.postStatus(task, { executionId, status: "output", output: accumulatedOutput })
			})

			proc.stderr?.on("data", (chunk: Buffer) => {
				stderrChunks.push(chunk)
				accumulatedOutput += chunk.toString("utf8")
				this.postStatus(task, { executionId, status: "output", output: accumulatedOutput })
			})

			const timer = setTimeout(() => {
				proc.kill()
			}, timeoutMs)

			proc.on("close", (code) => {
				clearTimeout(timer)
				// Send exited status
				this.postStatus(task, { executionId, status: "exited", exitCode: code ?? 1 })
				resolve({
					stdout: Buffer.concat(stdoutChunks).toString("utf8"),
					stderr: Buffer.concat(stderrChunks).toString("utf8"),
					exitCode: code ?? 1,
					durationMs: Date.now() - start,
				})
			})

			proc.on("error", (err) => {
				clearTimeout(timer)
				this.postStatus(task, { executionId, status: "exited", exitCode: 1 })
				resolve({
					stdout: "",
					stderr: err.message,
					exitCode: 1,
					durationMs: Date.now() - start,
				})
			})
		})
	}

	private formatResult(
		result: { stdout: string; stderr: string; exitCode: number; durationMs: number },
		cwd: string,
	): string {
		const maxLen = 30_000
		const truncate = (s: string) =>
			s.length > maxLen ? `${s.slice(0, maxLen)}\n... [truncated, ${s.length} chars total]` : s

		const success = result.exitCode === 0
		const lines: string[] = []

		lines.push(
			`<command_result cwd="${cwd.replace(/\\/g, "/")}" exit_code="${result.exitCode}" success="${success}" duration_ms="${result.durationMs}">`,
		)

		const stdout = truncate(result.stdout)
		const stderr = truncate(result.stderr)
		const hasOutput = stdout.trim() || stderr.trim()

		if (hasOutput) {
			lines.push(`<output>`)
			if (stdout.trim()) {
				lines.push(stdout)
			}
			if (stderr.trim()) {
				lines.push(`\nStderr:\n${stderr}`)
			}
			lines.push(`</output>`)
		} else if (success) {
			lines.push(`<output>(no output)</output>`)
		}

		if (!success) {
			lines.push(
				`<notice>Command execution was not successful. Inspect the output and adjust as needed.</notice>`,
			)
		}

		lines.push(`</command_result>`)
		return lines.join("\n")
	}

	override async handlePartial(task: Task, block: any): Promise<void> {
		const script = block.params?.script ?? block.nativeArgs?.script
		if (script) {
			const runtime = block.params?.runtime ?? block.nativeArgs?.runtime ?? DEFAULT_RUNTIME
			const payload = JSON.stringify({ runtime, script })
			await task.ask("command", payload, block.partial).catch(() => {})
		}
	}
}

export const execTool = new V2ExecTool()
