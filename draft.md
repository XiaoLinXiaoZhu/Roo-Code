# 架构优化计划

## 旧架构

比较传统的 subagent 架构，整个agent组织为树状结构，各个parent委派任务给其各自的subagent，subagent完成任务后返回结果。

各个agent额外承担了任务调度和结果汇总的职责。以及需要关注任务分派和状态转换等。

### 提供函数

#### Agent 分派与切换核心函数

- **`new_task`**: 创建子任务并委派工作

    - 参数: `message` (任务描述), `todos` (待办事项列表), `mode` (任务模式)
    - **父任务调用此工具后必须暂停**,子任务成为唯一的当前活动任务
    - 支持层级子任务 (使用 `\\@` 前缀表示)
    - **痛点**: 父任务需要理解何时委派、如何构建子任务的上下文

- **`attempt_completion`**: 完成当前任务

    - 如果是子任务,会将结果返回给父任务
    - 如果是根任务,会请求用户确认完成
    - **痛点**: 需要区分根任务和子任务的不同行为逻辑

- **`switch_mode`**: 切换任务模式
    - 支持不同模式: code, architect, ask, test 等
    - 切换后工具列表重新过滤,模式立即生效
    - **痛点**: Agent 需要理解不同模式的含义和适用场景,增加了认知负担

#### 状态跟踪函数

- **`update_todo_list`**: 更新待办事项列表
    - Agent 需要手动管理任务进度
    - **痛点**: Agent 需要记忆和管理待办事项状态,分散了对实际工作的注意力

#### 注：文件操作、代码操作等其他工具（read_file, write_to_file, apply_diff 等）是具体执行工具，与 Agent 分派架构关系不大，此处省略以聚焦核心逻辑

### 旧架构实现细节

#### 1. 树状任务的复杂性

整个系统采用树状层次结构组织,每个 Agent 都是一个独立的 Task 实例:

```typescript
// 树状结构示意
Root Task (根 Agent)
├── taskId: "task-1"
├── parentTaskId: undefined
├── childTaskId: "task-2"
├── apiConversationHistory: [...]  // 独立的对话历史
├── todoList: [...]                // 独立的待办事项
└── _taskMode: "code"              // 独立的模式
    └── Child Task (子 Agent)
        ├── taskId: "task-2"
        ├── parentTaskId: "task-1"
        ├── childTaskId: "task-3"
        ├── apiConversationHistory: [...]  // 独立的对话历史
        ├── todoList: [...]                // 独立的待办事项
        └── _taskMode: "architect"         // 独立的模式
            └── Child Task (孙 Agent)
                └── ...
```

**痛点**:

- 每个 Agent 都维护独立的状态（对话历史、待办事项、模式）
- 父 Agent 必须理解如何构建子 Agent 的初始上下文
- 状态分散在多个 Task 实例中,难以统一管理
- 需要在父、子之间传递复杂的上下文信息

#### 2. 复杂的委派生命周期

**委派阶段** (父 Agent → 子 Agent):

```typescript
// 1. 父 Agent 调用 new_task 工具
await new_task({
  message: "编写一个 React 组件",
  todos: ["- 创建组件文件", "- 实现 props 接口"],
  mode: "code"
})

// 2. 系统执行复杂的委派逻辑
async delegateParentAndOpenChild(params) {
  // 2.1 先暂停父任务
  await parent.abortTask(true)

  // 2.2 保存父任务的待处理工具结果 (避免数据丢失)
  await parent.flushPendingToolResultsToHistory()

  // 2.3 更新父任务状态为 "delegated"
  await this.updateTaskHistory({
    ...parentHistory,
    status: "delegated",
    awaitingChildId: childTaskId
  })

  // 2.4 创建子任务并设为唯一活动任务
  const child = await this.createTask(...)

  // 2.5 从任务栈中移除父任务,只保留子任务
  this.clineStack = [child]
}
```

**返回阶段** (子 Agent → 父 Agent):

```typescript
// 1. 子 Agent 完成任务
await attempt_completion({
  text: "组件已创建",
  images: [...]
})

// 2. 系统执行复杂的返回逻辑
async delegateToParent(task, result, provider) {
  // 2.1 将子任务结果注入父任务的对话历史
  parent.apiConversationHistory.push({
    role: "user",
    content: [{ type: "tool_result", tool_result: result }]
  })

  // 2.2 更新子任务状态为 "completed"
  await this.updateTaskHistory({
    ...childHistory,
    status: "completed"
  })

  // 2.3 更新父任务状态并恢复
  await this.updateTaskHistory({
    ...parentHistory,
    status: "active",
    awaitingChildId: undefined,
    completedByChildId: childTaskId
  })

  // 2.4 重新打开父任务
  const restoredParent = await this.createTaskWithHistoryItem(parentHistory)

  // 2.5 父任务自动继续任务循环 (无需用户交互)
  await restoredParent.resumeAfterDelegation()
}
```

**痛点**:

- 委派和返回需要执行大量状态转换操作
- 需要手动管理对话历史的传递和同步
- 父 Agent 暂停和恢复的时机难以把握
- 状态转换失败可能导致数据不一致

#### 3. 工具过滤与模式切换的复杂性

**模式定义**:

```typescript
const MODES = {
	code: {
		groups: ["code", "terminal", "browser"],
		excludedTools: ["fetch_instructions"],
	},
	architect: {
		groups: ["code", "read-only", "browser"],
		excludedTools: ["execute_command", "write_to_file"],
	},
	ask: {
		groups: ["read-only", "browser"],
		excludedTools: ["write_to_file", "edit_file", "execute_command"],
	},
}
```

**工具过滤逻辑**:

```typescript
function getToolDescriptionsForMode(mode, cwd, ...options) {
  const tools = new Set<string>()

  // 1. 添加模式允许的工具组
  mode.groups.forEach(groupEntry => {
    const toolGroup = TOOL_GROUPS[groupEntry]
    toolGroup.tools.forEach(tool => {
      if (isToolAllowedForMode(tool, mode, ...)) {
        tools.add(tool)
      }
    })
  })

  // 2. 排除模式禁止的工具
  mode.excludedTools.forEach(tool => tools.delete(tool))

  // 3. 条件性排除特定工具
  if (!codeIndexManager?.isFeatureEnabled) {
    tools.delete("codebase_search")
  }
  if (settings?.todoListEnabled === false) {
    tools.delete("update_todo_list")
  }

  // 4. 动态生成工具描述并注入系统提示
  return tools.map(tool => getToolDescription(tool, mode, ...))
}
```

**模式切换**:

```typescript
await switch_mode({
	mode_slug: "architect",
	reason: "需要进行架构设计,暂时只读模式",
})

// 切换后:
// 1. 立即更新全局状态
providerState.mode = "architect"

// 2. 工具列表重新过滤 (execute_command 被移除, read_only 工具被添加)

// 3. 延迟 500ms 确保切换完成
await delay(500)

// 4. 下一次 API 调用时,系统提示中只包含新模式允许的工具
```

**痛点**:

- Agent 需要理解不同模式的含义和适用场景
- 模式切换会改变可用的工具集,Agent 需要适应
- 工具过滤逻辑复杂,容易出错
- 模式切换延迟会影响用户体验

#### 5. Agent 的认知负担

**Agent 需要管理的事项**:

```typescript
class Task {
	// 1. 对话历史管理
	apiConversationHistory: Array<Message>

	// 2. 待办事项管理
	todoList: Array<TodoItem>

	// 3. 任务状态管理
	status: "active" | "delegated" | "completed"

	// 4. 错误计数
	consecutiveMistakeCount: number

	// 5. 子任务管理
	childTaskId?: string
	pendingNewTaskToolCallId?: string

	// 6. 模式管理
	private _taskMode: string

	// 7. 工具协议管理
	private _toolProtocol: "xml" | "native"
}
```

**Agent 需要理解的概念**:

- 何时调用 `new_task` 创建子任务
- 如何构建子任务的初始上下文
- 何时调用 `attempt_completion` 完成任务
- 如何切换模式以适应不同场景
- 如何手动管理待办事项的进度

**痛点总结**:

- **认知负担过重**: Agent 花费大量精力在任务调度、状态管理上,而不是专注于实际工作
- **上下文传递复杂**: 父子任务之间的上下文传递需要手动管理,容易遗漏
- **协作困难**: 单一活动任务约束限制了多 Agent 并行协作的可能性
- **扩展性差**: 添加新的模式或工具需要修改大量的过滤和状态管理逻辑

## 新架构（agent as tools）

> “像赛博格（Cyborg）一样工作”

它的核心思想是 **“封装复杂性”** 。它不再试图模拟“人与人的对话”，而是回归计算机科学的**函数调用（Function Calling）**，只不过这个函数的内部实现是一个智能体。
渊源来自于 **ReAct (Reason + Act)** 模式的极致简化，以及 **MCP (Model Context Protocol)** 等标准化的推进。

Cursor 的 `Composer` 功能、Vercel 的 AI SDK 其实都在往这个方向靠拢。

### 核心机制

- **主脑独裁（The Monolith Brain）：** 只有一个主 Agent 面向用户，保持人格和记忆的连贯性。

- **自然语言接口（NL Interface）：** 工具的输入参数不再是死板的 JSON，而是自然语言。
    - `search("查找最近关于RAG优化的论文")` -> 内部是一个 Researcher Agent 在执行复杂的搜索、去重、阅读摘要逻辑。
    - `applyEdit("把这段代码的错误处理改成 try-catch")` -> 内部是一个 Coding Agent 在做 AST 解析、定位、差异比对、代码生成。
- **结果导向：** 主模型不关心过程，只关心 `return` 回来的最终文本或状态变更。

### 优劣分析

- **优势：**
    - **认知减负（Cognitive Offloading）：** 主模型不需要维护复杂的团队管理逻辑，只需像使用计算器一样使用“搜索器”或“修改器”。
    - **模块化与解耦：** 后端的 Search Agent 可以随时升级模型（比如换成 O1），而前端的主 Agent 毫无感知，依然只负责发指令。
    - **高精度：** 既然是 Tool，就可以强制执行由代码构成的校验（Lint, Compile Test），保证结果的确定性。

### 新架构实现细节

因为我们需要实现的逻辑，基于当前架构已经足以实现，仅仅需要在实现细节和包装上进行调整。我们分为三步走：

1. 实现新架构的工具实现
2. 移除旧架构的工具实现
3. 调整提示词、指导模型。删除旧架构的工具提示词、新增新架构的工具提示词

#### 1. 实现新架构的工具实现

原本的subagent逻辑本身就是一个工具，我们只需要将其包装成一个工具即可，不再让模型认为它在调用、分派任务。

旧架构：

```typescript
// 1. 父 Agent 调用 new_task 工具
await new_task({
	message: "编写一个 React 组件",
	todos: ["- 创建组件文件", "- 实现 props 接口"],
	mode: "code",
})
```

新架构：

```typescript
// 调查项目情况
await search({
  query: "调查项目情况",
  schema?: {
    type: "object",
    properties: {
      project_name: {
        type: "string",
        description: "项目名称"
      },
      project_description: {
        type: "string",
        description: "项目描述"
      }
    }
  } // 可选，用于要求指定格式的返回结果
})
```

旧架构：

```typescript
// 1. 父 Agent 调用 new_task 工具
await new_task({
	message: "把 button.tsx 的错误处理改成 try-catch",
	todos: ["- 修改 button.tsx", "- 运行 tsc 检查错误"],
	mode: "code",
})
```

新架构：

```typescript
// 编写代码
await applyEdit({
	files: ["button.tsx"],
	edit: "把 button.tsx 的错误处理改成 try-catch",
})
```

旧架构：

```typescript
// 1. 父 Agent 调用 new_task 工具
await new_task({
	message: "用户要求设计一个登录页面，我应该如何设计，以获得最好的架构？",
	todos: ["- 设计登录页面架构", "- 设计相关数据库表结构", "- 设计相关接口"],
	mode: "expert",
})
```

新架构：

```typescript
// 设计登录页面架构
await sendEmail({ // 发送邮件给专家，请求专家设计登录页面架构
  expertExpected："ui、用户交互设计、架构设计、数据库表结构设计、接口设计",
  title: "设计登录页面架构",
  content: "用户要求设计一个登录页面，我应该如何设计，以获得最好的架构？",
  attachments: ["登录页面设计稿.md"]
}) // 通过自然语境，处理使用咨询情景，模型能够更好的处理内容的撰写等。
```

---

旧架构：

- new_task 工具 完成所有类型的工具的调用，包括：
    - ask
    - code
    - expert // 自定义
- 模型需要理解各个模式之间的区别，以及如何切换模式
- 提供了switch_mode 工具，用于切换模式

新架构：

- 不提供new_task 工具，而是提供工具直接调用各个模式：
    - searchProject --> ask // 就像是google搜索一样，直接搜索内容
    - applyEdit --> code // 就像是代码编辑器一样，直接编辑代码，模型不用深入修改代码细节和lint等校验等
    - sendEmail --> expert // 就像是发送邮件给专家，请求专家协助
- 新架构模式对应的工具：
    - ask --> read-only、执行命令、搜索文件、搜索代码库、searchProject、sendEmail、todo；无编辑工具
    - code --> 完整的工具、applyEdit、searchProject、sendEmail、todo
    - expert --> read-only、执行命令、搜索文件、搜索代码库、searchProject、todo；无编辑工具、无sendEmail工具
    - orchestrate --> 完整工具，searchProject、applyEdit、sendEmail、todo
- 模型不用理解各个模式、各个状态等等。只需要选择合适的工具即可：
    - 复杂推理：sendEmail
    - 应用编辑：applyEdit
    - 调查项目情况：searchProject

#### 2. 移除旧架构的工具实现

- new_task 工具 --> 我们直接使用 [searchProject、applyEdit、sendEmail] 工具来实现，不再需要 new_task 工具
- switch_mode 工具 --> 模型不再需要切换自己的模式，只需要像是调用工具一样，调用对应的工具即可。

#### 3. 调整提示词、指导模型。删除旧架构的工具提示词、新增新架构的工具提示词
