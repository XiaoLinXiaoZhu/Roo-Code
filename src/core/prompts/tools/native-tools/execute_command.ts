import type OpenAI from "openai"

const EXECUTE_COMMAND_DESCRIPTION = `Run shell commands for development, system operations, or invoking CLI tools. For code navigation (finding definitions or references), prefer find_definition/find_usages over grep.

**When to Use**: Running dev/build/test commands.
- exec({ command: "npm test -- --grep 'auth'", cwd: "./backend", timeout: null })

**When to Use**: Git operations.
- exec({ command: "git diff HEAD~3 --stat", cwd: ".", timeout: null })

**When to Use**: System inspection or file operations.
- exec({ command: "ls -la src/ && cat package.json", cwd: ".", timeout: null })

**When to Use**: Long-running processes (dev servers, watchers).
- exec({ command: "npm run dev", cwd: ".", timeout: 10 })`

const COMMAND_PARAMETER_DESCRIPTION = `The CLI command to execute. Shell compatibility: PowerShell uses \`;\` to chain (use Select-String, Get-Content, Remove-Item); cmd.exe uses \`&&\` (use type, del, findstr); bash/zsh uses \`&&\` with all Unix commands. Use relative paths (e.g., ./src/) and execute complex commands directly without creating scripts.`

const CWD_PARAMETER_DESCRIPTION = `Working directory for the command (relative or absolute). Default: workspace root.`

const TIMEOUT_PARAMETER_DESCRIPTION = `Timeout in seconds. When exceeded, the command continues in the background and output collected so far is returned. Use for long-running processes like dev servers or file watchers.`

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
