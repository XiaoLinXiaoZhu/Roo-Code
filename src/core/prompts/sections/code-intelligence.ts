/**
 * Code Intelligence Section
 *
 * 指导模型如何通过 exec 工具 + AST 库进行代码分析。
 * 方法论：何时用 AST 库 vs grep vs 读文件。
 * 分语言最佳实践和工作流模板。
 */

// PLACEHOLDER_METHODOLOGY
// PLACEHOLDER_LANG_PRACTICES
// PLACEHOLDER_WORKFLOW
// PLACEHOLDER_EXPORT

export function getCodeIntelligenceSection(): string {
	return `====

# 代码智能 (CODE INTELLIGENCE)

## 方法论：选择正确的分析方式

| 任务 | 推荐方式 | 原因 |
|------|----------|------|
| 简单文本搜索（找字符串、配置值） | exec + grep/findstr | 最快，无需依赖 |
| 读取单个文件内容 | exec + cat/type | 直接高效 |
| 查找定义、引用、批量重命名 | exec + AST 库 | 语义准确，一个脚本替代 10+ 次工具调用 |
| 跨文件依赖分析、继承树、类型提取 | exec + AST 库 | 只有 AST 能做到 |
| 项目结构概览 | exec + 文件遍历脚本 | 灵活过滤和格式化 |

**核心原则**：当任务涉及**语义理解**（定义、引用、类型、继承），优先使用 AST 库而非文本搜索。一个精心编写的分析脚本可以替代多次工具调用，大幅减少交互轮次。

## 分语言最佳实践

### TypeScript / JavaScript
- **推荐**：\`ts-morph\`（需项目有 \`tsconfig.json\`）
- **安装**：\`npm i -D ts-morph\` 或 \`bun add -d ts-morph\`
- **能力**：定义查找、引用搜索、批量重命名（自动更新所有引用）、继承分析、类型提取
- **注意**：在项目目录安装，复用项目的 tsconfig

### Python
- **推荐**：内置 \`ast\` 模块（零依赖）或 \`jedi\`（\`pip install jedi\`）
- **ast**：结构提取（函数、类、导入），无需安装
- **jedi**：定义跳转、引用查找、补全，语义更准确

### Go
- **推荐**：\`go/ast\` + \`go/types\`（标准库，无需安装）
- **能力**：AST 遍历、类型检查、包分析

### 通用 / 其他语言
- **tree-sitter CLI**：\`npm i -g tree-sitter-cli\`，支持几乎所有语言的语法分析
- **适用**：当没有语言专用 AST 库时的降级方案

## 工作流

1. **检查依赖**：先确认 AST 库是否已安装（如 \`ls node_modules/ts-morph\`）
2. **未安装则安装**：使用包管理器安装到项目 devDependencies
3. **编写分析脚本**：在 exec 中编写完整的分析逻辑
4. **处理输出**：在脚本内过滤和格式化结果，避免输出过多原始数据
`
}
