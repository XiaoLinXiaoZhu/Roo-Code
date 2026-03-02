import type OpenAI from "openai"

/**
 * read_media tool definition.
 *
 * Supports dynamic multi-pass reading with focus and scale parameters,
 * allowing the model to examine specific regions in detail through multiple calls.
 */
const readMedia: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "read_media",
		description:
			"Read a media file for visual analysis. All images are automatically compressed to optimize token usage. " +
			"Supports: PNG, JPG, JPEG, GIF, WEBP, SVG, BMP, ICO, AVIF (images); MP4, WebM, MOV, AVI, MKV, M4V, 3GP, OGV (videos).\n\n" +
			"**When to Use**: Getting an overview of an image or video.\n" +
			'- read_media({ path: "diagram.png", focus_x: 0.5, focus_y: 0.5, scale: 1 })\n\n' +
			"**When to Use**: Zooming into a specific region for detail.\n" +
			'- read_media({ path: "diagram.png", focus_x: 0.3, focus_y: 0.7, scale: 4 })',
		strict: true,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "Path to the media file, relative to the workspace.",
				},
				focus_x: {
					type: "number",
					description: "Horizontal focus point (0.0-1.0, left to right). Default: 0.5 (center).",
				},
				focus_y: {
					type: "number",
					description: "Vertical focus point (0.0-1.0, top to bottom). Default: 0.5 (center).",
				},
				scale: {
					type: "number",
					description:
						"Zoom level (1-8). 1 = full overview, 2 = 2x zoom (50% of image), 4 = 4x zoom (25%), 8 = 8x zoom (12.5%). Default: 1.",
				},
			},
			required: ["path", "focus_x", "focus_y", "scale"],
			additionalProperties: false,
		},
	},
}

export default readMedia
