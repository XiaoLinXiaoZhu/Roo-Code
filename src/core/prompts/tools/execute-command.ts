import { ToolArgs } from "./types"

export function getExecuteCommandDescription(args: ToolArgs): string | undefined {
	return `## execute_command
Description: Execute a CLI command on the system. Use for system operations or running commands to accomplish tasks.

**Shell Compatibility:**
- PowerShell: Use \`;\` to chain commands. Use PowerShell-native commands: \`Select-String\` (grep), \`Get-Content\` (cat), \`Remove-Item\` (rm), \`Copy-Item\` (cp), \`Move-Item\` (mv), \`-replace\` (sed). NEVER use Unix commands (sed/grep/awk/rm).
- cmd.exe: Use \`&&\` to chain commands. Use built-in commands: \`type\` (cat), \`del\` (rm), \`copy\` (cp), \`move\` (mv), \`findstr\` (grep). NEVER use Unix commands.
- bash/zsh: Use \`&&\` to chain commands. All standard Unix commands available.

**Best Practices:**
- Prefer relative paths for terminal consistency (e.g., \`./src/\` instead of absolute paths)
- If no output is returned, assume the command succeeded
- Prefer executing complex commands directly over creating scripts

Parameters:
- command: (required) The CLI command to execute, tailored to the user's shell
- cwd: (optional) The working directory to execute the command in (default: ${args.cwd})
Usage:
<execute_command>
<command>Your command here</command>
<cwd>Working directory path (optional)</cwd>
</execute_command>

Example: Requesting to execute npm run dev
<execute_command>
<command>npm run dev</command>
</execute_command>

Example: Requesting to execute ls in a specific directory if directed
<execute_command>
<command>ls -la</command>
<cwd>/home/user/projects</cwd>
</execute_command>`
}
