import type OpenAI from "openai"

const EXECUTE_COMMAND_DESCRIPTION = `Execute a CLI command on the system. Use for system operations or running commands to accomplish tasks.

**Shell Compatibility:**
- PowerShell: Use \`;\` to chain commands. Use PowerShell-native commands: \`Select-String\` (grep), \`Get-Content\` (cat), \`Remove-Item\` (rm), \`Copy-Item\` (cp), \`Move-Item\` (mv), \`-replace\` (sed). NEVER use Unix commands (sed/grep/awk/rm).
- cmd.exe: Use \`&&\` to chain commands. Use built-in commands: \`type\` (cat), \`del\` (rm), \`copy\` (cp), \`move\` (mv), \`findstr\` (grep). NEVER use Unix commands.
- bash/zsh: Use \`&&\` to chain commands. All standard Unix commands available.

**Optimized Commands (bash/zsh):**
The following commands have optimized output formatting and respect .rooignore rules:
- \`grep\`: Search with \`-i\`, \`-r\`, \`-n\`, \`-C\`, \`-A\`, \`-B\`, \`-w\`, \`-F\`, \`--include\`, \`--exclude\`
- \`cat\`: Read files with \`-n\` for line numbers
- \`head\`/\`tail\`: View file portions with \`-n\`, \`-c\`
- \`find\`: Search files with \`-name\`, \`-iname\`, \`-type\`, \`-maxdepth\`
- \`ls\`: List directories with \`-l\`, \`-a\`, \`-A\`, \`-R\`, \`-h\`
- \`wc\`: Count lines/words/chars with \`-l\`, \`-w\`, \`-c\`

**Best Practices:**
- Prefer relative paths for terminal consistency (e.g., \`./src/\` instead of absolute paths)
- If no output is returned, assume the command succeeded
- Prefer executing complex commands directly over creating scripts
- Use pipe combinations like \`grep pattern | head -20\` for filtered results

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
