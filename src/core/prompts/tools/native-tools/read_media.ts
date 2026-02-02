import type OpenAI from "openai"

/**
 * Tool definition for read_media - reads media files (images, audio, video) for multimodal analysis.
 *
 * This tool is conditionally available based on model's multimodal capabilities (supportsImages).
 * It provides a dedicated interface for reading media files, separate from the CLI-based file reading.
 */
const readMedia: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "read_media",
		description:
			"Read media files (images) for visual analysis. Supports PNG, JPG, JPEG, GIF, BMP, SVG, WEBP, ICO, AVIF formats. " +
			"Use this tool when you need to analyze image content, understand visual elements, or extract information from images. " +
			"Returns the image data for multimodal processing. " +
			"Example: { files: [{ path: 'assets/logo.png' }, { path: 'screenshots/error.jpg' }] }",
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
