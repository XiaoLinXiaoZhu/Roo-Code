import type OpenAI from "openai"

const IS_WINDOWS = process.platform === "win32"
const DEFAULT_SHELL = IS_WINDOWS ? "cmd" : "sh"
const OS_NAME = IS_WINDOWS ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux"

const SHELL_SECTION = IS_WINDOWS
	? `- Shell: **cmd** (default), pwsh
  Simple CLI: \`dir /b src\`, \`type package.json | findstr version\`, \`git status\`
  NOTE: Use \`type\` (not \`cat\`), \`findstr\` (not \`grep\`), \`dir\` (not \`ls\`)`
	: `- Shell: **sh** (default), bash, pwsh
  Simple CLI: \`ls -la src\`, \`grep "version" package.json\`, \`git status\``

const JS_SECTION = `- JS/TS: **bun** (recommended), node, deno
  Complex logic, JSON parsing, file transforms, data processing.
  For code analysis, use AST libraries (e.g. ts-morph) — see CODE INTELLIGENCE section.`

const PYTHON_SECTION = `- Python: python, python3, uv
  Data processing, scripting, ML workflows.
  For code analysis, use ast/jedi — see CODE INTELLIGENCE section.`

const EXEC_DESCRIPTION = `Execute a script on ${OS_NAME} (default shell: ${DEFAULT_SHELL}). Content is written to a temp file and run with the specified runtime. Returns stdout, stderr, and exit code.

**Available runtimes:**
${SHELL_SECTION}
${JS_SECTION}
${PYTHON_SECTION}

**When to Use**: Simple shell commands.
- exec({ script: "git status", runtime: null, cwd: null, timeout: null })

**When to Use**: Complex logic or code analysis with a language runtime.
- exec({ script: "import { Project } from 'ts-morph'; ...", runtime: "bun", cwd: null, timeout: null })

**When to Use**: Long-running processes.
- exec({ script: "npm run dev", runtime: null, cwd: ".", timeout: 10 })

**Best practices:**
- Use default shell (${DEFAULT_SHELL}) for simple commands (git, ${IS_WINDOWS ? "dir, type, findstr" : "ls, cat, grep"}, etc.)
- Use bun/node + AST libraries for code intelligence (find definitions, references, rename, type analysis)
- Process output inside the script — filter and summarize before printing
- For batch analysis, write one comprehensive script instead of multiple tool calls
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
					description: `Runtime to use (default: ${DEFAULT_SHELL}). Options: ${IS_WINDOWS ? "cmd, pwsh" : "sh, bash, pwsh"}, bun, node, deno, python, python3, uv.`,
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
