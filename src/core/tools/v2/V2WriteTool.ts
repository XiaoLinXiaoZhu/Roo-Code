/**
 * V2WriteTool — 文件创建/覆盖 (v2)
 *
 * 纯文件写入，不含修改逻辑（修改由 v2_edit 负责）。
 * 独立实现，不复用 WriteToFileTool。
 */

import fs from "fs/promises"
import * as path from "path"
import { existsSync, mkdirSync } from "fs"

import type { ClineSayTool } from "@roo-code/types"

import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"
import { getReadablePath } from "../../../utils/path"
import { isPathOutsideWorkspace } from "../../../utils/pathUtils"
import { RecordSource } from "../../context-tracking/FileContextTrackerTypes"
import { fileExistsAtPath } from "../../../utils/fs"
import { BaseTool, ToolCallbacks } from "../BaseTool"

interface V2WriteParams {
	path: string
	content: string
}

export class V2WriteTool extends BaseTool<"write"> {
	readonly name = "write" as const

	async execute(params: V2WriteParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError, askApproval } = callbacks
		const { path: relPath, content } = params

		try {
			if (!relPath) {
				task.consecutiveMistakeCount++
				task.recordToolError("write")
				pushToolResult(await task.sayAndCreateMissingParamError("write", "path"))
				return
			}

			if (content === undefined || content === null) {
				task.consecutiveMistakeCount++
				task.recordToolError("write")
				pushToolResult(await task.sayAndCreateMissingParamError("write", "content"))
				return
			}

			// Check rooignore access
			const accessAllowed = task.rooIgnoreController?.validateAccess(relPath)
			if (!accessAllowed) {
				await task.say("rooignore_error", relPath)
				pushToolResult(formatResponse.rooIgnoreError(relPath))
				return
			}

			const absolutePath = path.resolve(task.cwd, relPath)
			const fileExists = await fileExistsAtPath(absolutePath)
			const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)

			task.consecutiveMistakeCount = 0

			// Build approval message
			const sharedMessageProps: ClineSayTool = {
				tool: fileExists ? "editedExistingFile" : "newFileCreated",
				path: getReadablePath(task.cwd, relPath),
				content,
				isOutsideWorkspace,
			}

			const completeMessage = JSON.stringify(sharedMessageProps)
			const didApprove = await askApproval("tool", completeMessage)

			if (!didApprove) {
				return
			}

			// Ensure directory exists
			const dir = path.dirname(absolutePath)
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true })
			}

			// Write file
			await fs.writeFile(absolutePath, content, "utf8")

			// Track file context
			await task.fileContextTracker.trackFileContext(relPath, "roo_edited" as RecordSource)
			task.didEditFile = true

			pushToolResult(`File ${fileExists ? "updated" : "created"}: ${relPath}`)
		} catch (error) {
			await handleError("executing write", error as Error)
		}
	}

	override async handlePartial(task: Task, block: any): Promise<void> {
		const relPath = block.params?.path ?? block.nativeArgs?.path
		if (!this.hasPathStabilized(relPath)) {
			return
		}

		const absolutePath = path.resolve(task.cwd, relPath!)
		const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)

		const sharedMessageProps: ClineSayTool = {
			tool: "newFileCreated",
			path: getReadablePath(task.cwd, relPath!),
			isOutsideWorkspace,
		}

		await task.ask("tool", JSON.stringify(sharedMessageProps), block.partial).catch(() => {})
	}
}

export const writeTool = new V2WriteTool()
