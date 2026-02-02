import path from "path"
import * as fs from "fs/promises"

import type { Anthropic } from "@anthropic-ai/sdk"
import type { ClineSayTool } from "@roo-code/types"

import { Task } from "../task/Task"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { getReadablePath } from "../../utils/path"

import {
	DEFAULT_MAX_IMAGE_FILE_SIZE_MB,
	DEFAULT_MAX_TOTAL_IMAGE_SIZE_MB,
	isSupportedImageFormat,
	validateImageForProcessing,
	processImageFile,
	ImageMemoryTracker,
	IMAGE_MIME_TYPES,
} from "./helpers/imageHelpers"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface MediaFileResult {
	path: string
	status: "approved" | "denied" | "blocked" | "error" | "pending"
	error?: string
	notice?: string
	imageDataUrl?: string
	feedbackText?: string
}

/**
 * ReadMediaTool - Reads media files (images) for multimodal analysis.
 *
 * This tool is conditionally available based on model's multimodal capabilities (supportsImages).
 * It provides a dedicated interface for reading media files, separate from CLI-based file reading.
 */
export class ReadMediaTool extends BaseTool<"read_media"> {
	readonly name = "read_media" as const

	async execute(params: { files: Array<{ path: string }> }, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { handleError, pushToolResult } = callbacks
		const fileEntries = params.files
		const modelInfo = task.api.getModel().info

		if (!fileEntries || fileEntries.length === 0) {
			task.consecutiveMistakeCount++
			task.recordToolError("read_media")
			const errorMsg = await task.sayAndCreateMissingParamError("read_media", "files")
			const errorResult = `Error: ${errorMsg}`
			pushToolResult(errorResult)
			return
		}

		// Check if model supports images
		const supportsImages = modelInfo.supportsImages ?? false
		if (!supportsImages) {
			task.consecutiveMistakeCount++
			task.recordToolError("read_media")
			const errorMsg =
				"Current model does not support image processing. Please use a model with multimodal capabilities."
			await task.say("error", errorMsg)
			pushToolResult(`Error: ${errorMsg}`)
			return
		}

		// Initialize results
		const fileResults: MediaFileResult[] = fileEntries.map((entry) => ({
			path: entry.path,
			status: "pending" as const,
		}))

		const updateFileResult = (filePath: string, updates: Partial<MediaFileResult>) => {
			const index = fileResults.findIndex((result) => result.path === filePath)
			if (index !== -1) {
				fileResults[index] = { ...fileResults[index], ...updates }
			}
		}

		try {
			const filesToApprove: MediaFileResult[] = []

			// Validate all files first
			for (const fileResult of fileResults) {
				const relPath = fileResult.path
				const fullPath = path.resolve(task.cwd, relPath)

				// Check if path is outside workspace
				if (isPathOutsideWorkspace(fullPath)) {
					updateFileResult(relPath, {
						status: "blocked",
						error: `Cannot read files outside workspace: ${relPath}`,
					})
					continue
				}

				// Check .rooignore
				const rooIgnoreController = task.rooIgnoreController
				if (rooIgnoreController && !rooIgnoreController.validateAccess(relPath)) {
					updateFileResult(relPath, {
						status: "blocked",
						error: `File is blocked by .rooignore: ${relPath}`,
					})
					continue
				}

				// Check if file exists
				try {
					await fs.access(fullPath)
				} catch {
					updateFileResult(relPath, {
						status: "error",
						error: `File not found: ${relPath}`,
					})
					continue
				}

				// Check if it's a supported image format
				const ext = path.extname(relPath).toLowerCase()
				if (!isSupportedImageFormat(ext)) {
					updateFileResult(relPath, {
						status: "error",
						error: `Unsupported media format: ${ext}. Supported formats: PNG, JPG, JPEG, GIF, BMP, SVG, WEBP, ICO, AVIF`,
					})
					continue
				}

				filesToApprove.push(fileResult)
			}

			// Request approval for valid files
			if (filesToApprove.length > 0) {
				const batchFiles = filesToApprove.map((f, index) => ({
					path: f.path,
					lineSnippet: getReadablePath(task.cwd, f.path),
					key: `media-${index}`,
				}))

				const completeMessage = JSON.stringify({
					tool: "readMedia",
					batchFiles,
				} satisfies ClineSayTool)

				const { response, text } = await task.ask("tool", completeMessage, false)

				if (response !== "yesButtonClicked") {
					// User denied
					for (const fileResult of filesToApprove) {
						updateFileResult(fileResult.path, {
							status: "denied",
							feedbackText: text,
						})
					}
				} else {
					// User approved - process images
					const imageMemoryTracker = new ImageMemoryTracker()
					// Get image size limits from user settings
					const state = await task.providerRef.deref()?.getState()
					const {
						maxImageFileSize = DEFAULT_MAX_IMAGE_FILE_SIZE_MB,
						maxTotalImageSize = DEFAULT_MAX_TOTAL_IMAGE_SIZE_MB,
					} = state ?? {}

					for (const fileResult of filesToApprove) {
						const relPath = fileResult.path
						const fullPath = path.resolve(task.cwd, relPath)

						try {
							// Validate image size
							const validationResult = await validateImageForProcessing(
								fullPath,
								supportsImages,
								maxImageFileSize,
								maxTotalImageSize,
								imageMemoryTracker.getTotalMemoryUsed(),
							)

							if (!validationResult.isValid) {
								updateFileResult(relPath, {
									status: "error",
									notice: validationResult.notice,
								})
								continue
							}

							// Process image
							const imageResult = await processImageFile(fullPath)
							imageMemoryTracker.addMemoryUsage(imageResult.sizeInMB)

							updateFileResult(relPath, {
								status: "approved",
								imageDataUrl: imageResult.dataUrl,
								notice: imageResult.notice,
							})
						} catch (error) {
							updateFileResult(relPath, {
								status: "error",
								error: `Failed to process image: ${error instanceof Error ? error.message : String(error)}`,
							})
						}
					}
				}
			}

			// Build result
			// Format as XML for LLM consumption
			const xmlLines: string[] = []
			const imageBlocks: Anthropic.ImageBlockParam[] = []

			const loadedCount = fileResults.filter((r) => r.status === "approved" && r.imageDataUrl).length
			const totalCount = fileResults.length

			xmlLines.push(`<read_media_result loaded="${loadedCount}" total="${totalCount}">`)

			for (const fileResult of fileResults) {
				const relPath = fileResult.path

				switch (fileResult.status) {
					case "approved":
						if (fileResult.imageDataUrl) {
							xmlLines.push(
								`<image path="${relPath}" status="loaded">${fileResult.notice || "Image loaded successfully"}</image>`,
							)
							const ext = path.extname(relPath).toLowerCase()
							const mediaType = IMAGE_MIME_TYPES[ext] || "image/png"
							imageBlocks.push({
								type: "image",
								source: {
									type: "base64",
									media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
									data: fileResult.imageDataUrl.split(",")[1],
								},
							})
						}
						break
					case "denied":
						xmlLines.push(
							`<image path="${relPath}" status="denied">${fileResult.feedbackText || "User denied access"}</image>`,
						)
						break
					case "blocked":
						xmlLines.push(`<image path="${relPath}" status="blocked">${fileResult.error}</image>`)
						break
					case "error":
						xmlLines.push(
							`<image path="${relPath}" status="error">${fileResult.error || fileResult.notice}</image>`,
						)
						break
					default:
						xmlLines.push(`<image path="${relPath}" status="unknown" />`)
				}
			}

			xmlLines.push(`</read_media_result>`)

			// Push result with images as ToolResponse
			if (imageBlocks.length > 0) {
				const response: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [
					{ type: "text", text: xmlLines.join("\n") },
					...imageBlocks,
				]
				pushToolResult(response)
			} else {
				pushToolResult(xmlLines.join("\n"))
			}

			// Reset consecutive mistake count on success
			const hasSuccess = fileResults.some((r) => r.status === "approved")
			if (hasSuccess) {
				task.consecutiveMistakeCount = 0
			}
		} catch (error) {
			await handleError("reading media files", error instanceof Error ? error : new Error(String(error)))
		} finally {
			this.resetPartialState()
		}
	}
}

export const readMediaTool = new ReadMediaTool()
