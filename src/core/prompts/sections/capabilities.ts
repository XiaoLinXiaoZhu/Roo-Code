import { McpHub } from "../../../services/mcp/McpHub"

export function getCapabilitiesSection(cwd: string, mcpHub?: McpHub): string {
	return `====

# 能力范围 (CAPABILITIES)

-   **系统操作**：利用 \`exec\` 工具执行脚本和命令行操作，读写文件，搜索代码。
-   **代码智能**：通过 \`exec\` + AST 库（如 ts-morph、jedi）进行语义级代码分析——查找定义、引用、批量重命名、继承分析等。一个脚本可替代多次工具调用。
-   **项目洞察**：\`environment_details\` 包含当前工作区（${cwd}）的全量文件列表。这是你的地图，请通过文件名（架构思路）和后缀（语言类型）分析项目结构。
-   **脚本执行**：使用 \`exec\` 运行 shell 命令或语言脚本（JS/TS/Python），支持长时任务和超时控制。${
		mcpHub
			? `
- **MCP 支持**：你有权访问 MCP 服务器以获取额外工具和资源。每个服务器可能提供不同的能力，助你更高效地完成任务。
`
			: ""
	}`
}
