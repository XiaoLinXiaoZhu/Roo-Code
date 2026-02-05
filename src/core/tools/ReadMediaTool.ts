import path from "path"
import * as fs from "fs/promises"

import type { Anthropic } from "@anthropic-ai/sdk"
import type { ClineSayTool } from "@roo-code/types"

import { Task } from "../task/Task"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { getReadablePath } from "../../utils/path"

import {
	DEFAULT_MAX_MEDIA_FILE_SIZE_MB,
	DEFAULT_MAX_TOTAL_MEDIA_SIZE_MB,
	isSupportedMediaFormat,
	isSupportedVideoFormat,
	validateMediaForProcessing,
	processMediaFile,
	MediaMemoryTracker,
	IMAGE_MIME_TYPES,
	VIDEO_MIME_TYPES,
	getSupportedFormatsDescription,
	type MediaType,
	type VideoProcessingMethod,
	type FocusParams,
} from "./helpers/mediaHelpers"
import { BaseTool, ToolCallbacks } from "./BaseTool"

/**
 * Parameters for read_media tool
 */
interface ReadMediaParams {
	path: string
	focusX?: number
	focusY?: number
	scale?: number
}

interface MediaFileResult {
	path: string
	status: "approved" | "denied" | "blocked" | "error" | "pending"
	error?: string
	notice?: string
	mediaDataUrl?: string
	feedbackText?: string
	mediaType?: MediaType
	mimeType?: string
	originalSize?: { width: number; height: number }
	processedSize?: { width: number; height: number }
	region?: { x: number; y: number; width: number; height: number }
	scale?: number
}

/**
 * Determines the video processing method based on the API provider
 * Default to video_url for all providers that support images
 */
function getVideoProcessingMethod(_apiProvider: string | undefined): VideoProcessingMethod {
	// Default to video_url type for all providers
	// This is the most common format (used by Moonshot/Kimi, etc.)
	return "video_url"
}

/**
 * Check if video is supported for the given provider
 * Default: enabled for all providers that support images
 */
function isVideoSupportedForProvider(_apiProvider: string | undefined, _modelSupportsVideo: boolean): boolean {
	// Default to enabled - if the provider supports images, we try video too
	// The actual API call will fail gracefully if the provider doesn't support video
	return true
}

/**
 * ReadMediaTool - Reads media files (images and videos) for multimodal analysis.
 *
 * This tool supports dynamic multi-pass reading with focus and scale parameters,
 * allowing the model to examine specific regions in detail through multiple calls.
 *
 * Workflow:
 * 1. First call without focus/scale to get an overview (compressed to 1024px)
 * 2. Call again with focusX/focusY/scale to zoom into specific regions
 */
export class ReadMediaTool extends BaseTool<"read_media"> {
	readonly name = "read_media" as const

	async execute(params: ReadMediaParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { handleError, pushToolResult } = callbacks
		const { path: relPath, focusX, focusY, scale } = params
		const modelInfo = task.api.getModel().info
		const apiProvider = task.apiConfiguration.apiProvider

		// Validate required parameter
		if (!relPath) {
			task.consecutiveMistakeCount++
			task.recordToolError("read_media")
			const errorMsg = await task.sayAndCreateMissingParamError("read_media", "path")
			pushToolResult(`Error: ${errorMsg}`)
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

		// Check video support
		const modelSupportsVideo = modelInfo.supportsVideo ?? false
		const supportsVideo = isVideoSupportedForProvider(apiProvider, modelSupportsVideo)
		const videoMethod = getVideoProcessingMethod(apiProvider)

		// Initialize result
		const fileResult: MediaFileResult = {
			path: relPath,
			status: "pending",
			scale: scale ?? 1,
		}

		try {
			const fullPath = path.resolve(task.cwd, relPath)

			// Check if path is outside workspace
			if (isPathOutsideWorkspace(fullPath)) {
				fileResult.status = "blocked"
				fileResult.error = `Cannot read files outside workspace: ${relPath}`
			}
			// Check .rooignore
			else if (task.rooIgnoreController && !task.rooIgnoreController.validateAccess(relPath)) {
				fileResult.status = "blocked"
				fileResult.error = `File is blocked by .rooignore: ${relPath}`
			}
			// Check if file exists
			else {
				try {
					await fs.access(fullPath)
				} catch {
					fileResult.status = "error"
					fileResult.error = `File not found: ${relPath}`
				}
			}

			// Check if it's a supported media format
			if (fileResult.status === "pending") {
				const ext = path.extname(relPath).toLowerCase()
				if (!isSupportedMediaFormat(ext)) {
					fileResult.status = "error"
					fileResult.error = `Unsupported media format: ${ext}. ${getSupportedFormatsDescription()}`
				}
			}

			// Request approval if file is valid
			if (fileResult.status === "pending") {
				const completeMessage = JSON.stringify({
					tool: "readMedia",
					path: relPath,
					focusX: focusX ?? 0.5,
					focusY: focusY ?? 0.5,
					scale: scale ?? 1,
				} satisfies ClineSayTool)

				const { response, text } = await task.ask("tool", completeMessage, false)

				if (response !== "yesButtonClicked") {
					fileResult.status = "denied"
					fileResult.feedbackText = text
				} else {
					// User approved - process media file
					const mediaMemoryTracker = new MediaMemoryTracker()
					const state = await task.providerRef.deref()?.getState()
					const {
						maxImageFileSize = DEFAULT_MAX_MEDIA_FILE_SIZE_MB,
						maxTotalImageSize = DEFAULT_MAX_TOTAL_MEDIA_SIZE_MB,
					} = state ?? {}

					// Validate media size
					const validationResult = await validateMediaForProcessing(
						fullPath,
						supportsImages,
						maxImageFileSize,
						maxTotalImageSize,
						mediaMemoryTracker.getTotalMemoryUsed(),
						supportsVideo,
					)

					if (!validationResult.isValid) {
						fileResult.status = "error"
						fileResult.notice = validationResult.notice
						fileResult.mediaType = validationResult.mediaType
					} else {
						// Process media with focus parameters
						const focusParams: FocusParams = {
							focusX: focusX ?? 0.5,
							focusY: focusY ?? 0.5,
							scale: scale ?? 1,
						}

						const mediaResult = await processMediaFile(fullPath, { focus: focusParams })

						fileResult.status = "approved"
						fileResult.mediaDataUrl = mediaResult.dataUrl
						fileResult.notice = mediaResult.notice
						fileResult.mediaType = mediaResult.mediaType
						fileResult.mimeType = mediaResult.mimeType
						fileResult.originalSize = mediaResult.originalSize
						fileResult.processedSize = mediaResult.processedSize
						fileResult.region = mediaResult.region

						// Send result message with cropped image preview for UI
						const resultMessage = JSON.stringify({
							tool: "readMedia",
							path: relPath,
							focusX: focusX ?? 0.5,
							focusY: focusY ?? 0.5,
							scale: scale ?? 1,
							originalSize: mediaResult.originalSize,
							processedSize: mediaResult.processedSize,
							region: mediaResult.region,
							croppedImageData: mediaResult.dataUrl,
						} satisfies ClineSayTool)
						await task.say("tool", resultMessage)
					}
				}
			}

			// Build result
			const xmlLines: string[] = []
			const mediaBlocks: Array<Anthropic.ImageBlockParam | Record<string, unknown>> = []

			const isLoaded = fileResult.status === "approved" && fileResult.mediaDataUrl

			xmlLines.push(`<read_media_result status="${isLoaded ? "loaded" : fileResult.status}">`)

			switch (fileResult.status) {
				case "approved":
					if (fileResult.mediaDataUrl) {
						const ext = path.extname(relPath).toLowerCase()
						const isVideo = isSupportedVideoFormat(ext)
						const tagName = isVideo ? "video" : "image"

						// Build attributes
						const attrs: string[] = [`path="${relPath}"`, `status="loaded"`]

						if (fileResult.originalSize) {
							attrs.push(
								`original_size="${fileResult.originalSize.width}x${fileResult.originalSize.height}"`,
							)
						}

						if (fileResult.scale && fileResult.scale > 1) {
							attrs.push(`view="detail"`)
							attrs.push(`scale="${fileResult.scale}"`)
							if (focusX !== undefined || focusY !== undefined) {
								attrs.push(`focus="${(focusX ?? 0.5).toFixed(2)},${(focusY ?? 0.5).toFixed(2)}"`)
							}
						} else {
							attrs.push(`view="overview"`)
						}

						if (fileResult.region) {
							const r = fileResult.region
							attrs.push(
								`region="${(r.x * 100).toFixed(0)}%-${((r.x + r.width) * 100).toFixed(0)}% x ${(r.y * 100).toFixed(0)}%-${((r.y + r.height) * 100).toFixed(0)}%"`,
							)
						}

						xmlLines.push(`<${tagName} ${attrs.join(" ")}>`)
						xmlLines.push(fileResult.notice || "Media loaded successfully")
						xmlLines.push(`</${tagName}>`)

						if (isVideo) {
							// Handle video based on processing method
							if (videoMethod === "video_url") {
								mediaBlocks.push({
									type: "video_url",
									video_url: {
										url: fileResult.mediaDataUrl,
									},
								})
							} else if (videoMethod === "image_url_video") {
								mediaBlocks.push({
									type: "image_url",
									image_url: {
										url: fileResult.mediaDataUrl,
									},
								})
							}
						} else {
							// Handle image
							const mimeType = fileResult.mimeType || IMAGE_MIME_TYPES[ext] || "image/jpeg"
							mediaBlocks.push({
								type: "image",
								source: {
									type: "base64",
									media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
									data: fileResult.mediaDataUrl.split(",")[1],
								},
							})
						}
					}
					break
				case "denied":
					xmlLines.push(
						`<media path="${relPath}" status="denied">${fileResult.feedbackText || "User denied access"}</media>`,
					)
					break
				case "blocked":
					xmlLines.push(`<media path="${relPath}" status="blocked">${fileResult.error}</media>`)
					break
				case "error":
					xmlLines.push(
						`<media path="${relPath}" status="error">${fileResult.error || fileResult.notice}</media>`,
					)
					break
				default:
					xmlLines.push(`<media path="${relPath}" status="unknown" />`)
			}

			xmlLines.push(`</read_media_result>`)

			// Push result with media as ToolResponse
			if (mediaBlocks.length > 0) {
				const response: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Record<string, unknown>> =
					[{ type: "text", text: xmlLines.join("\n") }, ...mediaBlocks]
				pushToolResult(response as Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>)
			} else {
				pushToolResult(xmlLines.join("\n"))
			}

			// Reset consecutive mistake count on success
			if (fileResult.status === "approved") {
				task.consecutiveMistakeCount = 0
			}
		} catch (error) {
			await handleError("reading media file", error instanceof Error ? error : new Error(String(error)))
		} finally {
			this.resetPartialState()
		}
	}
}

export const readMediaTool = new ReadMediaTool()
