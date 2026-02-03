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
} from "./helpers/mediaHelpers"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface MediaFileResult {
	path: string
	status: "approved" | "denied" | "blocked" | "error" | "pending"
	error?: string
	notice?: string
	mediaDataUrl?: string
	feedbackText?: string
	mediaType?: MediaType
	mimeType?: string
}

/**
 * Providers that support video_url type for video upload
 * These providers use a dedicated video_url content type
 */
const VIDEO_URL_PROVIDERS = ["moonshot"] as const

/**
 * Providers that support video via image_url type (using video data URL)
 * These providers accept video data URLs in the image_url content type
 */
const IMAGE_URL_VIDEO_PROVIDERS: string[] = []

/**
 * Determines the video processing method based on the API provider
 * Can be overridden via environment variable ROO_VIDEO_METHOD
 */
function getVideoProcessingMethod(apiProvider: string | undefined): VideoProcessingMethod {
	// Check for environment variable override
	const envMethod = process.env.ROO_VIDEO_METHOD
	if (envMethod) {
		if (envMethod === "video_url" || envMethod === "image_url_video") {
			return envMethod
		}
	}

	if (!apiProvider) {
		return "unsupported"
	}

	// Check if provider supports video_url type
	if (VIDEO_URL_PROVIDERS.includes(apiProvider as (typeof VIDEO_URL_PROVIDERS)[number])) {
		return "video_url"
	}

	// Check if provider supports video via image_url
	if (IMAGE_URL_VIDEO_PROVIDERS.includes(apiProvider)) {
		return "image_url_video"
	}

	return "unsupported"
}

/**
 * Check if video is supported for the given provider
 * Can be enabled via environment variable ROO_VIDEO_ENABLED=true
 */
function isVideoSupportedForProvider(apiProvider: string | undefined, modelSupportsVideo: boolean): boolean {
	// Environment variable can force-enable video support
	if (process.env.ROO_VIDEO_ENABLED === "true") {
		return true
	}

	// Check model capability first
	if (modelSupportsVideo) {
		return true
	}

	// Check provider-level support
	return getVideoProcessingMethod(apiProvider) !== "unsupported"
}

/**
 * ReadMediaTool - Reads media files (images and videos) for multimodal analysis.
 *
 * This tool is conditionally available based on model's multimodal capabilities (supportsImages).
 * Video support depends on the API provider and can be configured via environment variables:
 * - ROO_VIDEO_ENABLED=true: Force enable video support
 * - ROO_VIDEO_METHOD=video_url|image_url_video: Override video processing method
 */
export class ReadMediaTool extends BaseTool<"read_media"> {
	readonly name = "read_media" as const

	async execute(params: { files: Array<{ path: string }> }, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { handleError, pushToolResult } = callbacks
		const fileEntries = params.files
		const modelInfo = task.api.getModel().info
		const apiProvider = task.apiConfiguration.apiProvider

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

		// Check video support
		const modelSupportsVideo = modelInfo.supportsVideo ?? false
		const supportsVideo = isVideoSupportedForProvider(apiProvider, modelSupportsVideo)
		const videoMethod = getVideoProcessingMethod(apiProvider)

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

				// Check if it's a supported media format
				const ext = path.extname(relPath).toLowerCase()
				if (!isSupportedMediaFormat(ext)) {
					updateFileResult(relPath, {
						status: "error",
						error: `Unsupported media format: ${ext}. ${getSupportedFormatsDescription()}`,
					})
					continue
				}

				// Check video support for video files
				if (isSupportedVideoFormat(ext) && !supportsVideo) {
					updateFileResult(relPath, {
						status: "error",
						error:
							`Video format detected (${ext}) but current provider "${apiProvider || "unknown"}" does not support video. ` +
							`Supported video providers: ${VIDEO_URL_PROVIDERS.join(", ")}. ` +
							`You can also set ROO_VIDEO_ENABLED=true in .env to force enable video support.`,
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
					// User approved - process media files
					const mediaMemoryTracker = new MediaMemoryTracker()
					// Get media size limits from user settings
					const state = await task.providerRef.deref()?.getState()
					const {
						maxImageFileSize = DEFAULT_MAX_MEDIA_FILE_SIZE_MB,
						maxTotalImageSize = DEFAULT_MAX_TOTAL_MEDIA_SIZE_MB,
					} = state ?? {}

					for (const fileResult of filesToApprove) {
						const relPath = fileResult.path
						const fullPath = path.resolve(task.cwd, relPath)

						try {
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
								updateFileResult(relPath, {
									status: "error",
									notice: validationResult.notice,
									mediaType: validationResult.mediaType,
								})
								continue
							}

							// Process media
							const mediaResult = await processMediaFile(fullPath)
							mediaMemoryTracker.addMemoryUsage(mediaResult.sizeInMB)

							updateFileResult(relPath, {
								status: "approved",
								mediaDataUrl: mediaResult.dataUrl,
								notice: mediaResult.notice,
								mediaType: mediaResult.mediaType,
								mimeType: mediaResult.mimeType,
							})
						} catch (error) {
							updateFileResult(relPath, {
								status: "error",
								error: `Failed to process media: ${error instanceof Error ? error.message : String(error)}`,
							})
						}
					}
				}
			}

			// Build result
			// Format as XML for LLM consumption
			const xmlLines: string[] = []
			const mediaBlocks: Array<Anthropic.ImageBlockParam | Record<string, unknown>> = []

			const loadedCount = fileResults.filter((r) => r.status === "approved" && r.mediaDataUrl).length
			const totalCount = fileResults.length

			xmlLines.push(`<read_media_result loaded="${loadedCount}" total="${totalCount}">`)

			for (const fileResult of fileResults) {
				const relPath = fileResult.path

				switch (fileResult.status) {
					case "approved":
						if (fileResult.mediaDataUrl) {
							const ext = path.extname(relPath).toLowerCase()
							const isVideo = isSupportedVideoFormat(ext)
							const tagName = isVideo ? "video" : "image"

							xmlLines.push(
								`<${tagName} path="${relPath}" status="loaded">${fileResult.notice || "Media loaded successfully"}</${tagName}>`,
							)

							if (isVideo) {
								// Handle video based on processing method
								const mimeType = fileResult.mimeType || VIDEO_MIME_TYPES[ext] || "video/mp4"
								const base64Data = fileResult.mediaDataUrl.split(",")[1]

								if (videoMethod === "video_url") {
									// Use video_url type (e.g., Moonshot/Kimi style)
									mediaBlocks.push({
										type: "video_url",
										video_url: {
											url: fileResult.mediaDataUrl,
										},
									})
								} else if (videoMethod === "image_url_video") {
									// Use image_url type with video data URL
									mediaBlocks.push({
										type: "image_url",
										image_url: {
											url: fileResult.mediaDataUrl,
										},
									})
								}
								// If unsupported, we shouldn't reach here due to earlier validation
							} else {
								// Handle image
								const mimeType = fileResult.mimeType || IMAGE_MIME_TYPES[ext] || "image/png"
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
