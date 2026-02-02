import type OpenAI from "openai"

const BUILD_TOOL_DESCRIPTION = `Build a reusable CLI tool for repetitive tasks. Handles all implementation decisions automatically.

**When to Use**:
- You need to perform a repetitive operation multiple times (e.g., screenshots, image processing, data extraction)
- The task is well-defined with clear inputs and outputs
- Manual execution would add cognitive overhead to your main task

**What You Provide** (requirement only):
- Describe what capability you need
- Optionally hint at expected inputs/outputs

**What Gets Handled Automatically** (you don't need to think about):
- Technology choice (bash/python/node/...)
- Implementation approach (cli/script)
- Cache location (global/project)
- Parameter design
- Testing strategy

**Returns**:
- Tool path and usage instructions
- Ready-to-use CLI command with --help support

**Example**:
{
  "requirement": "Capture screenshots of a specific window with optional region cropping",
  "inputHint": "window name, optional crop region (x,y,w,h)",
  "outputHint": "image file path"
}`

const REQUIREMENT_PARAMETER_DESCRIPTION = `Clear description of what capability you need. Focus on WHAT, not HOW.

Examples:
- "Capture screenshots of a specific window with optional region cropping"
- "Extract and resize images from a large image file"
- "Convert JSON data to CSV format with custom field mapping"`

const INPUT_HINT_PARAMETER_DESCRIPTION = `Optional: Hint about expected inputs. Helps design the interface.

Examples:
- "window name, optional crop region (x,y,w,h)"
- "source image path, list of regions to extract"
- "JSON file path, field mapping configuration"`

const OUTPUT_HINT_PARAMETER_DESCRIPTION = `Optional: Hint about expected outputs. Helps design the interface.

Examples:
- "image file path"
- "directory containing extracted images"
- "CSV file path"`

export default {
	type: "function",
	function: {
		name: "build_tool",
		description: BUILD_TOOL_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				requirement: {
					type: "string",
					description: REQUIREMENT_PARAMETER_DESCRIPTION,
				},
				inputHint: {
					type: ["string", "null"],
					description: INPUT_HINT_PARAMETER_DESCRIPTION,
				},
				outputHint: {
					type: ["string", "null"],
					description: OUTPUT_HINT_PARAMETER_DESCRIPTION,
				},
			},
			required: ["requirement"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
