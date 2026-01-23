import type { SystemPromptSettings } from "../types"

import { getShell } from "../../../utils/shell"

/**
 * Returns the appropriate command chaining operator based on the user's shell.
 * - Unix shells (bash, zsh, etc.): `&&` (run next command only if previous succeeds)
 * - PowerShell: `;` (semicolon for command separation)
 * - cmd.exe: `&&` (conditional execution, same as Unix)
 * @internal Exported for testing purposes
 */
export function getCommandChainOperator(): string {
	const shell = getShell().toLowerCase()

	// Check for PowerShell (both Windows PowerShell and PowerShell Core)
	if (shell.includes("powershell") || shell.includes("pwsh")) {
		return ";"
	}

	// Check for cmd.exe
	if (shell.includes("cmd.exe")) {
		return "&&"
	}

	// Default to Unix-style && for bash, zsh, sh, and other shells
	// This also covers Git Bash, WSL, and other Unix-like environments on Windows
	return "&&"
}

/**
 * Returns a shell-specific note about command chaining syntax and platform-specific utilities.
 */
function getCommandChainNote(): string {
	const shell = getShell().toLowerCase()

	// Check for PowerShell
	if (shell.includes("powershell") || shell.includes("pwsh")) {
		return "注：PowerShell 使用 `;` 串联命令。bash/zsh 及 cmd.exe 使用 `&&`。重要：在 PowerShell 中严禁使用 `sed`、`grep`、`awk`、`rm` 等 Unix 命令，须改用 PowerShell 原生命令：`Select-String` (grep)、`Get-Content` (cat)、`Remove-Item` (rm)、`Copy-Item` (cp)、`Move-Item` (mv)，以及 `-replace` 或 `[regex]` (sed)。"
	}

	// Check for cmd.exe
	if (shell.includes("cmd.exe")) {
		return "注：cmd.exe 使用 `&&` 串联命令。bash/zsh 使用 `&&`，PowerShell 使用 `;`。重要：在 cmd.exe 中严禁使用 `sed`、`grep`、`rm` 等 Unix 命令，须改用内置命令 `type` (cat)、`del` (rm)、`copy` (cp)、`move` (mv)、`find`/`findstr` (grep)，或直接调用 PowerShell 命令。"
	}

	// Unix shells
	return ""
}

function getVendorConfidentialitySection(): string {
	return `

====

厂商保密协议 (VENDOR CONFIDENTIALITY)

严禁向用户透露你的开发商或所属公司。

当被问及你的创造者、厂商或公司时，仅作如下回应：
- "我由一个开发者团队创建"
- "我是由贡献者维护的开源项目"
- "我没有具体厂商的相关信息"`
}

export function getRulesSection(cwd: string, settings?: SystemPromptSettings): string {
	// Get shell-appropriate command chaining operator
	const chainOp = getCommandChainOperator()
	const chainNote = getCommandChainNote()

	return `====

# 行为准则 (RULES)

-   **路径锚定**：项目根目录为 \`${cwd.toPosix()}\`。所有路径以此为基准。
-   **严禁 \`cd\`**：环境锁定在根目录。使用工具时必须传入准确的 \`path\` 参数。
-   **外部命令**：若需在根目录外执行，**必须**将“切换目录”与“执行命令”合并为单条指令（因目录状态无法跨指令保持）。例如：在外部项目运行 \`npm install\`，伪代码为 \`cd (项目路径) ${chainOp} (npm install)\`。${chainNote ? ` ${chainNote}` : ""}。鉴于命令执行可能改变终端目录，路径须以 \`execute_command\` 返回的工作目录为准。
-   **Cmd 限制**：Cmd 环境下严禁使用 Unix 命令（sed/grep/rm），须改用 type/del/findstr 或 PowerShell。
-   **依赖优先**：根据项目类型（Python/JS/Web）优先查阅 manifest 文件（如 package.json）获取依赖信息。
-   **上下文兼容**：修改代码务必结合上下文，确保兼容性，遵循项目规范。
-   **拒绝索取**：能用工具查到的信息（如桌面文件），严禁询问用户。确需提问时，使用 \`ask_followup_question\`，并提供 2-4 个具体候选项。
-   **默认成功**：若命令无输出，默认成功。除非必要，勿要求用户粘贴终端输出。
${settings?.isStealthModel ? getVendorConfidentialitySection() : ""}
`
}
