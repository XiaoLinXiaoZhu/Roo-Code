/**
 * V2EditTool — 文件内容修改 (v2)
 *
 * 精确的 search & replace 操作。
 * 独立实现，不复用 EditTool。
 */

import fs from "fs/promises"
import * as path from "path"

import type { ClineSayTool, DEFAULT_WRITE_DELAY_MS } from "@roo-code/types"

import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"
import { getReadablePath } from "../../../utils/path"
import { isPathOutsideWorkspace } from "../../../utils/pathUtils"
import { RecordSource } from "../../context-tracking/FileContextTrackerTypes"
import { fileExistsAtPath } from "../../../utils/fs"
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
		const { pushToolResult, handleError, askApproval } = callbacks
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

			// Check rooignore access
			const accessAllowed = task.rooIgnoreController?.validateAccess(relPath)
			if (!accessAllowed) {
				await task.say("rooignore_error", relPath)
				pushToolResult(formatResponse.rooIgnoreError(relPath))
				return
			}

			const absolutePath = path.resolve(task.cwd, relPath)

			if (!(await fileExistsAtPath(absolutePath))) {
				task.consecutiveMistakeCount++
				task.recordToolError("edit")
				pushToolResult(formatResponse.toolError(`File not found: ${relPath}`))
				return
			}

			// Read file and normalize line endings
			let fileContent = await fs.readFile(absolutePath, "utf8")
			fileContent = fileContent.replace(/\r\n/g, "\n")
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
						`No match found for 'search' in ${relPath}. Make sure the text appears exactly in the file.`,
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

			// Generate diff for approval
			const diff = formatResponse.createPrettyPatch(relPath, fileContent, newContent)
			if (!diff) {
				pushToolResult(`No changes needed for '${relPath}'`)
				return
			}

			const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)
			const sharedMessageProps: ClineSayTool = {
				tool: "appliedDiff",
				path: getReadablePath(task.cwd, relPath),
				diff,
				isOutsideWorkspace,
			}

			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: diff,
			} satisfies ClineSayTool)

			const didApprove = await askApproval("tool", completeMessage)
			if (!didApprove) {
				return
			}

			// Write the file directly
			await fs.writeFile(absolutePath, newContent, "utf8")

			// Track file context
			await task.fileContextTracker.trackFileContext(relPath, "roo_edited" as RecordSource)
			task.didEditFile = true

			pushToolResult(`Edited ${relPath}: ${matchCount} replacement(s) applied.`)
			this.resetPartialState()
		} catch (error) {
			await handleError("executing edit", error as Error)
			this.resetPartialState()
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
			tool: "appliedDiff",
			path: getReadablePath(task.cwd, relPath!),
			diff: block.params?.search ? "1 edit operation" : undefined,
			isOutsideWorkspace,
		}

		await task.ask("tool", JSON.stringify(sharedMessageProps), block.partial).catch(() => {})
	}
}

export const editTool = new V2EditTool()
