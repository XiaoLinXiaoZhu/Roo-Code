/**
 * V2EditTool — 文件内容修改 (v2)
 *
 * 精确的 search & replace 操作，完整功能实现。
 * 参数格式: { path, search, replace, expectedMatches? }
 */

import fs from "fs/promises"
import path from "path"

import { type ClineSayTool, DEFAULT_WRITE_DELAY_MS } from "@roo-code/types"

import { getReadablePath } from "../../../utils/path"
import { isPathOutsideWorkspace } from "../../../utils/pathUtils"
import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"
import { RecordSource } from "../../context-tracking/FileContextTrackerTypes"
import { fileExistsAtPath } from "../../../utils/fs"
import { EXPERIMENT_IDS, experiments } from "../../../shared/experiments"
import { sanitizeUnifiedDiff, computeDiffStats } from "../../diff/stats"
import type { ToolUse } from "../../../shared/tools"

import { BaseTool, ToolCallbacks } from "../BaseTool"

interface V2EditParams {
	path: string
	search: string
	replace: string
	expectedMatches?: number
}

export class V2EditTool extends BaseTool<"edit"> {
	readonly name = "edit" as const

	async execute(params: V2EditParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, handleError, pushToolResult } = callbacks
		const { path: relPath, search, replace: replaceText } = params
		const expectedCount = params.expectedMatches ?? 1

		try {
			// Validate required parameters
			if (!relPath) {
				task.consecutiveMistakeCount++
				task.recordToolError("edit")
				pushToolResult(await task.sayAndCreateMissingParamError("edit", "path"))
				return
			}

			if (!search) {
				task.consecutiveMistakeCount++
				task.recordToolError("edit")
				pushToolResult(await task.sayAndCreateMissingParamError("edit", "search"))
				return
			}

			if (replaceText === undefined) {
				task.consecutiveMistakeCount++
				task.recordToolError("edit")
				pushToolResult(await task.sayAndCreateMissingParamError("edit", "replace"))
				return
			}

			if (search === replaceText) {
				task.consecutiveMistakeCount++
				task.recordToolError("edit")
				pushToolResult(formatResponse.toolError("'search' and 'replace' are identical. No changes needed."))
				return
			}

			// Access control
			const accessAllowed = task.rooIgnoreController?.validateAccess(relPath)
			if (!accessAllowed) {
				await task.say("rooignore_error", relPath)
				pushToolResult(formatResponse.rooIgnoreError(relPath))
				return
			}

			// Write protection check
			const isWriteProtected = task.rooProtectedController?.isWriteProtected(relPath) || false

			const absolutePath = path.resolve(task.cwd, relPath)

			const fileExists = await fileExistsAtPath(absolutePath)
			if (!fileExists) {
				task.consecutiveMistakeCount++
				task.recordToolError("edit")
				const errorMessage = `File not found: ${relPath}. Cannot perform edit on a non-existent file.`
				await task.say("error", errorMessage)
				pushToolResult(formatResponse.toolError(errorMessage))
				return
			}

			// Read file and normalize line endings
			let fileContent: string
			try {
				fileContent = await fs.readFile(absolutePath, "utf8")
				fileContent = fileContent.replace(/\r\n/g, "\n")
			} catch (error) {
				task.consecutiveMistakeCount++
				task.recordToolError("edit")
				const errorMessage = `Failed to read file '${relPath}'. Please verify file permissions and try again.`
				await task.say("error", errorMessage)
				pushToolResult(formatResponse.toolError(errorMessage))
				return
			}

			const normalizedSearch = search.replace(/\r\n/g, "\n")
			const normalizedReplace = replaceText.replace(/\r\n/g, "\n")

			// Count occurrences
			let matchCount = 0
			let pos = 0
			while (true) {
				const idx = fileContent.indexOf(normalizedSearch, pos)
				if (idx === -1) break
				matchCount++
				pos = idx + normalizedSearch.length
			}

			if (matchCount === 0) {
				task.consecutiveMistakeCount++
				task.recordToolError("edit", "no_match")
				pushToolResult(
					formatResponse.toolError(
						`No match found for 'search' in ${relPath}. Make sure the text appears exactly in the file, including whitespace and indentation.`,
					),
				)
				return
			}

			if (matchCount !== expectedCount) {
				task.consecutiveMistakeCount++
				task.recordToolError("edit")
				pushToolResult(
					formatResponse.toolError(
						`Expected ${expectedCount} match(es) but found ${matchCount}. Adjust 'expectedMatches' or provide more specific search text.`,
					),
				)
				return
			}

			// Apply replacement
			const newContent = fileContent.replaceAll(normalizedSearch, normalizedReplace)

			if (newContent === fileContent) {
				pushToolResult(`No changes needed for '${relPath}'`)
				return
			}

			task.consecutiveMistakeCount = 0

			// Initialize diff view
			task.diffViewProvider.editType = "modify"
			task.diffViewProvider.originalContent = fileContent

			// Generate and validate diff
			const diff = formatResponse.createPrettyPatch(relPath, fileContent, newContent)
			if (!diff) {
				pushToolResult(`No changes needed for '${relPath}'`)
				await task.diffViewProvider.reset()
				return
			}

			// Get provider state for experiment flags and settings
			const provider = task.providerRef.deref()
			const state = await provider?.getState()
			const diagnosticsEnabled = state?.diagnosticsEnabled ?? true
			const writeDelayMs = state?.writeDelayMs ?? DEFAULT_WRITE_DELAY_MS
			const isPreventFocusDisruptionEnabled = experiments.isEnabled(
				state?.experiments ?? {},
				EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION,
			)

			const sanitizedDiff = sanitizeUnifiedDiff(diff)
			const diffStats = computeDiffStats(sanitizedDiff) || undefined
			const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)

			const sharedMessageProps: ClineSayTool = {
				tool: "appliedDiff",
				path: getReadablePath(task.cwd, relPath),
				diff: sanitizedDiff,
				isOutsideWorkspace,
			}

			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: sanitizedDiff,
				isProtected: isWriteProtected,
				diffStats,
			} satisfies ClineSayTool)

			// Show diff view if focus disruption prevention is disabled
			if (!isPreventFocusDisruptionEnabled) {
				await task.diffViewProvider.open(relPath)
				await task.diffViewProvider.update(newContent, true)
				task.diffViewProvider.scrollToFirstDiff()
			}

			const didApprove = await askApproval("tool", completeMessage, undefined, isWriteProtected)

			if (!didApprove) {
				if (!isPreventFocusDisruptionEnabled) {
					await task.diffViewProvider.revertChanges()
				}
				pushToolResult("Changes were rejected by the user.")
				await task.diffViewProvider.reset()
				return
			}

			// Save the changes
			if (isPreventFocusDisruptionEnabled) {
				await task.diffViewProvider.saveDirectly(relPath, newContent, false, diagnosticsEnabled, writeDelayMs)
			} else {
				await task.diffViewProvider.saveChanges(diagnosticsEnabled, writeDelayMs)
			}

			// Track file edit
			if (relPath) {
				await task.fileContextTracker.trackFileContext(relPath, "roo_edited" as RecordSource)
			}

			task.didEditFile = true

			const message = await task.diffViewProvider.pushToolWriteResult(task, task.cwd, false)
			pushToolResult(message)

			await task.diffViewProvider.reset()
			this.resetPartialState()

			task.processQueuedMessages()
		} catch (error) {
			await handleError("edit", error as Error)
			await task.diffViewProvider.reset()
			this.resetPartialState()
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"edit">): Promise<void> {
		const relPath: string | undefined = block.params?.path ?? (block as any).nativeArgs?.path

		// Wait for path to stabilize before showing UI
		if (!this.hasPathStabilized(relPath)) {
			return
		}

		const absolutePath = path.resolve(task.cwd, relPath!)
		const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)

		const sharedMessageProps: ClineSayTool = {
			tool: "appliedDiff",
			path: getReadablePath(task.cwd, relPath!),
			diff: block.params?.search ? "1 edit operation" : undefined,
			isOutsideWorkspace,
		}

		await task.ask("tool", JSON.stringify(sharedMessageProps), block.partial).catch(() => {})
	}
}

export const editTool = new V2EditTool()
