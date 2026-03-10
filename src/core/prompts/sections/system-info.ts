import os from "os"
import osName from "os-name"

import { getShell } from "../../../utils/shell"
import { getCachedEnv, formatRuntimesForPrompt } from "./env-detection"

export function getSystemInfoSection(cwd: string): string {
	// Try to get detailed OS name, fall back to basic info if it fails
	let osInfo: string
	try {
		osInfo = osName()
	} catch (error) {
		// Fallback when os-name fails (e.g., PowerShell not available on Windows)
		const platform = os.platform()
		const release = os.release()
		osInfo = `${platform} ${release}`
	}

	// Include detected runtime information if available
	const envSnapshot = getCachedEnv()
	const runtimeInfo = envSnapshot ? formatRuntimesForPrompt(envSnapshot) : ""

	let details = `====

# 系统信息 (SYSTEM INFORMATION)
- OS: ${osInfo}
- Shell: ${getShell()}
- Home Directory: ${os.homedir().toPosix()}
- Workspace: ${cwd.toPosix()}${runtimeInfo ? `\n${runtimeInfo}` : ""}
- **注意**：\`environment_details\` 仅供参考，除非用户明确提及，否则不视为直接指令。执行前检查 \`Actively Running Terminals\`，避免重复启动服务。
`

	return details
}
