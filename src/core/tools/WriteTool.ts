import { Task } from "../task/Task"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { editTool } from "./EditTool"
import { writeToFileTool } from "./WriteToFileTool"

interface WriteParams {
	path: string
	content: string
	search?: string | null
	expected_matches?: number | null
}

/**
 * Unified write tool — routes to EditTool or WriteToFileTool
 * based on whether `search` is provided.
 */
export class WriteTool extends BaseTool<"write"> {
	readonly name = "write" as const

	async execute(params: WriteParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { path: filePath, content, search, expected_matches } = params

		if (search) {
			// Search & replace mode → delegate to EditTool
			await editTool.execute(
				{
					file_path: filePath,
					old_string: search,
					new_string: content,
					replace_all: expected_matches !== 1 && expected_matches !== null && expected_matches !== undefined,
				},
				task,
				callbacks,
			)
		} else {
			// Full file write mode → delegate to WriteToFileTool
			await writeToFileTool.execute(
				{
					purpose: "complete_rewrite",
					path: filePath,
					content,
				},
				task,
				callbacks,
			)
		}
	}

	override async handlePartial(task: Task, block: any): Promise<void> {
		// Delegate partial handling based on content
		// For now, use WriteToFileTool's partial handling as default
		if (!this.hasPathStabilized(block?.nativeArgs?.path)) {
			return
		}
		await writeToFileTool.handlePartial(task, {
			...block,
			params: { path: block?.nativeArgs?.path, content: block?.nativeArgs?.content },
		})
	}
}

export const writeTool = new WriteTool()
