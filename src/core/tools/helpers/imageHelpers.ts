/**
 * @deprecated This file is kept for backward compatibility.
 * Please import from './mediaHelpers' instead.
 */
import {
	DEFAULT_MAX_MEDIA_FILE_SIZE_MB,
	DEFAULT_MAX_TOTAL_MEDIA_SIZE_MB,
	SUPPORTED_IMAGE_FORMATS,
	IMAGE_MIME_TYPES,
	isSupportedImageFormat,
	validateMediaForProcessing,
	processMediaFile,
	readMediaAsDataUrlWithBuffer,
	MediaMemoryTracker,
	type MediaProcessingResult,
} from "./mediaHelpers"

// Re-export constants
export {
	DEFAULT_MAX_MEDIA_FILE_SIZE_MB as DEFAULT_MAX_IMAGE_FILE_SIZE_MB,
	DEFAULT_MAX_TOTAL_MEDIA_SIZE_MB as DEFAULT_MAX_TOTAL_IMAGE_SIZE_MB,
	SUPPORTED_IMAGE_FORMATS,
	IMAGE_MIME_TYPES,
	isSupportedImageFormat,
	MediaMemoryTracker as ImageMemoryTracker,
}

// Re-export validateImageForProcessing with compatible signature
export const validateImageForProcessing = validateMediaForProcessing

/**
 * Legacy wrapper for readImageAsDataUrlWithBuffer
 * Returns only { dataUrl, buffer } for backward compatibility
 */
export async function readImageAsDataUrlWithBuffer(filePath: string): Promise<{ dataUrl: string; buffer: Buffer }> {
	const result = await readMediaAsDataUrlWithBuffer(filePath)
	return {
		dataUrl: result.dataUrl,
		buffer: result.buffer,
	}
}

/**
 * Legacy result type for backward compatibility
 */
export interface ImageProcessingResult {
	dataUrl: string
	buffer: Buffer
	sizeInKB: number
	sizeInMB: number
	notice: string
}

/**
 * Legacy wrapper for processImageFile
 * Returns only image-compatible fields for backward compatibility
 */
export async function processImageFile(fullPath: string): Promise<ImageProcessingResult> {
	const result = await processMediaFile(fullPath)
	return {
		dataUrl: result.dataUrl,
		buffer: result.buffer,
		sizeInKB: result.sizeInKB,
		sizeInMB: result.sizeInMB,
		notice: result.notice,
	}
}
