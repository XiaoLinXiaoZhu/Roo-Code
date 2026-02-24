import type OpenAI from "openai"

const GENERATE_IMAGE_DESCRIPTION = `Generate or edit images using AI models through OpenRouter API.

**When to Use**: Creating a new image from a text prompt.
- generate_image({ prompt: "A beautiful sunset over mountains with vibrant orange and purple colors", path: "images/sunset.png", image: null })

**When to Use**: Editing or transforming an existing image.
- generate_image({ prompt: "Transform into watercolor painting style", path: "images/watercolor.png", image: "images/original.jpg" })

**When to Use**: Upscaling or enhancing an image.
- generate_image({ prompt: "Upscale to higher resolution, enhance details and sharpness", path: "images/enhanced.png", image: "images/low-res.jpg" })`

export default {
	type: "function",
	function: {
		name: "generate_image",
		description: GENERATE_IMAGE_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				prompt: {
					type: "string",
					description: "Text description of the image to generate or the edits to apply.",
				},
				path: {
					type: "string",
					description:
						"File path (relative to workspace) where the resulting image should be saved. Extension is auto-added if missing.",
				},
				image: {
					type: ["string", "null"],
					description:
						"Optional path (relative to workspace) to an existing image to edit. Supports PNG, JPG, JPEG, GIF, WEBP.",
				},
			},
			required: ["prompt", "path", "image"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
