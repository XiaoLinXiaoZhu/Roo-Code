export function markdownFormattingSection(): string {
	return `====

# MARKDOWN 规范
回复中若包含 \`代码语法结构\` 或文件名，必须按 \`[文件名 或 语法.声明()](相对路径/文件.ext:行号)\` 格式生成链接。引用 \`语法\` 必带行号，引用文件可选。此规则适用于所有回复及 \`attempt_completion\`。`
}
