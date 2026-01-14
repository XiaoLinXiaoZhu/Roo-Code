import { McpHub } from "../../../services/mcp/McpHub"

export function getCapabilitiesSection(cwd: string, mcpHub?: McpHub): string {
	return `====

# 能力范围 (CAPABILITIES)

-   **系统操作**：利用工具执行命令行、列出文件、查看源码、正则搜索及读写文件。
-   **项目洞察**：\`environment_details\` 包含当前工作区（${cwd}）的全量文件列表。这是你的地图，请通过文件名（架构思路）和后缀（语言类型）分析项目结构。
-   **外部探索**：若需探索工作区以外目录（如 Desktop），使用 \`list_files\`。通用目录不必递归（recursive='false'），仅看顶层即可。
-   **命令执行**：使用 \`execute_command\` 运行 CLI 命令，务必清晰解释作用。优先直接执行复杂命令而非创建脚本。支持交互式和长时任务（运行在用户终端）。${
		mcpHub
			? `
- **MCP 支持**：你有权访问 MCP 服务器以获取额外工具和资源。每个服务器可能提供不同的能力，助你更高效地完成任务。
`
			: ""
	}`
}
