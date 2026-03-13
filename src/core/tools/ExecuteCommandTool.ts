import fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"

import delay from "delay"

import { CommandExecutionStatus, DEFAULT_TERMINAL_OUTPUT_PREVIEW_SIZE, PersistedCommandOutput } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

import { Task } from "../task/Task"

import { ToolUse, ToolResponse } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { unescapeHtmlEntities } from "../../utils/text-normalization"
import { ExitCodeDetails, RooTerminalCallbacks, RooTerminalProcess } from "../../integrations/terminal/types"
import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"
import { Terminal } from "../../integrations/terminal/Terminal"
import { OutputInterceptor } from "../../integrations/terminal/OutputInterceptor"
import { Package } from "../../shared/package"
import { t } from "../../i18n"
import { getTaskDirectoryPath } from "../../utils/storage"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { CommandInterceptor, createCommandInterceptor } from "../command-interceptor"
import { truncateCliOutput, cleanupOldOutputs } from "../command-interceptor/CliOutputTruncator"

class ShellIntegrationError extends Error {}

interface ExecuteCommandParams {
	command: string
	cwd?: string
	timeout?: number | null
}

export function resolveAgentTimeoutMs(timeoutSeconds: number | null | undefined): number {
	const requestedAgentTimeout = typeof timeoutSeconds === "number" && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 0

	// In CLI runtime, stdin harnesses expect command lifetime to be governed
	// solely by commandExecutionTimeout (user setting), not model-provided
	// background timeouts.
	return process.env.ROO_CLI_RUNTIME === "1" ? 0 : requestedAgentTimeout
}

export class ExecuteCommandTool extends BaseTool<"execute_command"> {
	readonly name = "execute_command" as const
	private interceptor = createCommandInterceptor()

	async execute(params: ExecuteCommandParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { command, cwd: customCwd, timeout: timeoutSeconds } = params
		const { handleError, pushToolResult, askApproval } = callbacks

		try {
			if (!command) {
				task.consecutiveMistakeCount++
				task.recordToolError("execute_command")
				pushToolResult(await task.sayAndCreateMissingParamError("execute_command", "command"))
				return
			}

			const canonicalCommand = unescapeHtmlEntities(command)

			const ignoredFileAttemptedToAccess = task.rooIgnoreController?.validateCommand(canonicalCommand)

			if (ignoredFileAttemptedToAccess) {
				await task.say("rooignore_error", ignoredFileAttemptedToAccess)
				pushToolResult(formatResponse.rooIgnoreError(ignoredFileAttemptedToAccess))
				return
			}

			task.consecutiveMistakeCount = 0

			const didApprove = await askApproval("command", canonicalCommand)

			if (!didApprove) {
				return
			}

			// 尝试使用 CLI 代理层拦截执行
			const interceptResult = await this.interceptor.tryIntercept(canonicalCommand, {
				cwd: customCwd ? path.resolve(task.cwd, customCwd) : task.cwd,
				rooIgnoreController: task.rooIgnoreController,
			})

			if (interceptResult.intercepted && interceptResult.result) {
				const { stdout, stderr, exitCode, truncationMessage } = interceptResult.result
				const workingDir = customCwd ? path.resolve(task.cwd, customCwd) : task.cwd

				// 格式化原始输出
				let rawOutput = stdout
				if (stderr) {
					rawOutput += `\n\nStderr:\n${stderr}`
				}

				// 统一截断处理：超过限制时截断并保存完整输出
				const truncResult = await truncateCliOutput(rawOutput, task.cwd, canonicalCommand)
				let output = truncResult.output

				// 添加截断提示（来自截断处理器）
				if (truncResult.truncationMessage) {
					output += `\n\n${truncResult.truncationMessage}`
				}

				// 添加管道元信息（来自 handler，如被忽略的文件提示）
				if (truncationMessage) {
					output += `\n\n${truncationMessage}`
				}

				// Format as XML for LLM consumption
				const success = exitCode === 0
				const lines: string[] = []
				lines.push(
					`<command_result cwd="${workingDir.toPosix()}" exit_code="${exitCode}" success="${success}">`,
				)
				if (output.trim()) {
					lines.push(`<output>`)
					lines.push(output)
					lines.push(`</output>`)
				}
				if (!success) {
					lines.push(
						`<notice>Command execution was not successful. Inspect the output and adjust as needed.</notice>`,
					)
				}
				lines.push(`</command_result>`)

				pushToolResult(lines.join("\n"))

				// 异步清理旧的输出文件
				cleanupOldOutputs(task.cwd).catch(() => {})

				return
			}

			const executionId = task.lastMessageTs?.toString() ?? Date.now().toString()
			const provider = await task.providerRef.deref()
			const providerState = await provider?.getState()

			const { terminalShellIntegrationDisabled = true } = providerState ?? {}

			// Get command execution timeout from VSCode configuration (in seconds)
			const commandExecutionTimeoutSeconds = vscode.workspace
				.getConfiguration(Package.name)
				.get<number>("commandExecutionTimeout", 0)

			// Get command timeout allowlist from VSCode configuration
			const commandTimeoutAllowlist = vscode.workspace
				.getConfiguration(Package.name)
				.get<string[]>("commandTimeoutAllowlist", [])

			// Check if command matches any prefix in the allowlist
			const isCommandAllowlisted = commandTimeoutAllowlist.some((prefix) =>
				canonicalCommand.startsWith(prefix.trim()),
			)

			// Convert seconds to milliseconds for internal use, but skip timeout if command is allowlisted
			const commandExecutionTimeout = isCommandAllowlisted ? 0 : commandExecutionTimeoutSeconds * 1000

			// Convert agent-specified timeout from seconds to milliseconds
			const agentTimeout = resolveAgentTimeoutMs(timeoutSeconds)

			const options: ExecuteCommandOptions = {
				executionId,
				command: canonicalCommand,
				customCwd,
				terminalShellIntegrationDisabled,
				commandExecutionTimeout,
				agentTimeout,
			}

			try {
				const [rejected, result] = await executeCommandInTerminal(task, options)

				if (rejected) {
					task.didRejectTool = true
				}

				// executeCommandInTerminal 已经返回 XML 格式的结果，直接使用
				// 截断处理已在 executeCommandInTerminal 内部完成
				if (typeof result === "string") {
					pushToolResult(result)
				} else {
					pushToolResult(result)
				}
			} catch (error: unknown) {
				const status: CommandExecutionStatus = { executionId, status: "fallback" }
				provider?.postMessageToWebview({ type: "commandExecutionStatus", text: JSON.stringify(status) })
				await task.say("shell_integration_warning")

				// Invalidate pending ask from first execution to prevent race condition
				task.supersedePendingAsk()

				if (error instanceof ShellIntegrationError) {
					const [rejected, result] = await executeCommandInTerminal(task, {
						...options,
						terminalShellIntegrationDisabled: true,
					})

					if (rejected) {
						task.didRejectTool = true
					}

					// executeCommandInTerminal 已经返回 XML 格式的结果，直接使用
					if (typeof result === "string") {
						pushToolResult(result)
					} else {
						pushToolResult(result)
					}
				} else {
					pushToolResult(
						`<command_result status="error"><error>Command failed to execute in terminal due to a shell integration error.</error></command_result>`,
					)
				}
			}

			return
		} catch (error) {
			await handleError("executing command", error as Error)
			return
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"execute_command">): Promise<void> {
		const command = block.params.command
		await task.ask("command", command ?? "", block.partial).catch(() => {})
	}
}

export type ExecuteCommandOptions = {
	executionId: string
	command: string
	customCwd?: string
	terminalShellIntegrationDisabled?: boolean
	commandExecutionTimeout?: number
	agentTimeout?: number
}

export async function executeCommandInTerminal(
	task: Task,
	{
		executionId,
		command,
		customCwd,
		terminalShellIntegrationDisabled = true,
		commandExecutionTimeout = 0,
		agentTimeout = 0,
	}: ExecuteCommandOptions,
): Promise<[boolean, ToolResponse]> {
	// Convert milliseconds back to seconds for display purposes.
	const commandExecutionTimeoutSeconds = commandExecutionTimeout / 1000
	let workingDir: string

	if (!customCwd) {
		workingDir = task.cwd
	} else if (path.isAbsolute(customCwd)) {
		workingDir = customCwd
	} else {
		workingDir = path.resolve(task.cwd, customCwd)
	}

	try {
		await fs.access(workingDir)
	} catch (error) {
		return [false, `Working directory '${workingDir}' does not exist.`]
	}

	let message: { text?: string; images?: string[] } | undefined
	let runInBackground = false
	let completed = false
	let result: string = ""
	let persistedResult: PersistedCommandOutput | undefined
	let exitDetails: ExitCodeDetails | undefined
	let shellIntegrationError: string | undefined
	let hasAskedForCommandOutput = false

	const terminalProvider = terminalShellIntegrationDisabled ? "execa" : "vscode"
	const provider = await task.providerRef.deref()

	// Get global storage path for persisted output artifacts
	const globalStoragePath = provider?.context?.globalStorageUri?.fsPath
	let interceptor: OutputInterceptor | undefined

	// Create OutputInterceptor if we have storage available
	if (globalStoragePath) {
		const taskDir = await getTaskDirectoryPath(globalStoragePath, task.taskId)
		const storageDir = path.join(taskDir, "command-output")
		const providerState = await provider?.getState()
		const terminalOutputPreviewSize =
			providerState?.terminalOutputPreviewSize ?? DEFAULT_TERMINAL_OUTPUT_PREVIEW_SIZE

		interceptor = new OutputInterceptor({
			executionId,
			taskId: task.taskId,
			command,
			storageDir,
			previewSize: terminalOutputPreviewSize,
		})
	}

	let accumulatedOutput = ""
	// Bound accumulated output buffer size to prevent unbounded memory growth for long-running commands.
	// The interceptor preserves full output; this buffer is only for UI display (100KB limit).
	const maxAccumulatedOutputSize = 100_000
	const commandOutputStreamThrottleMs = 150
	let latestCompressedOutput = ""
	let lastQueuedCommandOutput = ""
	let lastCommandOutputEmitAt = 0
	let pendingCommandOutputEmitTimer: NodeJS.Timeout | undefined
	let commandOutputSayChain: Promise<void> = Promise.resolve()

	const queueCommandOutputMessage = (text: string, partial: boolean, force = false): Promise<void> => {
		if (!force && text === lastQueuedCommandOutput) {
			return commandOutputSayChain
		}

		lastQueuedCommandOutput = text
		commandOutputSayChain = commandOutputSayChain
			.then(async () => {
				await task.say("command_output", text, undefined, partial, undefined, undefined, {
					isNonInteractive: true,
				})
			})
			.catch((error) => {
				console.error("[ExecuteCommandTool] Failed to publish command output:", error)
			})

		return commandOutputSayChain
	}

	const schedulePartialCommandOutputUpdate = () => {
		if (!latestCompressedOutput || completed) {
			return
		}

		const emitUpdate = () => {
			pendingCommandOutputEmitTimer = undefined
			lastCommandOutputEmitAt = Date.now()
			void queueCommandOutputMessage(latestCompressedOutput, true)
		}

		const elapsed = Date.now() - lastCommandOutputEmitAt
		if (elapsed >= commandOutputStreamThrottleMs) {
			emitUpdate()
			return
		}

		if (!pendingCommandOutputEmitTimer) {
			pendingCommandOutputEmitTimer = setTimeout(emitUpdate, commandOutputStreamThrottleMs - elapsed)
		}
	}

	// Track when onCompleted callback finishes to avoid race condition.
	// The callback is async but Terminal/ExecaTerminal don't await it, so we track completion
	// explicitly to ensure persistedResult is set before we use it.
	let onCompletedPromise: Promise<void> | undefined
	let resolveOnCompleted: (() => void) | undefined
	onCompletedPromise = new Promise((resolve) => {
		resolveOnCompleted = resolve
	})

	const callbacks: RooTerminalCallbacks = {
		onLine: async (lines: string, process: RooTerminalProcess) => {
			accumulatedOutput += lines

			// Trim accumulated output to prevent unbounded memory growth
			if (accumulatedOutput.length > maxAccumulatedOutputSize) {
				accumulatedOutput = accumulatedOutput.slice(-maxAccumulatedOutputSize)
			}

			// Write to interceptor for persisted output
			interceptor?.write(lines)

			// Continue sending compressed output to webview for UI display (unchanged behavior)
			const compressedOutput = Terminal.compressTerminalOutput(accumulatedOutput)
			latestCompressedOutput = compressedOutput
			const status: CommandExecutionStatus = { executionId, status: "output", output: compressedOutput }
			provider?.postMessageToWebview({ type: "commandExecutionStatus", text: JSON.stringify(status) })
			schedulePartialCommandOutputUpdate()

			if (runInBackground || hasAskedForCommandOutput) {
				return
			}

			// Mark that we've asked to prevent multiple concurrent asks
			hasAskedForCommandOutput = true

			try {
				const { response, text, images } = await task.ask("command_output", "")
				runInBackground = true

				if (response === "messageResponse") {
					message = { text, images }
					process.continue()
				}
			} catch (_error) {
				// Silently handle ask errors (e.g., "Current ask promise was ignored")
			}
		},
		onCompleted: async (output: string | undefined) => {
			try {
				clearTimeout(pendingCommandOutputEmitTimer)
				pendingCommandOutputEmitTimer = undefined

				// Finalize interceptor and get persisted result.
				// We await finalize() to ensure the artifact file is fully flushed
				// before we advertise the artifact_id to the LLM.
				if (interceptor) {
					persistedResult = await interceptor.finalize()
				}

				// Continue using compressed output for UI display
				result = Terminal.compressTerminalOutput(output ?? "")
				latestCompressedOutput = result

				// Preserve order: wait for queued partial updates, then emit the final
				// non-partial command_output update.
				await commandOutputSayChain
				await queueCommandOutputMessage(result, false, true)
				completed = true
			} finally {
				// Signal that onCompleted has finished, so the main code can safely use persistedResult
				resolveOnCompleted?.()
			}
		},
		onShellExecutionStarted: (pid: number | undefined) => {
			const status: CommandExecutionStatus = { executionId, status: "started", pid, command }
			provider?.postMessageToWebview({ type: "commandExecutionStatus", text: JSON.stringify(status) })
		},
		onShellExecutionComplete: (details: ExitCodeDetails) => {
			const status: CommandExecutionStatus = { executionId, status: "exited", exitCode: details.exitCode }
			provider?.postMessageToWebview({ type: "commandExecutionStatus", text: JSON.stringify(status) })
			exitDetails = details
		},
	}

	if (terminalProvider === "vscode") {
		callbacks.onNoShellIntegration = async (error: string) => {
			TelemetryService.instance.captureShellIntegrationError(task.taskId)
			shellIntegrationError = error
		}
	}

	const terminal = await TerminalRegistry.getOrCreateTerminal(workingDir, task.taskId, terminalProvider)

	if (terminal instanceof Terminal) {
		terminal.terminal.show(true)

		// Update the working directory in case the terminal we asked for has
		// a different working directory so that the model will know where the
		// command actually executed.
		workingDir = terminal.getCurrentWorkingDirectory()
	}

	const process = terminal.runCommand(command, callbacks)
	task.terminalProcess = process

	// Dual-timeout logic:
	// - Agent timeout: transitions the command to background (continues running)
	// - User timeout: aborts the command (kills it)
	// Both timers run independently — the user timeout remains active as a safety net
	// even after the agent timeout moves the command to the background.
	let agentTimeoutId: NodeJS.Timeout | undefined
	let userTimeoutId: NodeJS.Timeout | undefined
	let isUserTimedOut = false

	try {
		const racers: Promise<void>[] = [process]

		// Agent timeout: transition to background (command keeps running)
		if (agentTimeout > 0) {
			racers.push(
				new Promise<void>((resolve) => {
					agentTimeoutId = setTimeout(() => {
						runInBackground = true
						process.continue()
						task.supersedePendingAsk()
						resolve()
					}, agentTimeout)
				}),
			)
		}

		// User timeout: abort the command (existing behavior)
		if (commandExecutionTimeout > 0) {
			racers.push(
				new Promise<void>((_, reject) => {
					userTimeoutId = setTimeout(() => {
						isUserTimedOut = true
						task.terminalProcess?.abort()
						reject(new Error(`Command execution timed out after ${commandExecutionTimeout}ms`))
					}, commandExecutionTimeout)
				}),
			)
		}

		await Promise.race(racers)
	} catch (error) {
		if (isUserTimedOut) {
			const status: CommandExecutionStatus = { executionId, status: "timeout" }
			provider?.postMessageToWebview({ type: "commandExecutionStatus", text: JSON.stringify(status) })
			await task.say("error", t("common:errors:command_timeout", { seconds: commandExecutionTimeoutSeconds }))
			task.didToolFailInCurrentTurn = true
			task.terminalProcess = undefined

			return [
				false,
				`The command was terminated after exceeding a user-configured ${commandExecutionTimeoutSeconds}s timeout. Do not try to re-run the command.`,
			]
		}
		throw error
	} finally {
		clearTimeout(agentTimeoutId)
		clearTimeout(userTimeoutId)
		clearTimeout(pendingCommandOutputEmitTimer)
		task.terminalProcess = undefined
	}

	if (shellIntegrationError) {
		throw new ShellIntegrationError(shellIntegrationError)
	}

	// Wait for a short delay to ensure all messages are sent to the webview.
	// This delay allows time for non-awaited promises to be created and
	// for their associated messages to be sent to the webview, maintaining
	// the correct order of messages (although the webview is smart about
	// grouping command_output messages despite any gaps anyways).
	await delay(50)

	// Wait for onCompleted callback to finish if shell execution completed.
	// This ensures persistedResult is set before we try to use it, fixing the race
	// condition where exitDetails is set (sync) before the async onCompleted finishes.
	if (exitDetails && onCompletedPromise) {
		await onCompletedPromise
	}

	if (message) {
		const { text, images } = message
		await task.say("user_feedback", text, images)

		return [
			true,
			formatResponse.toolResult(
				[
					`Command is still running in terminal from '${terminal.getCurrentWorkingDirectory().toPosix()}'.`,
					result.length > 0 ? `Here's the output so far:\n${result}\n` : "\n",
					`<user_message>\n${text}\n</user_message>`,
				].join("\n"),
				images,
			),
		]
	} else if (completed || exitDetails) {
		const currentWorkingDir = terminal.getCurrentWorkingDirectory().toPosix()

		// Use persisted output format when output was truncated and spilled to disk
		if (persistedResult?.truncated) {
			return [false, formatPersistedOutput(persistedResult, exitDetails, currentWorkingDir, task.cwd)]
		}

		// Format as XML for LLM consumption
		const exitCode = exitDetails?.exitCode
		const success = exitCode === 0
		const lines: string[] = []

		if (exitDetails?.signalName) {
			lines.push(
				`<command_result cwd="${currentWorkingDir}" signal="${exitDetails.signalName}"${exitDetails.coreDumpPossible ? ' core_dump="possible"' : ""}>`,
			)
		} else if (exitCode !== undefined) {
			lines.push(`<command_result cwd="${currentWorkingDir}" exit_code="${exitCode}" success="${success}">`)
		} else {
			lines.push(`<command_result cwd="${currentWorkingDir}" exit_code="undefined">`)
		}

		if (result?.trim()) {
			lines.push(`<output>`)
			lines.push(result)
			lines.push(`</output>`)
		}

		if (!success && exitCode !== undefined) {
			lines.push(
				`<notice>Command execution was not successful. Inspect the output and adjust as needed.</notice>`,
			)
		} else if (exitCode === undefined) {
			lines.push(
				`<notice>Exit code is undefined. Terminal output and command execution status is unknown.</notice>`,
			)
		}

		lines.push(`</command_result>`)

		return [false, lines.join("\n")]
	} else {
		// Command still running
		const lines: string[] = []
		lines.push(`<command_result cwd="${workingDir?.toPosix() || ""}" status="running">`)
		if (result.trim()) {
			lines.push(`<output partial="true">`)
			lines.push(result)
			lines.push(`</output>`)
		}
		lines.push(
			`<notice>Command is still running. You will be updated on the terminal status and new output in the future.</notice>`,
		)
		lines.push(`</command_result>`)

		return [false, lines.join("\n")]
	}
}

/**
 * Format exit status from ExitCodeDetails
 */
function formatExitStatus(exitDetails: ExitCodeDetails | undefined): string {
	if (exitDetails === undefined) {
		return "Exit code: <undefined, notify user>"
	}

	if (exitDetails.signalName) {
		let status = `Process terminated by signal ${exitDetails.signalName}`
		if (exitDetails.coreDumpPossible) {
			status += " - core dump possible"
		}
		return status
	}

	if (exitDetails.exitCode === undefined) {
		return "Exit code: <undefined, notify user>"
	}

	let status = ""
	if (exitDetails.exitCode !== 0) {
		status += "Command execution was not successful, inspect the cause and adjust as needed.\n"
	}
	status += `Exit code: ${exitDetails.exitCode}`
	return status
}

/**
 * Format persisted output result for tool response when output was truncated
 *
 * @param result - The persisted command output result
 * @param exitDetails - Exit code details
 * @param workingDir - The working directory (cwd) of the command
 * @param cwd - The workspace root directory (for computing relative paths)
 */
function formatPersistedOutput(
	result: PersistedCommandOutput,
	exitDetails: ExitCodeDetails | undefined,
	workingDir: string,
	cwd?: string,
): string {
	const exitCode = exitDetails?.exitCode
	const success = exitCode === 0
	const sizeStr = formatBytes(result.totalBytes)

	// Compute relative path from workspace root, fallback to absolute path
	let artifactPath = result.artifactPath || ""
	if (artifactPath && cwd) {
		const relativePath = path.relative(cwd, artifactPath)
		// Only use relative path if it doesn't start with ".." (i.e., is within workspace)
		if (!relativePath.startsWith("..")) {
			artifactPath = relativePath
		}
	}

	const lines: string[] = []

	if (exitDetails?.signalName) {
		lines.push(
			`<command_result cwd="${workingDir}" signal="${exitDetails.signalName}" output_size="${sizeStr}" truncated="true">`,
		)
	} else if (exitCode !== undefined) {
		lines.push(
			`<command_result cwd="${workingDir}" exit_code="${exitCode}" success="${success}" output_size="${sizeStr}" truncated="true">`,
		)
	} else {
		lines.push(
			`<command_result cwd="${workingDir}" exit_code="undefined" output_size="${sizeStr}" truncated="true">`,
		)
	}

	lines.push(`<preview>`)
	lines.push(result.preview)
	lines.push(`</preview>`)

	// Build detailed notice with file path and usage suggestions
	const noticeLines: string[] = []
	if (!success && exitCode !== undefined) {
		noticeLines.push(`Command execution was not successful. Inspect the output and adjust as needed.`)
	}
	noticeLines.push(`Output truncated (${sizeStr} total). Full output saved to: ${artifactPath}`)
	noticeLines.push(`To investigate, use grep or sed to read the file selectively:`)
	noticeLines.push(`  grep -n "keyword" "${artifactPath}"`)
	noticeLines.push(`  sed -n '1,100p' "${artifactPath}"`)
	noticeLines.push(`  tail -n 200 "${artifactPath}"`)

	lines.push(`<notice>${noticeLines.join("\n")}</notice>`)

	lines.push(`</command_result>`)

	return lines.join("\n")
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes}B`
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)}KB`
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export const executeCommandTool = new ExecuteCommandTool()
