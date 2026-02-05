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
	calculateCropRegion,
	generateProcessingNotice,
	DEFAULT_OUTPUT_SIZE,
	MAX_SCALE,
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

	describe("calculateCropRegion", () => {
		it("should return full image when scale is 1", () => {
			const region = calculateCropRegion(1000, 800, 0.5, 0.5, 1)
			expect(region.x).toBe(0)
			expect(region.y).toBe(0)
			expect(region.width).toBe(1000)
			expect(region.height).toBe(800)
		})

		it("should crop to center with scale 2", () => {
			const region = calculateCropRegion(1000, 800, 0.5, 0.5, 2)
			expect(region.width).toBe(500)
			expect(region.height).toBe(400)
			expect(region.x).toBe(250) // centered
			expect(region.y).toBe(200) // centered
		})

		it("should crop to top-left corner", () => {
			const region = calculateCropRegion(1000, 800, 0, 0, 2)
			expect(region.x).toBe(0)
			expect(region.y).toBe(0)
			expect(region.width).toBe(500)
			expect(region.height).toBe(400)
		})

		it("should crop to bottom-right corner", () => {
			const region = calculateCropRegion(1000, 800, 1, 1, 2)
			expect(region.x).toBe(500)
			expect(region.y).toBe(400)
			expect(region.width).toBe(500)
			expect(region.height).toBe(400)
		})

		it("should constrain region within image bounds", () => {
			// Focus at 0.9, 0.9 with scale 2 would try to go outside bounds
			const region = calculateCropRegion(1000, 800, 0.9, 0.9, 2)
			// Region should be constrained to not exceed image bounds
			expect(region.x + region.width).toBeLessThanOrEqual(1000)
			expect(region.y + region.height).toBeLessThanOrEqual(800)
			expect(region.x).toBeGreaterThanOrEqual(0)
			expect(region.y).toBeGreaterThanOrEqual(0)
		})

		it("should handle high scale values", () => {
			const region = calculateCropRegion(1000, 800, 0.5, 0.5, 8)
			expect(region.width).toBe(125) // 1000 / 8
			expect(region.height).toBe(100) // 800 / 8
		})

		it("should use default focus (center) when not specified", () => {
			const region = calculateCropRegion(1000, 800, undefined, undefined, 2)
			expect(region.x).toBe(250)
			expect(region.y).toBe(200)
		})
	})

	describe("generateProcessingNotice", () => {
		it("should generate overview notice for scale 1", () => {
			const notice = generateProcessingNotice(1, { x: 0, y: 0, width: 1, height: 1 }, 2000, 1500)
			expect(notice).toContain("Overview")
			expect(notice).toContain("2000x1500")
			expect(notice).toContain("focusX/focusY/scale")
		})

		it("should generate detail notice for scale > 1", () => {
			const notice = generateProcessingNotice(4, { x: 0.25, y: 0.25, width: 0.25, height: 0.25 }, 2000, 1500)
			expect(notice).toContain("Zoomed 4x")
			expect(notice).toContain("2000x1500")
			expect(notice).toContain("region")
		})

		it("should show approximate area percentage", () => {
			// scale 4 means 1/4 width and 1/4 height = 1/16 area = 6.25%
			const notice = generateProcessingNotice(4, { x: 0, y: 0, width: 0.25, height: 0.25 }, 1000, 1000)
			expect(notice).toMatch(/6\.\d%/) // 6.2% or 6.3% depending on rounding
		})
	})

	describe("constants", () => {
		it("should have correct default output size", () => {
			expect(DEFAULT_OUTPUT_SIZE).toBe(1024)
		})

		it("should have correct max scale", () => {
			expect(MAX_SCALE).toBe(8)
		})
	})
})
