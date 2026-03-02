# Agent as Tools 实现说明

## 概述

本文档说明"Agent as Tools"架构新工具的实现细节。这些工具封装了复杂的子任务委派机制,为主模型提供简单、自然的接口。

## 已实现的工具

### 1. SearchProjectTool (`search_project`)

**用途**: 搜索和调查项目代码库

**参数**:

- `query` (必需): 自然语言查询
- `scope` (可选): 搜索范围配置
    - `directories`: 限制目录
    - `filePatterns`: 文件匹配模式
    - `excludes`: 排除模式
- `schema` (可选): JSON schema 用于结构化输出

**内部实现**:

- 创建 `ask` 模式的子任务
- 子任务拥有只读权限(read_file, search_files, list_files, codebase_search)
- 禁止编辑操作(write_to_file, apply_diff)
- 禁止递归调用(searchProject, applyEdit, consultExpert)

**使用示例**:

```
搜索项目结构:
await searchProject({
  query: "这个项目的技术栈是什么?使用了哪些主要框架?",
  scope: {
    directories: "src,lib",
    filePatterns: "*.ts,*.tsx"
  }
})

结构化信息提取:
await searchProject({
  query: "列出所有 API 端点",
  schema: JSON.stringify({
    type: "array",
    items: {
      type: "object",
      properties: {
        method: { type: "string" },
        path: { type: "string" },
        handler: { type: "string" }
      }
    }
  })
})
```

### 2. ApplyEditTool (`apply_edit`)

**用途**: 编辑和修改代码

**参数**:

- `instruction` (必需): 自然语言编辑指令
- `files` (可选): 限制可编辑的文件
- `context` (可选): 额外上下文信息
- `validate` (可选): 是否运行校验(默认 true)

**内部实现**:

- 创建 `code` 模式的子任务
- 子任务拥有完整编辑权限(read_file, write_to_file, apply_diff)
- 禁止递归调用(searchProject, consultExpert)
- 支持文件限制(通过 customInstructions)
- 可选运行 lint 和类型检查

**使用示例**:

```
简单修改:
await applyEdit({
  instruction: "把按钮的颜色从蓝色改成绿色",
  files: "src/components/Button.tsx",
  validate: true
})

Bug 修复:
await applyEdit({
  instruction: "修复这个空指针异常,user 可能为 null",
  context: "报错信息:Cannot read property 'name' of null at UserProfile.tsx:42"
})

批量重构:
await applyEdit({
  instruction: "把所有 class 组件改写成函数式组件",
  files: "src/components/*.tsx",
  validate: true
})

新功能开发:
await applyEdit({
  instruction: "创建一个新的 React 组件:UserAvatar,显示用户头像,支持不同尺寸",
  context: "参考现有的 Button 组件风格"
})
```

### 3. ConsultExpertTool (`consult_expert`)

**用途**: 咨询专家意见,进行深度分析和架构设计

**参数**:

- `domain` (必需): 专家领域描述
- `topic` (必需): 咨询主题
- `question` (必需): 详细问题描述
- `attachments` (可选): 附件(文件路径或内容)
- `outputFormat` (可选): 输出格式
    - `"analysis"`: 详细分析
    - `"design"`: 架构设计
    - `"comparison"`: 方案对比
    - `"recommendation"`: 可行性建议

**内部实现**:

- 创建 `ask` 模式的子任务(使用自定义角色)
- 子任务拥有只读权限(read_file, search_files, list_files, codebase_search)
- 禁止编辑操作(write_to_file, apply_diff)
- 禁止递归调用(consultExpert, applyEdit)
- 使用 domain 参数构建专家角色提示词

**使用示例**:

```
架构设计:
await consultExpert({
  domain: "后端架构、微服务设计、数据库设计",
  topic: "用户认证系统设计",
  question: "我需要设计一个支持多租户的用户认证系统,应该如何设计?",
  outputFormat: "design"
})

技术选型:
await consultExpert({
  domain: "前端框架、性能优化",
  topic: "状态管理方案选择",
  question: "Redux vs Zustand vs Jotai,对于中大型应用应该选择哪个?",
  outputFormat: "comparison"
})

代码审查:
await consultExpert({
  domain: "代码质量、安全审计",
  topic: "安全漏洞检查",
  question: "请审查这个认证模块的安全性",
  attachments: ["src/auth/login.ts", "src/auth/session.ts"],
  outputFormat: "analysis"
})

性能优化建议:
await consultExpert({
  domain: "性能优化、数据库调优",
  topic: "查询性能优化",
  question: "这个 SQL 查询很慢,如何优化?",
  attachments: ["slow-query.sql"],
  outputFormat: "recommendation"
})
```

## 工具组合模式

### Explore-Edit (调查-编辑)

```
// 先调查,再编辑
const info = await searchProject({
  query: "找到所有使用 deprecated API 的地方"
})

const result = await applyEdit({
  instruction: "把 deprecated API 替换成新 API",
  files: info.findings.map((f) => f.path),
  validate: true,
})
```

### Consult-Implement (咨询-实施)

```
// 先咨询专家,再实施方案
const design = await consultExpert({
  domain: "数据库设计",
  topic: "用户表结构",
  question: "如何设计支持多租户的用户表?",
  outputFormat: "design",
})

const result = await applyEdit({
  instruction: `根据以下设计创建 migration:\n${design.opinion}`,
  context: design.recommendations.join("\n"),
  validate: true,
})
```

### Multi-Search (多步调查)

```
// 并行多个调查
const [frontend, backend, database] = await Promise.all([
  searchProject({ query: "前端组件结构" }),
  searchProject({ query: "API 接口定义" }),
  searchProject({ query: "数据库模型定义" }),
])
```

## 与现有架构的关系

### 工具到模式的映射

| 新工具           | 内部模式         | 实际执行             |
| ---------------- | ---------------- | -------------------- |
| `search_project` | ask              | 只读操作、搜索、分析 |
| `apply_edit`     | code             | 完整的编辑能力       |
| `consult_expert` | ask (自定义角色) | 深度推理、方案设计   |

### 权限配置

**search_project** (ask 模式):

- ✅ read_file
- ✅ search_files
- ✅ list_files
- ✅ codebase_search
- ✅ execute_command(只读)
- ❌ write_to_file(禁止编辑)
- ❌ apply_diff(禁止编辑)
- ❌ consultExpert(防止递归)
- ❌ applyEdit(防止递归)

**apply_edit** (code 模式):

- ✅ read_file
- ✅ write_to_file
- ✅ apply_diff
- ✅ search_files
- ✅ list_files
- ✅ execute_command(测试、校验)
- ❌ consultExpert(防止递归)
- ❌ searchProject(防止递归)

**consult_expert** (ask 模式 + 自定义角色):

- ✅ read_file
- ✅ search_files
- ✅ list_files
- ✅ codebase_search
- ✅ searchProject(调查上下文)
- ❌ write_to_file(禁止编辑)
- ❌ apply_diff(禁止编辑)
- ❌ consultExpert(防止递归)
- ❌ applyEdit(防止编辑)

## 文件结构

```
src/core/tools/
├── SearchProjectTool.ts      # 搜索项目工具实现
├── ApplyEditTool.ts         # 应用编辑工具实现
├── ConsultExpertTool.ts      # 咨询专家工具实现
└── BaseTool.ts             # 工具基类(已存在)

src/core/prompts/tools/native-tools/
├── search_project.ts           # search_project 的 native tool 定义
├── apply_edit.ts              # apply_edit 的 native tool 定义
└── consult_expert.ts          # consult_expert 的 native tool 定义

src/core/assistant-message/
└── presentAssistantMessage.ts   # 更新以包含新工具的执行逻辑

packages/types/src/
└── tool.ts                     # 更新以包含新工具类型

src/shared/
└── tools.ts                     # 更新以包含新工具配置
```

## 实现步骤

### 第一步: 创建工具实现 ✅

- [x] 创建 SearchProjectTool
- [x] 创建 ApplyEditTool
- [x] 创建 ConsultExpertTool

### 第二步: 定义 Native Tool 格式 ✅

- [x] 创建 search_project.ts native tool 定义
- [x] 创建 apply_edit.ts native tool 定义
- [x] 创建 consult_expert.ts native tool 定义

### 第三步: 更新类型定义 ✅

- [x] 在 packages/types/src/tool.ts 中添加工具名称
- [x] 在 src/shared/tools.ts 中添加类型定义
- [x] 在 src/shared/tools.ts 中添加工具组和显示名称

### 第四步: 注册到系统 ✅

- [x] 在 native-tools/index.ts 中导入新工具
- [x] 在 native-tools/index.ts 中导出新工具
- [x] 在 presentAssistantMessage.ts 中添加导入
- [x] 在 presentAssistantMessage.ts 中添加执行 case
- [x] 在 presentAssistantMessage.ts 中添加工具描述

### 第五步: 测试和验证 (待完成)

- [ ] 编写单元测试
- [ ] 编写集成测试
- [ ] 手动测试工具功能
- [ ] 验证错误处理
- [ ] 性能测试

### 第六步: 文档和发布 (待完成)

- [ ] 更新用户文档
- [ ] 添加使用示例
- [ ] 准备发布说明

## 核心设计原则

1. **语义清晰**: 工具名称即用途,无需额外解释
2. **参数简洁**: 自然语言优先,避免复杂结构化参数
3. **返回一致**: 统一的结果格式,便于主模型处理
4. **权限控制**: 严格的工具权限配置,防止递归调用
5. **错误处理**: 完善的错误分类和恢复机制

## 下一步计划

1. 实现回滚机制(RollbackManager) - 用于 apply_edit 的撤销功能
2. 实现遥测系统(ToolTelemetry) - 收集工具使用数据
3. 添加配置系统(ConfigManager) - 支持启用/禁用新架构
4. 完善 test coverage
5. A/B 测试支持 - 逐步推出新架构

## 注意事项

1. **向后兼容**: 保持与现有 new_task 工具的兼容性
2. **性能考虑**: 子任务创建和恢复的性能影响
3. **错误恢复**: 确保子任务失败后能正确恢复父任务
4. **安全检查**: 验证工具权限配置的有效性
5. **日志记录**: 添加详细的执行日志以便调试

---

_创建日期: 2026-01-13_
_版本: 1.0.0_
