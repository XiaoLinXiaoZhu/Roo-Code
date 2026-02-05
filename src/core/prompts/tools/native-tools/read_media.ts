import type OpenAI from "openai"

/**
 * Tool definition for read_media - reads media files (images and videos) for multimodal analysis.
 *
 * This tool supports dynamic multi-pass reading with focus and scale parameters,
 * allowing the model to examine specific regions in detail through multiple calls.
 *
 * Workflow:
 * 1. First call without focus/scale to get an overview (compressed to 1024px)
 * 2. Call again with focusX/focusY/scale to zoom into specific regions
 */
const readMedia: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "read_media",
		description:
			"Read a media file for visual analysis. " +
			"First call without focus parameters to get an overview. " +
			"Then call again with focusX/focusY/scale to examine specific regions in detail. " +
			"All images are automatically compressed to optimize token usage - use focus+scale to see details. " +
			"Supports: PNG, JPG, JPEG, GIF, WEBP, SVG, BMP, ICO, AVIF (images); MP4, WebM, MOV, AVI, MKV, M4V, 3GP, OGV (videos). " +
			"Example workflow: " +
			"1. read_media({ path: 'diagram.png' }) → get overview " +
			"2. read_media({ path: 'diagram.png', focusX: 0.3, focusY: 0.7, scale: 4 }) → zoom into bottom-left region",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "Path to the media file, relative to the workspace",
				},
				focusX: {
					type: "number",
					description:
						"Horizontal focus point (0.0-1.0, left to right). Default: 0.5 (center). " +
						"Use with scale to zoom into a specific horizontal position.",
				},
				focusY: {
					type: "number",
					description:
						"Vertical focus point (0.0-1.0, top to bottom). Default: 0.5 (center). " +
						"Use with scale to zoom into a specific vertical position.",
				},
				scale: {
					type: "number",
					description:
						"Zoom level (1-8). 1 = full image overview, 2 = 2x zoom (shows 50% of image), " +
						"4 = 4x zoom (shows 25% of image), 8 = 8x zoom (shows 12.5% of image). Default: 1. " +
						"Higher scale reveals more detail in the focused region.",
				},
			},
			required: ["path"],
			additionalProperties: false,
		},
	},
}

export default readMedia
