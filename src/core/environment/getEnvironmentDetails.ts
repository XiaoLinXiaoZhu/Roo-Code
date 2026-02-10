import path from "path"
import os from "os"

import * as vscode from "vscode"
import pWaitFor from "p-wait-for"
import delay from "delay"

import type { ExperimentId } from "@roo-code/types"

import { formatLanguage } from "../../shared/language"
import { defaultModeSlug, getFullModeDetails } from "../../shared/modes"
import { listFiles } from "../../services/glob/list-files"
import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"
import { Terminal } from "../../integrations/terminal/Terminal"
import { arePathsEqual } from "../../utils/path"
import { getGitStatusStructured } from "../../utils/git"
import { RooProtectedController } from "../protect/RooProtectedController"

import { Task } from "../task/Task"
import { formatReminderSection } from "./reminder"
import { getContextualSpriteHint } from "./getSpriteHint"
import { formatWorkspaceTree } from "./formatWorkspaceTree"

/**
 * Escape XML special characters in a string
 */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

export async function getEnvironmentDetails(
	cline: Task,
	includeFileDetails: boolean = false,
	isUserMessage: boolean = false,
) {
	const currentTime = new Date().toISOString()
	const isFirstMessage = cline.apiConversationHistory.length === 0
	const messageCount = cline.apiConversationHistory.length
	let xmlContent = ""

	// ============================================================================
	// Tool Results Section
	// ============================================================================
	if (cline.markdownToolResults && cline.markdownToolResults.length > 0) {
		xmlContent += "\n  <tool_results>"
		for (const result of cline.markdownToolResults) {
			const status = result.status === "success" ? "success" : "error"
			const pathAttr = result.path ? ` path="${escapeXml(result.path)}"` : ""
			const messageAttr = result.message ? ` message="${escapeXml(result.message)}"` : ""
			xmlContent += `\n    <result tool="${escapeXml(result.toolName)}"${pathAttr} status="${status}"${messageAttr}/>`
		}
		xmlContent += "\n  </tool_results>"
		// Clear the results after including them
		cline.clearMarkdownToolResults()
	}

	const clineProvider = cline.providerRef.deref()
	const state = await clineProvider?.getState()
	const { maxWorkspaceFiles = 200 } = state ?? {}

	// ============================================================================
	// VSCode Section (Visible Files and Open Tabs)
	// ============================================================================
	if (isFirstMessage) {
		const visibleFilePaths = vscode.window.visibleTextEditors
			?.map((editor) => editor.document?.uri?.fsPath)
			.filter(Boolean)
			.map((absolutePath) => path.relative(cline.cwd, absolutePath))
			.slice(0, maxWorkspaceFiles)

		// Filter paths through rooIgnoreController
		const allowedVisibleFiles = cline.rooIgnoreController
			? cline.rooIgnoreController.filterPaths(visibleFilePaths)
			: visibleFilePaths.map((p) => p.toPosix()).join("\n")

		const { maxOpenTabsContext } = state ?? {}
		const maxTabs = maxOpenTabsContext ?? 20
		const openTabPaths = vscode.window.tabGroups.all
			.flatMap((group) => group.tabs)
			.filter((tab) => tab.input instanceof vscode.TabInputText)
			.map((tab) => (tab.input as vscode.TabInputText).uri.fsPath)
			.filter(Boolean)
			.map((absolutePath) => path.relative(cline.cwd, absolutePath).toPosix())
			.slice(0, maxTabs)

		// Filter paths through rooIgnoreController
		const allowedOpenTabs = cline.rooIgnoreController
			? cline.rooIgnoreController.filterPaths(openTabPaths)
			: openTabPaths.map((p) => p.toPosix()).join("\n")

		if (allowedVisibleFiles || allowedOpenTabs) {
			xmlContent += "\n  <vscode>"
			if (allowedVisibleFiles) {
				const visibleFileLines = Array.isArray(allowedVisibleFiles)
					? allowedVisibleFiles
					: allowedVisibleFiles.split("\n").filter(Boolean)
				xmlContent += "\n    <visible_files>"
				for (const file of visibleFileLines) {
					xmlContent += `\n      <file>${escapeXml(file)}</file>`
				}
				xmlContent += "\n    </visible_files>"
			}
			if (allowedOpenTabs) {
				const openTabLines = Array.isArray(allowedOpenTabs)
					? allowedOpenTabs
					: allowedOpenTabs.split("\n").filter(Boolean)
				xmlContent += "\n    <open_tabs>"
				for (const file of openTabLines) {
					xmlContent += `\n      <file>${escapeXml(file)}</file>`
				}
				xmlContent += "\n    </open_tabs>"
			}
			xmlContent += "\n  </vscode>"
		}
	}

	// ============================================================================
	// Terminals Section
	// ============================================================================
	const busyTerminals = [
		...TerminalRegistry.getTerminals(true, cline.taskId),
		...TerminalRegistry.getBackgroundTerminals(true),
	]

	const inactiveTerminals = [
		...TerminalRegistry.getTerminals(false, cline.taskId),
		...TerminalRegistry.getBackgroundTerminals(false),
	]

	if (busyTerminals.length > 0) {
		if (cline.didEditFile) {
			await delay(300) // Delay after saving file to let terminals catch up.
		}

		// Wait for terminals to cool down.
		await pWaitFor(() => busyTerminals.every((t) => !TerminalRegistry.isProcessHot(t.id)), {
			interval: 100,
			timeout: 5_000,
		}).catch(() => {})
	}

	// Reset, this lets us know when to wait for saved files to update terminals.
	cline.didEditFile = false

	let terminalsXml = ""

	// Process active terminals
	if (busyTerminals.length > 0) {
		for (const busyTerminal of busyTerminals) {
			const cwd = busyTerminal.getCurrentWorkingDirectory()
			const command = busyTerminal.getLastCommand()
			let newOutput = TerminalRegistry.getUnretrievedOutput(busyTerminal.id)

			if (newOutput) {
				newOutput = Terminal.compressTerminalOutput(newOutput)
			}

			terminalsXml += `\n    <terminal id="${busyTerminal.id}" status="active" cwd="${escapeXml(cwd)}" command="${escapeXml(command)}">`
			if (newOutput) {
				terminalsXml += `\n      <output>${escapeXml(newOutput)}</output>`
			}
			terminalsXml += "\n    </terminal>"
		}
	}

	// Process inactive terminals with completed processes
	const terminalsWithOutput = inactiveTerminals.filter((terminal) => {
		const completedProcesses = terminal.getProcessesWithOutput()
		return completedProcesses.length > 0
	})

	if (terminalsWithOutput.length > 0) {
		for (const inactiveTerminal of terminalsWithOutput) {
			const completedProcesses = inactiveTerminal.getProcessesWithOutput()

			if (completedProcesses.length > 0) {
				const cwd = inactiveTerminal.getCurrentWorkingDirectory()
				terminalsXml += `\n    <terminal id="${inactiveTerminal.id}" status="completed" cwd="${escapeXml(cwd)}">`

				for (const process of completedProcesses) {
					let output = process.getUnretrievedOutput()

					if (output) {
						output = Terminal.compressTerminalOutput(output)
						terminalsXml += `\n      <process command="${escapeXml(process.command)}">`
						terminalsXml += `\n        <output>${escapeXml(output)}</output>`
						terminalsXml += "\n      </process>"
					}
				}

				terminalsXml += "\n    </terminal>"
			}

			// Clean the queue after retrieving output.
			inactiveTerminal.cleanCompletedProcessQueue()
		}
	}

	if (terminalsXml) {
		xmlContent += "\n  <terminals>"
		xmlContent += terminalsXml
		xmlContent += "\n  </terminals>"
	}

	// ============================================================================
	// Recently Modified Files Section
	// ============================================================================
	const recentlyModifiedFiles = cline.fileContextTracker.getAndClearRecentlyModifiedFiles()

	if (recentlyModifiedFiles.length > 0) {
		xmlContent += '\n  <recently_modified hint="re-read before editing">'
		for (const filePath of recentlyModifiedFiles) {
			xmlContent += `\n    <file>${escapeXml(filePath)}</file>`
		}
		xmlContent += "\n  </recently_modified>"
	}

	// ============================================================================
	// Git Status Section
	// ============================================================================
	if (isFirstMessage) {
		const { maxGitStatusFiles = 0 } = state ?? {}

		if (maxGitStatusFiles > 0) {
			const gitStatus = await getGitStatusStructured(cline.cwd, maxGitStatusFiles)
			if (gitStatus) {
				// Build git element with branch and upstream attributes
				let gitElement = `\n  <git`
				if (gitStatus.branch) {
					gitElement += ` branch="${escapeXml(gitStatus.branch)}"`
				}
				if (gitStatus.upstream) {
					gitElement += ` upstream="${escapeXml(gitStatus.upstream)}"`
				}
				if (gitStatus.truncated) {
					gitElement += ` truncated="true"`
				}
				gitElement += `>`

				// Add file changes
				for (const file of gitStatus.files) {
					gitElement += `\n    <change status="${escapeXml(file.status)}">${escapeXml(file.path)}</change>`
				}

				gitElement += `\n  </git>`
				xmlContent += gitElement
			}
		}
	}

	// ============================================================================
	// Browser Session Section
	// ============================================================================
	const isBrowserActive = cline.browserSession.isSessionActive()

	if (isBrowserActive) {
		// Build viewport info for status (prefer actual viewport if available, else fallback to configured setting)
		const configuredViewport = (state?.browserViewportSize as string | undefined) ?? "900x600"
		let configuredWidth: number | undefined
		let configuredHeight: number | undefined
		if (configuredViewport.includes("x")) {
			const parts = configuredViewport.split("x").map((v) => Number(v))
			configuredWidth = parts[0]
			configuredHeight = parts[1]
		}

		let actualWidth: number | undefined
		let actualHeight: number | undefined
		const vp = cline.browserSession.getViewportSize?.()
		if (vp) {
			actualWidth = vp.width
			actualHeight = vp.height
		}

		const width = actualWidth ?? configuredWidth
		const height = actualHeight ?? configuredHeight
		const viewportInfo = width && height ? `${width}x${height}` : "900x600"

		xmlContent += `\n  <browser status="active" viewport="${viewportInfo}"/>`
	}

	// ============================================================================
	// Workspace Files Section
	// ============================================================================
	if (includeFileDetails) {
		const isDesktop = arePathsEqual(cline.cwd, path.join(os.homedir(), "Desktop"))

		if (isDesktop) {
			xmlContent += `\n  <workspace path="${escapeXml(cline.cwd.toPosix())}">\n    (Desktop files not shown automatically. Use list_files to explore if needed.)\n  </workspace>`
		} else {
			const maxFiles = maxWorkspaceFiles ?? 200

			// Early return for limit of 0
			if (maxFiles === 0) {
				xmlContent += `\n  <workspace path="${escapeXml(cline.cwd.toPosix())}">\n    (Workspace files context disabled. Use list_files to explore if needed.)\n  </workspace>`
			} else {
				// ignoreGitIgnore defaults to true so locally important directories
				// (e.g. .report/, .roo/) that are in .gitignore still appear.
				// Set ROO_RESPECT_GITIGNORE=1 in .env to restore gitignore filtering.
				const [files, didHitLimit] = await listFiles(cline.cwd, true, maxFiles)
				const protectedController = new RooProtectedController(cline.cwd)
				const truncatedAttr = didHitLimit ? ' truncated="true"' : ""

				// Build structured directory tree with similar-file folding
				const workspaceXml = formatWorkspaceTree(files, cline.cwd, {
					foldThreshold: 5,
					checkIgnored: (relativePath: string) =>
						cline.rooIgnoreController ? !cline.rooIgnoreController.validateAccess(relativePath) : false,
					checkProtected: (absolutePath: string) => protectedController.isWriteProtected(absolutePath),
				})

				xmlContent += `\n  <workspace path="${escapeXml(cline.cwd.toPosix())}"${truncatedAttr}>${workspaceXml}\n  </workspace>`
			}
		}
	}

	// ============================================================================
	// Intent Tree Section (意图树：跨对话的目标/实现溯源)
	// 只在用户消息时注入，工具返回时不注入
	// ============================================================================
	if (isUserMessage && cline.intentTree) {
		if (cline.intentTree.isEmpty()) {
			// 空树：强制提示模型先记录目标
			xmlContent += `\n  <intent_tree_prompt>`
			xmlContent += `\n    ⚠️ MANDATORY FIRST STEP: No intent tree exists yet.`
			xmlContent += `\n    Before doing ANYTHING else, analyze the user's message and call add_intent(type: "goal", content: "...") to record their goal.`
			xmlContent += `\n    DO NOT proceed with implementation until the goal is recorded.`
			xmlContent += `\n  </intent_tree_prompt>`
		} else {
			const intentSummary = cline.intentTree.toSummary()
			if (intentSummary) {
				xmlContent += `\n  <intent_tree hint="Analyze user message against this tree. Update nodes if needed (add_intent/update_intent/prune_intent).">`
				xmlContent += `\n${intentSummary
					.split("\n")
					.map((l) => "    " + l)
					.join("\n")}`
				xmlContent += `\n  </intent_tree>`
			}
		}
	}

	// ============================================================================
	// Reminder and Spirit Hint Sections
	// ============================================================================
	const shouldIncludeReminder = isFirstMessage || messageCount % 3 === 0
	const todoListEnabled =
		state && typeof state.apiConfiguration?.todoListEnabled === "boolean"
			? state.apiConfiguration.todoListEnabled
			: true

	const reminderContent = todoListEnabled ? formatReminderSection(cline.todoList) : ""

	// 上下文感知提示选择：根据当前操作状态选择最相关的 hint
	const spriteHintContent = getContextualSpriteHint({
		consecutiveMistakeCount: cline.consecutiveMistakeCount,
		lastToolFailed: cline.didToolFailInCurrentTurn,
		messageCount,
		hasRecentlyModifiedFiles: recentlyModifiedFiles.length > 0,
	})

	if (shouldIncludeReminder && todoListEnabled) {
		if (reminderContent) {
			// reminderContent is already XML formatted, no need to escape
			xmlContent += `\n  <todos>\n    ${reminderContent.split("\n").join("\n    ")}\n  </todos>`
		} else {
			xmlContent += `\n  <todos hint="Create with update_todo_list if task is complex"/>`
		}
	}

	if (shouldIncludeReminder && spriteHintContent) {
		xmlContent += `\n  <spirit_hint>${escapeXml(spriteHintContent)}</spirit_hint>`
	}

	// ============================================================================
	// Assemble Final XML
	// ============================================================================
	return `<environment current_time="${currentTime}">${xmlContent}\n</environment>`
}
