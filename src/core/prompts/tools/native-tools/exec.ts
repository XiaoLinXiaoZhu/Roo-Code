import type OpenAI from "openai"

const EXEC_DESCRIPTION = `Execute a script by writing it to a temp file and running with the specified runtime. Eliminates shell quoting/escaping issues entirely.

**Runtimes by category:**
- Shell: cmd (Windows default), sh (Unix default), bash, pwsh
- JS/TS: bun (recommended), node, deno
- Python: python, python3, uv

**When to Use**: Simple shell commands.
- exec({ script: "git status", runtime: null, cwd: null, timeout: null })

**When to Use**: Complex logic with a proper language runtime.
- exec({ script: "import { readdir } from 'node:fs/promises';\\nconst files = await readdir('./src', { recursive: true });\\nconsole.log(files.filter(f => f.endsWith('.ts')).length + ' TS files');", runtime: "bun", cwd: null, timeout: null })

**When to Use**: Long-running processes.
- exec({ script: "npm run dev", runtime: null, cwd: ".", timeout: 10 })

**Best practices:**
- Use default shell for simple commands (git, ls/dir, etc.)
- Use bun/node for complex logic (JSON parsing, file transforms, data processing)
- Process output inside the script — filter and summarize before printing
- timeout: process continues in background when exceeded`

export default {
	type: "function",
	function: {
		name: "exec",
		description: EXEC_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				script: {
					type: "string",
					description: "Script content. Single command or multi-line code with imports, loops, etc.",
				},
				runtime: {
					type: ["string", "null"],
					description:
						"Runtime to use. Default: platform shell (cmd on Windows, sh on Unix). Options: cmd, sh, bash, pwsh, bun, node, deno, python, python3, uv.",
				},
				cwd: {
					type: ["string", "null"],
					description: "Working directory (relative or absolute). Default: workspace root.",
				},
				timeout: {
					type: ["number", "null"],
					description: "Timeout in seconds (default: 120). Process continues in background if exceeded.",
				},
			},
			required: ["script", "runtime", "cwd", "timeout"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
