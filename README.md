# Roo Code - Agent as Tools 架构魔改版

> 基于 [Roo Code](https://github.com/RooCodeInc/Roo-Code) 的个人魔改版本，采用"Agent as Tools"架构重构，将智能体封装为工具，让主模型专注于思考。

---

## 📚 相关文档

- [原版 README](./README.original.md) - 官方版本的完整文档
- [架构白皮书](./docs/architecture/README.md) - Agent as Tools 架构的详细设计文档

---

## 🎯 核心理念

本版本的核心改动是将传统的多模式（Modes）系统重构为工具化的架构，用"Agent as Tools"的理念替代原有的模式切换机制。

**核心思想：像赛博格（Cyborg）一样工作** - 将智能体封装为工具，让主模型专注于思考，而非任务调度。

### 架构演进对比

```
┌─────────────────────────────────────────────────────────────┐
│                      旧架构（Modes 模式）                      │
├─────────────────────────────────────────────────────────────┤
│  Main Agent ───► switch_mode("code")                        │
│       │                                                       │
│       ├──► Code Mode: 代码编辑、文件操作                      │
│       ├──► Architect Mode: 系统规划、规格设计                  │
│       ├──► Ask Mode: 快速问答、文档解释                       │
│       ├──► Debug Mode: 追踪问题、添加日志                     │
│       └──► Custom Mode: 自定义工作流                          │
│                                                             │
│  痛点：                                                      │
│  • 需要理解不同模式的适用场景和边界                           │
│  • 状态转换复杂：active → mode_switch → active               │
│  • 模式切换需要额外的提示词上下文                            │
│  • 主模型需要理解何时切换模式                                │
└─────────────────────────────────────────────────────────────┘

                          ↓ 演进 ↓

┌─────────────────────────────────────────────────────────────┐
│                    新架构（Agent as Tools）                   │
├─────────────────────────────────────────────────────────────┤
│  Main Agent ───► searchProject("调查项目结构")                 │
│             ───► applyEdit("修复这个bug")                      │
│             ───► consultExpert("设计最优架构")                 │
│             ───► read_file("查看某个文件")                     │
│             ───► codebase_search("搜索相关代码")               │
│                                                             │
│  优势：                                                       │
│  • 工具化封装，主模型无需理解模式概念                          │
│  • 自然语言接口，降低认知负担                                  │
│  • 结果导向，专注于任务本身                                     │
│  • 移除模式切换的复杂性                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 主要改动点

### 1. 新增核心工具

替代原有的多模式系统，通过专用工具完成不同场景的任务。

#### 1.1 SearchProjectTool（项目搜索工具）

**位置**：`src/core/tools/SearchProjectTool.ts`

使用自然语言描述进行项目搜索，返回相关的代码片段和上下文信息。

**功能特点**：

- 支持语义搜索，理解自然语言查询
- 返回相关的代码片段、文件路径和上下文
- 可选的结构化返回（schema 参数，规划中）

**使用示例**：

```typescript
searchProject("调查项目结构")
searchProject("查找用户认证相关的代码")
searchProject("搜索所有API路由定义")
```

#### 1.2 ConsultExpertTool（专家咨询工具）

**位置**：`src/core/tools/ConsultExpertTool.ts`

针对复杂问题调用专家智能体进行深度分析和建议，返回专家意见。

**功能特点**：

- 支持领域专家模式（如架构专家、安全专家、性能专家）
- 支持附件上传（代码片段、截图等）
- 可自定义输出格式
- 增强的专家角色定义和领域指令

**使用示例**：

```typescript
consultExpert({
	domain: "architecture",
	topic: "设计最优架构",
})

consultExpert({
	domain: "security",
	topic: "审查这个API的潜在漏洞",
	attachments: ["api.js"],
	outputFormat: "markdown",
})
```

#### 1.3 ApplyEditTool（应用编辑工具）

**位置**：`src/core/tools/ApplyEditTool.ts`

使用自然语言描述直接应用编辑操作，无需手动编写具体的文件操作指令。

**功能特点**：

- 简化的指令结构，移除自定义指令
- 增强的待办事项结构，支持唯一ID和状态
- 支持验证和上下文传递
- 扩展的自动批准逻辑

**使用示例**：

```typescript
applyEdit({
	instruction: "修复这个bug",
	context: "在用户登录模块中",
})

applyEdit({
	instruction: "重构这个函数以提高性能",
	validate: true,
})
```

### 2. 移除和禁用的工具

为简化架构和降低复杂度，移除了以下工具：

#### 已完全移除：

- ❌ `SwitchModeTool` - 模式切换工具
    - 移除文件：`src/core/tools/SwitchModeTool.ts`
    - 移除提示词：`src/core/prompts/tools/switch-mode.ts`
    - 移除提示词：`src/core/prompts/tools/native-tools/switch_mode.ts`

#### 已禁用但保留引用（注释）：

- ❌ `new_task` - 创建新任务工具
    - 注释掉所有相关调用和配置
- ❌ `browser_action` - 浏览器操作工具
    - 暂时禁用以简化实验环境
- ❌ `use_mcp_tool` / `access_mcp_resource` - MCP 工具
    - 暂时禁用以简化实验环境
- ❌ `run_slash_command` - 斜杠命令工具
    - 暂时禁用以简化实验环境

### 3. 工具配置重构

#### 工具组（Tool Groups）调整

```typescript
// src/shared/tools.ts
export const TOOL_GROUPS: Record<ToolGroup, ToolGroupConfig> = {
	read: {
		tools: ["read_file", "fetch_instructions", "search_files", "list_files", "codebase_search"],
	},
	edit: {
		tools: ["apply_diff", "write_to_file", "generate_image"],
	},
	browser: {
		tools: [], // ! 已禁用
	},
	command: {
		tools: ["execute_command"],
	},
	mcp: {
		tools: [], // ! 已禁用
	},
	modes: {
		// 使用新工具替代旧的模式工具
		tools: ["search_project", "apply_edit", "consult_expert"],
		alwaysAvailable: true,
	},
}
```

#### 始终可用工具（Always Available Tools）

```typescript
export const ALWAYS_AVAILABLE_TOOLS: ToolName[] = [
	"ask_followup_question",
	"attempt_completion",
	"update_todo_list",
	// ❌ "switch_mode",  // 已移除
	// ❌ "new_task",      // 已禁用
]
```

### 4. 系统提示词重构

#### 新增提示词模板

- `src/core/prompts/tools/native-tools/search_project.ts` - 项目搜索提示词
- `src/core/prompts/tools/native-tools/consult_expert.ts` - 专家咨询提示词
- `src/core/prompts/tools/native-tools/apply_edit.ts` - 应用编辑提示词

#### 移除的提示词

- ❌ `src/core/prompts/tools/switch-mode.ts`
- ❌ `src/core/prompts/tools/native-tools/switch_mode.ts`

#### 提示词生成系统更新

- 移除了模式（modes）部分的提示词生成
- 更新了系统提示词中的模式定义和工具导入
- 简化了自定义指令部分

### 5. 工具增强和优化

#### ConsultExpertTool 增强

- 简化消息构建流程
- 增强的专家角色定义，支持领域特定指令
- 改进的专家模式，包含详细的规范定义和自定义指令

#### ApplyEditTool 简化

- 移除自定义指令，使用更简单的参数结构
- 增强待办事项结构，支持唯一ID和状态跟踪
- 改进的验证机制

#### SearchProjectTool 优化

- 增强的工具描述和使用说明
- 改进的自然语言理解能力

---

## 📋 技术细节

### 文件结构

```
src/
├── core/
│   ├── tools/                          # 工具实现
│   │   ├── BaseTool.ts                 # 工具基类
│   │   ├── SearchProjectTool.ts        # ✨ 项目搜索工具
│   │   ├── ConsultExpertTool.ts        # ✨ 专家咨询工具
│   │   ├── ApplyEditTool.ts            # ✨ 应用编辑工具
│   │   └── ...                         # 其他原有工具
│   ├── prompts/
│   │   ├── tools/
│   │   │   ├── native-tools/           # 原生工具提示词
│   │   │   │   ├── search_project.ts   # ✨
│   │   │   │   ├── consult_expert.ts   # ✨
│   │   │   │   ├── apply_edit.ts       # ✨
│   │   │   │   └── ...                 # 其他工具提示词
│   │   │   └── ...                     # 其他提示词文件
│   │   ├── sections/                   # 提示词片段
│   │   │   ├── index.ts                # 已移除 modes 部分
│   │   │   └── rules.ts                # 已移除模式相关规则
│   │   └── system.ts                   # 主提示词生成
│   └── ...                             # 其他核心代码
├── shared/
│   └── tools.ts                        # ✨ 工具配置和类型定义
└── ...
docs/
└── architecture/                       # 架构文档
    ├── README.md                       # 架构总览
    ├── 00-overview.md                  # 架构概述
    ├── 01-tools-design.md              # 工具设计规范
    ├── 02-boundaries.md                # 边界处理
    ├── 03-migration-plan.md            # 迁移计划
    ├── 04-prompts.md                   # 提示词设计
    └── 05-implementation.md            # 实现计划
```

### 核心设计原则

1. **认知减负**：主模型不再需要理解模式切换、状态管理
2. **模块解耦**：子智能体作为黑盒工具，可独立升级和优化
3. **自然交互**：使用自然语言作为工具接口，降低使用门槛
4. **结果导向**：主模型只关心返回结果，不关心内部实现
5. **简化复杂度**：移除不必要的抽象层，减少系统复杂度

### 提交历史概览

```bash
feat: 添加新工具实现（SearchProjectTool、ApplyEditTool、ConsultExpertTool）
refactor: 增强 ConsultExpertTool 的专家角色定义
refactor: 简化 ApplyEditTool 的自定义指令
refactor: 更新模式配置，调整工具可用性
refactor: 移除 switch_mode 工具及相关引用
refactor: 从提示词生成中移除模式部分
refactor: 更新模式定义和工具导入
feat: 扩展自动批准逻辑以包含新工具
feat: 注释掉已废弃工具以清晰标识
feat: 更新工具描述和说明以提高清晰度
```

---

## 🚀 快速开始

### 安装依赖

```bash
pnpm install
```

### 开发模式

按 `F5` 在 VSCode 中启动调试，会自动打开新的 VSCode 窗口运行扩展。

### 构建 VSIX

```bash
pnpm vsix
```

生成的 VSIX 文件位于 `bin/` 目录。

### 运行测试

```bash
pnpm test
```

---

## 🔮 未来计划

- **v1.1**: 增加结构化返回支持（schema 参数）
- **v1.2**: 工具链组合优化
- **v2.0**: 并行子任务支持
- **v2.1**: 重新启用 MCP 工具和浏览器工具
- **v2.2**: 添加更多专家领域（性能、测试、部署等）

详见：[架构白皮书 - 版本计划](./docs/architecture/README.md#版本计划)

---

## 📖 参考资料

- [原版 README](./README.original.md) - 查看官方版本的完整功能和使用说明
- [架构白皮书](./docs/architecture/README.md) - 深入了解 Agent as Tools 架构设计
- [官方文档](https://docs.roocode.com) - Roo Code 官方文档
- [GitHub Issues](https://github.com/RooCodeInc/Roo-Code/issues) - 官方问题追踪

---

## ⚖️ 许可证

[Apache 2.0 © 2025 Roo Code, Inc.](./LICENSE)

---

**注意**：这是一个个人魔改版本，基于 [Roo Code](https://github.com/RooCodeInc/Roo-Code) 的开源代码进行改造。原版的所有权利声明仍适用于本版本。

### 实验分支信息

当前分支：`agent-as-tool-experiment`
基线版本：Roo Code 3.39.3

如有问题，请参考原版文档或提交 Issue。
