/**
 * V2WriteTool — 文件创建/覆盖 (v2)
 *
 * 完整实现，包含差异预览、写保护、内容预处理等所有功能。
 * 参数格式: { path, content }
 */

import path from "path"
import delay from "delay"
import fs from "fs/promises"

import { type ClineSayTool, DEFAULT_WRITE_DELAY_MS } from "@roo-code/types"

import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"
import { RecordSource } from "../../context-tracking/FileContextTrackerTypes"
import { fileExistsAtPath, createDirectoriesForFile } from "../../../utils/fs"
import { stripLineNumbers, everyLineHasLineNumbers } from "../../../integrations/misc/extract-text"
import { getReadablePath } from "../../../utils/path"
import { isPathOutsideWorkspace } from "../../../utils/pathUtils"
import { unescapeHtmlEntities } from "../../../utils/text-normalization"
import { EXPERIMENT_IDS, experiments } from "../../../shared/experiments"
import { convertNewFileToUnifiedDiff, computeDiffStats, sanitizeUnifiedDiff } from "../../diff/stats"
import type { ToolUse } from "../../../shared/tools"

import { BaseTool, ToolCallbacks } from "../BaseTool"

interface V2WriteParams {
	path: string
	content: string
}

export class V2WriteTool extends BaseTool<"write"> {
	readonly name = "write" as const

	async execute(params: V2WriteParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError, askApproval } = callbacks
		const relPath = params.path
		let newContent = params.content

		if (!relPath) {
			task.consecutiveMistakeCount++
			task.recordToolError("write")
			pushToolResult(await task.sayAndCreateMissingParamError("write", "path"))
			await task.diffViewProvider.reset()
			return
		}

		if (newContent === undefined) {
			task.consecutiveMistakeCount++
			task.recordToolError("write")
			pushToolResult(await task.sayAndCreateMissingParamError("write", "content"))
			await task.diffViewProvider.reset()
			return
		}

		// PLACEHOLDER_EXECUTE_BODY — Access control
		const accessAllowed = task.rooIgnoreController?.validateAccess(relPath)
		if (!accessAllowed) {
			await task.say("rooignore_error", relPath)
			pushToolResult(formatResponse.rooIgnoreError(relPath))
			return
		}

		const isWriteProtected = task.rooProtectedController?.isWriteProtected(relPath) || false

		let fileExists: boolean
		const absolutePath = path.resolve(task.cwd, relPath)

		if (task.diffViewProvider.editType !== undefined) {
			fileExists = task.diffViewProvider.editType === "modify"
		} else {
			fileExists = await fileExistsAtPath(absolutePath)
			task.diffViewProvider.editType = fileExists ? "modify" : "create"
		}

		// Create parent directories early for new files
		if (!fileExists) {
			await createDirectoriesForFile(absolutePath)
		}

		// Content preprocessing: strip code block markers
		if (newContent.startsWith("```")) {
			newContent = newContent.split("\n").slice(1).join("\n")
		}
		if (newContent.endsWith("```")) {
			newContent = newContent.split("\n").slice(0, -1).join("\n")
		}

		// HTML entity decoding for non-Claude models
		if (!task.api.getModel().id.includes("claude")) {
			newContent = unescapeHtmlEntities(newContent)
		}

		const fullPath = relPath ? path.resolve(task.cwd, relPath) : ""
		const isOutsideWorkspace = isPathOutsideWorkspace(fullPath)

		const sharedMessageProps: ClineSayTool = {
			tool: fileExists ? "editedExistingFile" : "newFileCreated",
			path: getReadablePath(task.cwd, relPath),
			content: newContent,
			isOutsideWorkspace,
			isProtected: isWriteProtected,
		}

		try {
			task.consecutiveMistakeCount = 0

			const provider = task.providerRef.deref()
			const state = await provider?.getState()
			const diagnosticsEnabled = state?.diagnosticsEnabled ?? true
			const writeDelayMs = state?.writeDelayMs ?? DEFAULT_WRITE_DELAY_MS
			const isPreventFocusDisruptionEnabled = experiments.isEnabled(
				state?.experiments ?? {},
				EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION,
			)

			if (isPreventFocusDisruptionEnabled) {
				// PREVENT_FOCUS_DISRUPTION: no diff editor, save directly
				task.diffViewProvider.editType = fileExists ? "modify" : "create"
				if (fileExists) {
					task.diffViewProvider.originalContent = await fs.readFile(absolutePath, "utf-8")
				} else {
					task.diffViewProvider.originalContent = ""
				}

				let unified = fileExists
					? formatResponse.createPrettyPatch(relPath, task.diffViewProvider.originalContent, newContent)
					: convertNewFileToUnifiedDiff(newContent, relPath)
				unified = sanitizeUnifiedDiff(unified)
				const completeMessage = JSON.stringify({
					...sharedMessageProps,
					content: unified,
					diffStats: computeDiffStats(unified) || undefined,
				} satisfies ClineSayTool)

				const didApprove = await askApproval("tool", completeMessage, undefined, isWriteProtected)
				if (!didApprove) {
					return
				}

				await task.diffViewProvider.saveDirectly(relPath, newContent, false, diagnosticsEnabled, writeDelayMs)
			} else {
				// Standard path: open diff editor, show preview, then save
				if (!task.diffViewProvider.isEditing) {
					const partialMessage = JSON.stringify(sharedMessageProps)
					await task.ask("tool", partialMessage, true).catch(() => {})
					await task.diffViewProvider.open(relPath)
				}

				await task.diffViewProvider.update(
					everyLineHasLineNumbers(newContent) ? stripLineNumbers(newContent) : newContent,
					true,
				)

				await delay(300)
				task.diffViewProvider.scrollToFirstDiff()

				let unified = fileExists
					? formatResponse.createPrettyPatch(relPath, task.diffViewProvider.originalContent, newContent)
					: convertNewFileToUnifiedDiff(newContent, relPath)
				unified = sanitizeUnifiedDiff(unified)
				const completeMessage = JSON.stringify({
					...sharedMessageProps,
					content: unified,
					diffStats: computeDiffStats(unified) || undefined,
				} satisfies ClineSayTool)

				const didApprove = await askApproval("tool", completeMessage, undefined, isWriteProtected)
				if (!didApprove) {
					await task.diffViewProvider.revertChanges()
					return
				}

				await task.diffViewProvider.saveChanges(diagnosticsEnabled, writeDelayMs)
			}

			if (relPath) {
				await task.fileContextTracker.trackFileContext(relPath, "roo_edited" as RecordSource)
			}

			task.didEditFile = true

			const message = await task.diffViewProvider.pushToolWriteResult(task, task.cwd, !fileExists)
			pushToolResult(message)

			await task.diffViewProvider.reset()
			this.resetPartialState()

			task.processQueuedMessages()

			return
		} catch (error) {
			await handleError("writing file", error as Error)
			await task.diffViewProvider.reset()
			this.resetPartialState()
			return
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"write">): Promise<void> {
		const relPath: string | undefined = block.params?.path ?? (block as any).nativeArgs?.path
		let newContent: string | undefined = block.params?.content ?? (block as any).nativeArgs?.content

		// Wait for path to stabilize before showing UI (prevents truncated paths)
		if (!this.hasPathStabilized(relPath) || newContent === undefined) {
			return
		}

		const provider = task.providerRef.deref()
		const state = await provider?.getState()
		const isPreventFocusDisruptionEnabled = experiments.isEnabled(
			state?.experiments ?? {},
			EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION,
		)

		if (isPreventFocusDisruptionEnabled) {
			return
		}

		let fileExists: boolean
		const absolutePath = path.resolve(task.cwd, relPath!)

		if (task.diffViewProvider.editType !== undefined) {
			fileExists = task.diffViewProvider.editType === "modify"
		} else {
			fileExists = await fileExistsAtPath(absolutePath)
			task.diffViewProvider.editType = fileExists ? "modify" : "create"
		}

		// Create parent directories early for new files
		if (!fileExists) {
			await createDirectoriesForFile(absolutePath)
		}

		const isWriteProtected = task.rooProtectedController?.isWriteProtected(relPath!) || false
		const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)

		const sharedMessageProps: ClineSayTool = {
			tool: fileExists ? "editedExistingFile" : "newFileCreated",
			path: getReadablePath(task.cwd, relPath!),
			content: newContent || "",
			isOutsideWorkspace,
			isProtected: isWriteProtected,
		}

		const partialMessage = JSON.stringify(sharedMessageProps)
		await task.ask("tool", partialMessage, block.partial).catch(() => {})

		if (newContent) {
			if (!task.diffViewProvider.isEditing) {
				await task.diffViewProvider.open(relPath!)
			}

			await task.diffViewProvider.update(
				everyLineHasLineNumbers(newContent) ? stripLineNumbers(newContent) : newContent,
				false,
			)
		}
	}
}

export const writeTool = new V2WriteTool()
