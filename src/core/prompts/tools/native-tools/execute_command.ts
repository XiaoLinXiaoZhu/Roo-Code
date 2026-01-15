import type OpenAI from "openai"

const EXECUTE_COMMAND_DESCRIPTION = `Execute a CLI command on the system. Use for system operations or running commands to accomplish tasks.

**Shell Compatibility:**
- PowerShell: Use \`;\` to chain commands. Use PowerShell-native commands: \`Select-String\` (grep), \`Get-Content\` (cat), \`Remove-Item\` (rm), \`Copy-Item\` (cp), \`Move-Item\` (mv), \`-replace\` (sed). NEVER use Unix commands (sed/grep/awk/rm).
- cmd.exe: Use \`&&\` to chain commands. Use built-in commands: \`type\` (cat), \`del\` (rm), \`copy\` (cp), \`move\` (mv), \`findstr\` (grep). NEVER use Unix commands.
- bash/zsh: Use \`&&\` to chain commands. All standard Unix commands available.

**Best Practices:**
- Prefer relative paths for terminal consistency (e.g., \`./src/\` instead of absolute paths)
- If no output is returned, assume the command succeeded
- Prefer executing complex commands directly over creating scripts

**Parameters:**
- command: (required) The CLI command to execute, tailored to the user's shell
- cwd: (optional) Working directory for the command`

const COMMAND_PARAMETER_DESCRIPTION = `Shell command to execute`

const CWD_PARAMETER_DESCRIPTION = `Optional working directory for the command, relative or absolute`

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
			},
			required: ["command", "cwd"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
