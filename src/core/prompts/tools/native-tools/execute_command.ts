import type OpenAI from "openai"

const EXECUTE_COMMAND_DESCRIPTION = `Run shell commands for development, system operations, or invoking CLI tools. **For code navigation (finding definitions or references), use find_definition/find_usages instead of grep.**

**When to Use**:
- Development: \`npm test\`, \`npm run build\`, \`pip install\`
- Git operations: \`git status\`, \`git diff\`, \`git log\`
- System inspection: \`ls\`, \`cat\`, \`ps\`, \`env\`
- Network requests: \`curl\`, \`wget\`
- CLI tools (from build_tool): image processing, audio analysis, data conversion
- Any operation not covered by other specialized tools

**Example**:
{ "command": "npm test -- --grep 'auth'", "cwd": "./backend" }`

const COMMAND_PARAMETER_DESCRIPTION = `The CLI command to execute.

**Shell Compatibility** (critical):
- PowerShell: Use \`;\` to chain. Native commands: \`Select-String\`, \`Get-Content\`, \`Remove-Item\`. NEVER use Unix commands.
- cmd.exe: Use \`&&\` to chain. Native commands: \`type\`, \`del\`, \`findstr\`. NEVER use Unix commands.
- bash/zsh: Use \`&&\` to chain. All Unix commands available.

**Best Practices**:
- Use relative paths (e.g., \`./src/\` not absolute)
- Execute complex commands directly, don't create scripts
- Use pipes: \`grep pattern | head -20\``

const CWD_PARAMETER_DESCRIPTION = `Optional working directory for the command, relative or absolute`

const TIMEOUT_PARAMETER_DESCRIPTION = `Timeout in seconds. When exceeded, the command continues running in the background and output collected so far is returned. Use this for long-running processes like dev servers, file watchers, or any command that may not exit on its own`

export default {
	type: "function",
	function: {
		name: "execute_command",
		description: EXECUTE_COMMAND_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description: COMMAND_PARAMETER_DESCRIPTION,
				},
				cwd: {
					type: ["string", "null"],
					description: CWD_PARAMETER_DESCRIPTION,
				},
				timeout: {
					type: ["number", "null"],
					description: TIMEOUT_PARAMETER_DESCRIPTION,
				},
			},
			required: ["command", "cwd", "timeout"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
