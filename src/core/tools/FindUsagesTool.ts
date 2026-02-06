/**
 * Find Usages Tool
 *
 * Provides the ability to find all usages of a symbol at a given position.
 * Uses VSCode LSP API with fallback to regex search.
 */

import * as path from "path"
import { type ClineSayTool } from "@roo-code/types"

import { Task } from "../task/Task"
import { getReadablePath } from "../../utils/path"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { symbolNavigationService, formatReferencesUI, formatReferencesForLLM } from "../../services/symbol-navigation"
import type { ToolUse } from "../../shared/tools"

import { BaseTool, ToolCallbacks } from "./BaseTool"

interface FindUsagesParams {
	purpose: "impact_analysis" | "usage_patterns" | "dead_code_check"
	path: string
	symbol: string
	surrounding_code?: string
	start_line?: number
	include_declaration?: boolean
	max_results?: number
}

export class FindUsagesTool extends BaseTool<"find_usages"> {
	readonly name = "find_usages" as const

	async execute(params: FindUsagesParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, handleError, pushToolResult } = callbacks

		const {
			path: filePath,
			symbol,
			surrounding_code: surroundingCode,
			start_line,
			include_declaration,
			max_results,
		} = params

		// Validate required parameters
		if (!filePath) {
			task.consecutiveMistakeCount++
			task.recordToolError("find_usages")
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("find_usages", "path"))
			return
		}

		if (!symbol) {
			task.consecutiveMistakeCount++
			task.recordToolError("find_usages")
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("find_usages", "symbol"))
			return
		}

		task.consecutiveMistakeCount = 0

		const absolutePath = path.resolve(task.cwd, filePath)
		const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)

		const sharedMessageProps: ClineSayTool = {
			tool: "findUsages",
			path: getReadablePath(task.cwd, filePath),
			symbol: symbol,
			pattern: surroundingCode,
			startLine: start_line,
			includeDeclaration: include_declaration ?? true,
			maxResults: max_results ?? 50,
			isOutsideWorkspace,
		}

		try {
			// Call the symbol navigation service
			const result = await symbolNavigationService.findReferences(
				absolutePath,
				symbol,
				surroundingCode,
				start_line,
				{
					includeDeclaration: include_declaration ?? true,
					maxResults: max_results ?? 50,
				},
			)

			// Format the result as structured UI data for webview
			const formattedResult = formatReferencesUI(result, task.cwd)
			const contentJson = JSON.stringify(formattedResult)

			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: contentJson,
			} satisfies ClineSayTool)

			const didApprove = await askApproval("tool", completeMessage)

			if (!didApprove) {
				return
			}

			// Format the result as XML for LLM consumption
			const llmResult = formatReferencesForLLM(result, task.cwd)
			pushToolResult(llmResult)
		} catch (error) {
			await handleError("finding usages", error as Error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"find_usages">): Promise<void> {
		const filePath = block.params.path
		const symbol = block.params.symbol
		const surroundingCode = block.params.surrounding_code
		const startLine = block.params.start_line ? parseInt(block.params.start_line, 10) : undefined

		const absolutePath = filePath ? path.resolve(task.cwd, filePath) : task.cwd
		const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)

		const sharedMessageProps: ClineSayTool = {
			tool: "findUsages",
			path: getReadablePath(task.cwd, filePath ?? ""),
			symbol: symbol,
			pattern: surroundingCode,
			startLine: startLine,
			isOutsideWorkspace,
		}

		const partialMessage = JSON.stringify({ ...sharedMessageProps, content: "" } satisfies ClineSayTool)
		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const findUsagesTool = new FindUsagesTool()
