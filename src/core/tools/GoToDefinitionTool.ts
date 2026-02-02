/**
 * Go To Definition Tool
 *
 * Provides the ability to jump to the definition of a symbol at a given position.
 * Uses VSCode LSP API with fallback to tree-sitter.
 */

import * as path from "path"
import { type ClineSayTool } from "@roo-code/types"

import { Task } from "../task/Task"
import { getReadablePath } from "../../utils/path"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { symbolNavigationService, formatDefinitionUI, formatDefinitionForLLM } from "../../services/symbol-navigation"
import type { ToolUse } from "../../shared/tools"

import { BaseTool, ToolCallbacks } from "./BaseTool"

interface GoToDefinitionParams {
	purpose: "understand_implementation" | "trace_import" | "verify_signature"
	path: string
	symbol: string
	surrounding_code?: string
	start_line?: number
}

export class GoToDefinitionTool extends BaseTool<"go_to_definition"> {
	readonly name = "go_to_definition" as const

	async execute(params: GoToDefinitionParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, handleError, pushToolResult } = callbacks

		const { path: filePath, symbol, surrounding_code: surroundingCode, start_line } = params

		// Validate required parameters
		if (!filePath) {
			task.consecutiveMistakeCount++
			task.recordToolError("go_to_definition")
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("go_to_definition", "path"))
			return
		}

		if (!symbol) {
			task.consecutiveMistakeCount++
			task.recordToolError("go_to_definition")
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("go_to_definition", "symbol"))
			return
		}

		task.consecutiveMistakeCount = 0

		const absolutePath = path.resolve(task.cwd, filePath)
		const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)

		const sharedMessageProps: ClineSayTool = {
			tool: "goToDefinition",
			path: getReadablePath(task.cwd, filePath),
			symbol: symbol,
			pattern: surroundingCode,
			startLine: start_line,
			isOutsideWorkspace,
		}

		try {
			// Call the symbol navigation service
			const result = await symbolNavigationService.findDefinition(
				absolutePath,
				symbol,
				surroundingCode,
				start_line,
			)

			// Format the result as structured UI data for webview
			const formattedResult = formatDefinitionUI(result, task.cwd)
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
			const llmResult = formatDefinitionForLLM(result, task.cwd)
			pushToolResult(llmResult)
		} catch (error) {
			await handleError("finding definition", error as Error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"go_to_definition">): Promise<void> {
		const filePath = block.params.path
		const symbol = block.params.symbol
		const surroundingCode = block.params.surrounding_code as string | undefined
		const start_line = block.params.start_line ? parseInt(block.params.start_line, 10) : undefined

		const absolutePath = filePath ? path.resolve(task.cwd, filePath) : task.cwd
		const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)

		const sharedMessageProps: ClineSayTool = {
			tool: "goToDefinition",
			path: getReadablePath(task.cwd, filePath ?? ""),
			symbol: symbol ?? "",
			pattern: surroundingCode,
			startLine: start_line,
			isOutsideWorkspace,
		}

		const partialMessage = JSON.stringify({ ...sharedMessageProps, content: "" } satisfies ClineSayTool)
		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const goToDefinitionTool = new GoToDefinitionTool()
