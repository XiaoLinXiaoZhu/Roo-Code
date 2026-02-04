import type OpenAI from "openai"

/**
 * Tool definition for read_media - reads media files (images and videos) for multimodal analysis.
 *
 * This tool is conditionally available based on model's multimodal capabilities (supportsImages).
 * It provides a dedicated interface for reading media files, separate from the CLI-based file reading.
 */
const readMedia: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "read_media",
		description:
			"Read media files (images and videos) for visual analysis. " +
			"Supports image formats: PNG, JPG, JPEG, GIF, BMP, SVG, WEBP, ICO, AVIF. " +
			"Supports video formats: MP4, WebM, MOV, AVI, MKV, M4V, 3GP, OGV. " +
			"Use this tool when you need to analyze image/video content, understand visual elements, or extract information from media files. " +
			"Note: Media files must be within the size limit (default 5MB per file). For large videos, suggest using ffmpeg to compress or trim first. " +
			"Returns the media data for multimodal processing. " +
			"Example: { files: [{ path: 'assets/logo.png' }, { path: 'demo/video.mp4' }] }",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				files: {
					type: "array",
					description: "List of media files to read for analysis",
					items: {
						type: "object",
						properties: {
							path: {
								type: "string",
								description: "Path to the media file, relative to the workspace",
							},
						},
						required: ["path"],
						additionalProperties: false,
					},
					minItems: 1,
				},
			},
			required: ["files"],
			additionalProperties: false,
		},
	},
}

export default readMedia
