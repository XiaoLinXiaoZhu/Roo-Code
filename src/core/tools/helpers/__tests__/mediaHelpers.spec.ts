import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest"
import path from "path"
import {
	isSupportedImageFormat,
	isSupportedVideoFormat,
	isSupportedMediaFormat,
	getMediaType,
	getSupportedFormatsDescription,
	generateSizeLimitMessage,
	validateMediaForProcessing,
	processMediaFile,
	MediaMemoryTracker,
	SUPPORTED_IMAGE_FORMATS,
	SUPPORTED_VIDEO_FORMATS,
	IMAGE_MIME_TYPES,
	VIDEO_MIME_TYPES,
} from "../mediaHelpers"

// Mock fs/promises at the module level
const mockStat = vi.fn()
const mockReadFile = vi.fn()

vi.mock("fs/promises", () => ({
	stat: (...args: unknown[]) => mockStat(...args),
	readFile: (...args: unknown[]) => mockReadFile(...args),
}))

describe("mediaHelpers", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		// Clean up environment variables
		delete process.env.ROO_VIDEO_ENABLED
		delete process.env.ROO_VIDEO_METHOD
	})

	describe("isSupportedImageFormat", () => {
		it("should return true for supported image formats", () => {
			expect(isSupportedImageFormat(".png")).toBe(true)
			expect(isSupportedImageFormat(".jpg")).toBe(true)
			expect(isSupportedImageFormat(".jpeg")).toBe(true)
			expect(isSupportedImageFormat(".gif")).toBe(true)
			expect(isSupportedImageFormat(".webp")).toBe(true)
			expect(isSupportedImageFormat(".svg")).toBe(true)
			expect(isSupportedImageFormat(".bmp")).toBe(true)
			expect(isSupportedImageFormat(".ico")).toBe(true)
			expect(isSupportedImageFormat(".avif")).toBe(true)
		})

		it("should return false for video formats", () => {
			expect(isSupportedImageFormat(".mp4")).toBe(false)
			expect(isSupportedImageFormat(".webm")).toBe(false)
			expect(isSupportedImageFormat(".mov")).toBe(false)
		})

		it("should be case-insensitive", () => {
			expect(isSupportedImageFormat(".PNG")).toBe(true)
			expect(isSupportedImageFormat(".JPG")).toBe(true)
		})
	})

	describe("isSupportedVideoFormat", () => {
		it("should return true for supported video formats", () => {
			expect(isSupportedVideoFormat(".mp4")).toBe(true)
			expect(isSupportedVideoFormat(".webm")).toBe(true)
			expect(isSupportedVideoFormat(".mov")).toBe(true)
			expect(isSupportedVideoFormat(".avi")).toBe(true)
			expect(isSupportedVideoFormat(".mkv")).toBe(true)
			expect(isSupportedVideoFormat(".m4v")).toBe(true)
			expect(isSupportedVideoFormat(".3gp")).toBe(true)
			expect(isSupportedVideoFormat(".ogv")).toBe(true)
		})

		it("should return false for image formats", () => {
			expect(isSupportedVideoFormat(".png")).toBe(false)
			expect(isSupportedVideoFormat(".jpg")).toBe(false)
		})

		it("should be case-insensitive", () => {
			expect(isSupportedVideoFormat(".MP4")).toBe(true)
			expect(isSupportedVideoFormat(".WEBM")).toBe(true)
		})
	})

	describe("isSupportedMediaFormat", () => {
		it("should return true for both image and video formats", () => {
			expect(isSupportedMediaFormat(".png")).toBe(true)
			expect(isSupportedMediaFormat(".mp4")).toBe(true)
		})

		it("should return false for unsupported formats", () => {
			expect(isSupportedMediaFormat(".txt")).toBe(false)
			expect(isSupportedMediaFormat(".pdf")).toBe(false)
		})
	})

	describe("getMediaType", () => {
		it("should return 'image' for image formats", () => {
			expect(getMediaType(".png")).toBe("image")
			expect(getMediaType(".jpg")).toBe("image")
		})

		it("should return 'video' for video formats", () => {
			expect(getMediaType(".mp4")).toBe("video")
			expect(getMediaType(".webm")).toBe("video")
		})

		it("should return null for unsupported formats", () => {
			expect(getMediaType(".txt")).toBe(null)
			expect(getMediaType(".pdf")).toBe(null)
		})
	})

	describe("getSupportedFormatsDescription", () => {
		it("should include both image and video formats", () => {
			const description = getSupportedFormatsDescription()
			expect(description).toContain("Images:")
			expect(description).toContain("Videos:")
			expect(description).toContain("PNG")
			expect(description).toContain("MP4")
		})
	})

	describe("generateSizeLimitMessage", () => {
		it("should generate message for video with ffmpeg suggestions", () => {
			const message = generateSizeLimitMessage("/path/to/video.mp4", 10, 5, "video")
			expect(message).toContain("video.mp4")
			expect(message).toContain("too large")
			expect(message).toContain("ffmpeg")
			expect(message).toContain("build_tool")
		})

		it("should generate message for image with compression suggestions", () => {
			const message = generateSizeLimitMessage("/path/to/image.png", 10, 5, "image")
			expect(message).toContain("image.png")
			expect(message).toContain("too large")
			expect(message).toContain("build_tool")
			expect(message).toContain("Thumbnail")
		})
	})

	describe("validateMediaForProcessing", () => {
		it("should reject unsupported formats", async () => {
			mockStat.mockResolvedValue({ size: 1024 })

			const result = await validateMediaForProcessing("/path/to/file.txt", true, 5, 20, 0, false)

			expect(result.isValid).toBe(false)
			expect(result.reason).toBe("unsupported_format")
		})

		it("should reject images when supportsImages is false", async () => {
			mockStat.mockResolvedValue({ size: 1024 })

			const result = await validateMediaForProcessing("/path/to/image.png", false, 5, 20, 0, false)

			expect(result.isValid).toBe(false)
			expect(result.reason).toBe("unsupported_model")
		})

		it("should reject videos when supportsVideo is false", async () => {
			mockStat.mockResolvedValue({ size: 1024 })

			const result = await validateMediaForProcessing("/path/to/video.mp4", true, 5, 20, 0, false)

			expect(result.isValid).toBe(false)
			expect(result.reason).toBe("video_unsupported")
		})

		it("should accept videos when supportsVideo is true", async () => {
			mockStat.mockResolvedValue({ size: 1024 })

			const result = await validateMediaForProcessing("/path/to/video.mp4", true, 5, 20, 0, true)

			expect(result.isValid).toBe(true)
			expect(result.mediaType).toBe("video")
		})

		it("should reject files exceeding size limit", async () => {
			mockStat.mockResolvedValue({ size: 10 * 1024 * 1024 }) // 10MB

			const result = await validateMediaForProcessing("/path/to/image.png", true, 5, 20, 0, false)

			expect(result.isValid).toBe(false)
			expect(result.reason).toBe("size_limit")
		})

		it("should reject files that would exceed memory limit", async () => {
			mockStat.mockResolvedValue({ size: 3 * 1024 * 1024 }) // 3MB

			const result = await validateMediaForProcessing("/path/to/image.png", true, 5, 5, 3, false) // 3MB already used, 5MB limit

			expect(result.isValid).toBe(false)
			expect(result.reason).toBe("memory_limit")
		})

		it("should accept valid images", async () => {
			mockStat.mockResolvedValue({ size: 1024 * 1024 }) // 1MB

			const result = await validateMediaForProcessing("/path/to/image.png", true, 5, 20, 0, false)

			expect(result.isValid).toBe(true)
			expect(result.mediaType).toBe("image")
		})
	})

	describe("MediaMemoryTracker", () => {
		it("should track memory usage", () => {
			const tracker = new MediaMemoryTracker()

			expect(tracker.getTotalMemoryUsed()).toBe(0)

			tracker.addMemoryUsage(5)
			expect(tracker.getTotalMemoryUsed()).toBe(5)

			tracker.addMemoryUsage(3)
			expect(tracker.getTotalMemoryUsed()).toBe(8)
		})

		it("should reset memory usage", () => {
			const tracker = new MediaMemoryTracker()

			tracker.addMemoryUsage(5)
			tracker.reset()

			expect(tracker.getTotalMemoryUsed()).toBe(0)
		})
	})

	describe("MIME types", () => {
		it("should have correct image MIME types", () => {
			expect(IMAGE_MIME_TYPES[".png"]).toBe("image/png")
			expect(IMAGE_MIME_TYPES[".jpg"]).toBe("image/jpeg")
			expect(IMAGE_MIME_TYPES[".jpeg"]).toBe("image/jpeg")
			expect(IMAGE_MIME_TYPES[".gif"]).toBe("image/gif")
			expect(IMAGE_MIME_TYPES[".webp"]).toBe("image/webp")
			expect(IMAGE_MIME_TYPES[".svg"]).toBe("image/svg+xml")
		})

		it("should have correct video MIME types", () => {
			expect(VIDEO_MIME_TYPES[".mp4"]).toBe("video/mp4")
			expect(VIDEO_MIME_TYPES[".webm"]).toBe("video/webm")
			expect(VIDEO_MIME_TYPES[".mov"]).toBe("video/quicktime")
			expect(VIDEO_MIME_TYPES[".avi"]).toBe("video/x-msvideo")
			expect(VIDEO_MIME_TYPES[".mkv"]).toBe("video/x-matroska")
		})
	})
})
