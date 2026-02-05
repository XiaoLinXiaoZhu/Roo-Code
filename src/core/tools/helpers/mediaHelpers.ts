import path from "path"
import * as fs from "fs/promises"
import { t } from "../../../i18n"
import prettyBytes from "pretty-bytes"
import { Jimp } from "jimp"

/**
 * Default maximum allowed media file size in bytes (5MB)
 * This applies to both images and videos
 */
export const DEFAULT_MAX_MEDIA_FILE_SIZE_MB = 5

/**
 * Default maximum total memory usage for all media in a single read operation (20MB)
 * This is a cumulative limit - as each media is processed, its size is added to the total.
 * If including another media would exceed this limit, it will be skipped with a notice.
 */
export const DEFAULT_MAX_TOTAL_MEDIA_SIZE_MB = 20

/**
 * Default output size for processed images (longest edge in pixels)
 * Images are compressed to this size to optimize token usage
 */
export const DEFAULT_OUTPUT_SIZE = 1024

/**
 * Default JPEG quality for compressed output
 */
export const DEFAULT_QUALITY = 85

/**
 * Maximum allowed scale factor
 */
export const MAX_SCALE = 8

/**
 * Supported image formats that can be displayed
 */
export const SUPPORTED_IMAGE_FORMATS = [
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".svg",
	".bmp",
	".ico",
	".tiff",
	".tif",
	".avif",
] as const

/**
 * Supported video formats
 */
export const SUPPORTED_VIDEO_FORMATS = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".3gp", ".ogv"] as const

export const IMAGE_MIME_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".bmp": "image/bmp",
	".ico": "image/x-icon",
	".tiff": "image/tiff",
	".tif": "image/tiff",
	".avif": "image/avif",
}

export const VIDEO_MIME_TYPES: Record<string, string> = {
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mov": "video/quicktime",
	".avi": "video/x-msvideo",
	".mkv": "video/x-matroska",
	".m4v": "video/x-m4v",
	".3gp": "video/3gpp",
	".ogv": "video/ogg",
}

/**
 * Media type classification
 */
export type MediaType = "image" | "video"

/**
 * Video processing method based on API provider
 * - "video_url": Use video_url type (e.g., Moonshot/Kimi)
 * - "image_url_video": Use image_url type with video data URL (e.g., some OpenAI-compatible APIs)
 * - "unsupported": Provider does not support video
 */
export type VideoProcessingMethod = "video_url" | "image_url_video" | "unsupported"

/**
 * Focus parameters for zooming into specific regions
 */
export interface FocusParams {
	focusX?: number // 0-1, default 0.5
	focusY?: number // 0-1, default 0.5
	scale?: number // 1-8, default 1
}

/**
 * Processed region information (normalized coordinates)
 */
export interface ProcessedRegion {
	x: number // 0-1, start x
	y: number // 0-1, start y
	width: number // 0-1, region width
	height: number // 0-1, region height
}

/**
 * Result of media validation
 */
export interface MediaValidationResult {
	isValid: boolean
	reason?: "size_limit" | "memory_limit" | "unsupported_model" | "unsupported_format" | "video_unsupported"
	notice?: string
	sizeInMB?: number
	mediaType?: MediaType
}

/**
 * Result of media processing
 */
export interface MediaProcessingResult {
	dataUrl: string
	buffer: Buffer
	sizeInKB: number
	sizeInMB: number
	notice: string
	mediaType: MediaType
	mimeType: string
	originalSize?: { width: number; height: number }
	processedSize?: { width: number; height: number }
	region?: ProcessedRegion
}

/**
 * Options for media processing with focus support
 */
export interface MediaProcessingOptions {
	focus?: FocusParams
	maxOutputSize?: number // default 1024
	quality?: number // JPEG quality, default 85
}

/**
 * Calculate crop region based on focus point and scale
 */
export function calculateCropRegion(
	imageWidth: number,
	imageHeight: number,
	focusX: number = 0.5,
	focusY: number = 0.5,
	scale: number = 1,
): { x: number; y: number; width: number; height: number } {
	// Crop region size = original / scale
	const cropWidth = imageWidth / scale
	const cropHeight = imageHeight / scale

	// Calculate crop start point centered on focus
	let x = focusX * imageWidth - cropWidth / 2
	let y = focusY * imageHeight - cropHeight / 2

	// Boundary constraints: ensure we don't exceed image bounds
	x = Math.max(0, Math.min(x, imageWidth - cropWidth))
	y = Math.max(0, Math.min(y, imageHeight - cropHeight))

	return {
		x: Math.round(x),
		y: Math.round(y),
		width: Math.round(cropWidth),
		height: Math.round(cropHeight),
	}
}

/**
 * Generate processing notice for the result
 */
export function generateProcessingNotice(
	scale: number,
	region: ProcessedRegion,
	origWidth: number,
	origHeight: number,
): string {
	const recommendation =
		`\n\n💡 Recommendation: Examine the image thoroughly with at least 10 focused observations. ` +
		`Reading images costs minimal tokens, but careful multi-pass examination often reveals ` +
		`important details missed in a single glance. Consider scanning: corners, edges, text areas, ` +
		`diagrams, annotations, and any regions that seem information-dense.`

	if (scale === 1) {
		return (
			`Overview of full image (${origWidth}x${origHeight}). ` +
			`Image has been compressed to optimize token usage. ` +
			`Use focusX/focusY/scale parameters to examine specific regions in detail.` +
			recommendation
		)
	}

	const regionDesc =
		`x:${(region.x * 100).toFixed(0)}%-${((region.x + region.width) * 100).toFixed(0)}%, ` +
		`y:${(region.y * 100).toFixed(0)}%-${((region.y + region.height) * 100).toFixed(0)}%`
	const areaPercent = (region.width * region.height * 100).toFixed(1)

	return (
		`Zoomed ${scale}x into region [${regionDesc}] of ${origWidth}x${origHeight} image. ` +
		`This view shows approximately ${areaPercent}% of the original image area. ` +
		`To see other areas, adjust focusX/focusY. To zoom out, reduce scale.` +
		recommendation
	)
}

/**
 * Process an image file with focus and scale support
 * Images are automatically compressed to optimize token usage
 */
export async function processImageWithFocus(
	filePath: string,
	options: MediaProcessingOptions = {},
): Promise<MediaProcessingResult> {
	const { focus = {}, maxOutputSize = DEFAULT_OUTPUT_SIZE, quality = DEFAULT_QUALITY } = options
	const { focusX = 0.5, focusY = 0.5, scale = 1 } = focus

	// Clamp parameters to valid ranges
	const clampedScale = Math.max(1, Math.min(scale, MAX_SCALE))
	const clampedFocusX = Math.max(0, Math.min(focusX, 1))
	const clampedFocusY = Math.max(0, Math.min(focusY, 1))

	// Read original image using Jimp
	const image = await Jimp.read(filePath)
	const origWidth = image.width
	const origHeight = image.height

	if (!origWidth || !origHeight) {
		throw new Error("Unable to read image dimensions")
	}

	// Calculate crop region
	const cropRegion = calculateCropRegion(origWidth, origHeight, clampedFocusX, clampedFocusY, clampedScale)

	// Calculate output size (maintain aspect ratio, longest edge <= maxOutputSize)
	const aspectRatio = cropRegion.width / cropRegion.height
	let outputWidth: number, outputHeight: number
	if (aspectRatio >= 1) {
		outputWidth = Math.min(cropRegion.width, maxOutputSize)
		outputHeight = Math.round(outputWidth / aspectRatio)
	} else {
		outputHeight = Math.min(cropRegion.height, maxOutputSize)
		outputWidth = Math.round(outputHeight * aspectRatio)
	}

	// Execute crop and resize using Jimp
	// Note: Jimp modifies the image in place, so we clone first
	const processedImage = image
		.clone()
		.crop({ x: cropRegion.x, y: cropRegion.y, w: cropRegion.width, h: cropRegion.height })
		.resize({ w: outputWidth, h: outputHeight })

	// Get buffer as JPEG with specified quality
	const processedBuffer = await processedImage.getBuffer("image/jpeg", { quality })

	// Generate data URL
	const base64 = processedBuffer.toString("base64")
	const dataUrl = `data:image/jpeg;base64,${base64}`

	// Calculate normalized region (for returning to LLM)
	const region: ProcessedRegion = {
		x: cropRegion.x / origWidth,
		y: cropRegion.y / origHeight,
		width: cropRegion.width / origWidth,
		height: cropRegion.height / origHeight,
	}

	const sizeInKB = Math.round(processedBuffer.length / 1024)
	const sizeInMB = processedBuffer.length / (1024 * 1024)

	return {
		dataUrl,
		buffer: processedBuffer,
		sizeInKB,
		sizeInMB,
		notice: generateProcessingNotice(clampedScale, region, origWidth, origHeight),
		mediaType: "image",
		mimeType: "image/jpeg",
		originalSize: { width: origWidth, height: origHeight },
		processedSize: { width: outputWidth, height: outputHeight },
		region,
	}
}

/**
 * Reads a media file and returns both the data URL and buffer
 * For videos, returns the raw file without processing
 */
export async function readMediaAsDataUrlWithBuffer(filePath: string): Promise<{
	dataUrl: string
	buffer: Buffer
	mediaType: MediaType
	mimeType: string
}> {
	const fileBuffer = await fs.readFile(filePath)
	const base64 = fileBuffer.toString("base64")
	const ext = path.extname(filePath).toLowerCase()

	const isVideo = isSupportedVideoFormat(ext)
	const mediaType: MediaType = isVideo ? "video" : "image"
	const mimeType = isVideo ? VIDEO_MIME_TYPES[ext] || "video/mp4" : IMAGE_MIME_TYPES[ext] || "image/png"
	const dataUrl = `data:${mimeType};base64,${base64}`

	return { dataUrl, buffer: fileBuffer, mediaType, mimeType }
}

/**
 * Checks if a file extension is a supported image format
 */
export function isSupportedImageFormat(extension: string): boolean {
	return SUPPORTED_IMAGE_FORMATS.includes(extension.toLowerCase() as (typeof SUPPORTED_IMAGE_FORMATS)[number])
}

/**
 * Checks if a file extension is a supported video format
 */
export function isSupportedVideoFormat(extension: string): boolean {
	return SUPPORTED_VIDEO_FORMATS.includes(extension.toLowerCase() as (typeof SUPPORTED_VIDEO_FORMATS)[number])
}

/**
 * Checks if a file extension is a supported media format (image or video)
 */
export function isSupportedMediaFormat(extension: string): boolean {
	return isSupportedImageFormat(extension) || isSupportedVideoFormat(extension)
}

/**
 * Gets the media type from file extension
 */
export function getMediaType(extension: string): MediaType | null {
	if (isSupportedImageFormat(extension)) return "image"
	if (isSupportedVideoFormat(extension)) return "video"
	return null
}

/**
 * Get supported formats description string
 */
export function getSupportedFormatsDescription(): string {
	const imageFormats = SUPPORTED_IMAGE_FORMATS.map((f) => f.toUpperCase().slice(1)).join(", ")
	const videoFormats = SUPPORTED_VIDEO_FORMATS.map((f) => f.toUpperCase().slice(1)).join(", ")
	return `Images: ${imageFormats}. Videos: ${videoFormats}`
}

/**
 * Generate size limit exceeded message with suggestions
 */
export function generateSizeLimitMessage(
	filePath: string,
	actualSizeMB: number,
	maxSizeMB: number,
	mediaType: MediaType,
): string {
	const sizeFormatted = prettyBytes(actualSizeMB * 1024 * 1024)
	const maxFormatted = `${maxSizeMB}MB`

	if (mediaType === "video") {
		return (
			`Video file "${path.basename(filePath)}" is too large (${sizeFormatted}, max: ${maxFormatted}). ` +
			`Suggestions:\n` +
			`1. Use ffmpeg to compress: \`ffmpeg -i input.mp4 -vcodec libx264 -crf 28 output.mp4\`\n` +
			`2. Trim video duration: \`ffmpeg -i input.mp4 -ss 00:00:00 -t 00:00:30 output.mp4\`\n` +
			`3. Reduce resolution: \`ffmpeg -i input.mp4 -vf "scale=640:-1" output.mp4\`\n` +
			`4. For repeated viewing, consider using build_tool to create a video analysis tool.`
		)
	} else {
		return (
			`Image file "${path.basename(filePath)}" is too large (${sizeFormatted}, max: ${maxFormatted}). ` +
			`Suggestions:\n` +
			`1. Use image compression tools to reduce file size.\n` +
			`2. For detailed analysis, consider using build_tool to create a tool that provides:\n` +
			`   - Thumbnail overview\n` +
			`   - Region-based detail viewing\n` +
			`   - Progressive loading`
		)
	}
}

/**
 * Validates if a media file can be processed based on size limits and model support
 * @param supportsVideo - Optional, defaults to false for backward compatibility
 */
export async function validateMediaForProcessing(
	fullPath: string,
	supportsImages: boolean,
	maxMediaFileSize: number,
	maxTotalMediaSize: number,
	currentTotalMemoryUsed: number,
	supportsVideo: boolean = false,
): Promise<MediaValidationResult> {
	const ext = path.extname(fullPath).toLowerCase()
	const mediaType = getMediaType(ext)

	if (!mediaType) {
		return {
			isValid: false,
			reason: "unsupported_format",
			notice: `Unsupported media format: ${ext}. ${getSupportedFormatsDescription()}`,
		}
	}

	// Check if model supports the media type
	if (mediaType === "image" && !supportsImages) {
		return {
			isValid: false,
			reason: "unsupported_model",
			notice: "Image file detected but current model does not support images. Skipping image processing.",
			mediaType,
		}
	}

	if (mediaType === "video" && !supportsVideo) {
		return {
			isValid: false,
			reason: "video_unsupported",
			notice:
				"Video file detected but current model/provider does not support video. " +
				"Please use a provider that supports video (e.g., Moonshot/Kimi with kimi-k2.5 model).",
			mediaType,
		}
	}

	const mediaStats = await fs.stat(fullPath)
	const mediaSizeInMB = mediaStats.size / (1024 * 1024)

	// Check individual file size limit
	if (mediaStats.size > maxMediaFileSize * 1024 * 1024) {
		return {
			isValid: false,
			reason: "size_limit",
			notice: generateSizeLimitMessage(fullPath, mediaSizeInMB, maxMediaFileSize, mediaType),
			sizeInMB: mediaSizeInMB,
			mediaType,
		}
	}

	// Check total memory limit
	if (currentTotalMemoryUsed + mediaSizeInMB > maxTotalMediaSize) {
		const currentMemoryFormatted = prettyBytes(currentTotalMemoryUsed * 1024 * 1024)
		const fileMemoryFormatted = prettyBytes(mediaStats.size)
		return {
			isValid: false,
			reason: "memory_limit",
			notice:
				`${mediaType === "video" ? "Video" : "Image"} skipped to avoid size limit (${maxTotalMediaSize}MB). ` +
				`Current: ${currentMemoryFormatted} + this file: ${fileMemoryFormatted}. Try fewer or smaller files.`,
			sizeInMB: mediaSizeInMB,
			mediaType,
		}
	}

	return {
		isValid: true,
		sizeInMB: mediaSizeInMB,
		mediaType,
	}
}

/**
 * Processes a media file and returns the result
 * For images, uses focus-aware processing with automatic compression
 * For videos, returns raw file data
 */
export async function processMediaFile(
	fullPath: string,
	options: MediaProcessingOptions = {},
): Promise<MediaProcessingResult> {
	const ext = path.extname(fullPath).toLowerCase()
	const isVideo = isSupportedVideoFormat(ext)

	if (isVideo) {
		// Videos are returned as-is (no focus/scale support for videos)
		const mediaStats = await fs.stat(fullPath)
		const { dataUrl, buffer, mediaType, mimeType } = await readMediaAsDataUrlWithBuffer(fullPath)
		const mediaSizeInKB = Math.round(mediaStats.size / 1024)
		const mediaSizeInMB = mediaStats.size / (1024 * 1024)

		return {
			dataUrl,
			buffer,
			sizeInKB: mediaSizeInKB,
			sizeInMB: mediaSizeInMB,
			notice: `Video loaded successfully (${prettyBytes(mediaStats.size)})`,
			mediaType,
			mimeType,
		}
	}

	// For images, use focus-aware processing
	return processImageWithFocus(fullPath, options)
}

/**
 * Memory tracker for media processing
 */
export class MediaMemoryTracker {
	private totalMemoryUsed: number = 0

	/**
	 * Gets the current total memory used in MB
	 */
	getTotalMemoryUsed(): number {
		return this.totalMemoryUsed
	}

	/**
	 * Adds to the total memory used
	 */
	addMemoryUsage(sizeInMB: number): void {
		this.totalMemoryUsed += sizeInMB
	}

	/**
	 * Resets the memory tracker
	 */
	reset(): void {
		this.totalMemoryUsed = 0
	}
}

// Re-export with legacy names for backward compatibility
export {
	DEFAULT_MAX_MEDIA_FILE_SIZE_MB as DEFAULT_MAX_IMAGE_FILE_SIZE_MB,
	DEFAULT_MAX_TOTAL_MEDIA_SIZE_MB as DEFAULT_MAX_TOTAL_IMAGE_SIZE_MB,
	MediaMemoryTracker as ImageMemoryTracker,
}

// Legacy function re-exports
export const validateImageForProcessing = validateMediaForProcessing
export const processImageFile = processMediaFile
export const readImageAsDataUrlWithBuffer = readMediaAsDataUrlWithBuffer
