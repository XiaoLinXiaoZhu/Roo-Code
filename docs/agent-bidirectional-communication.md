# Agent 双向通信功能

## 概述

实现了 `send_message_to_agent` 工具，使 parent agent 和 child agent 之间能够进行双向通信，支持任务协调和确认。同时优化了 `new_task` 工具的委派哲学，强调目标对齐而非实现细节。

**关键改进**：修改了子任务完成时的消息传递机制，要求父 agent 必须验证子任务结果，而不是直接接受。

## 核心功能

### 1. 双向通信

- **Child → Parent**: 子 agent 可以向父 agent 提问，寻求澄清
- **Parent → Child**: 父 agent 可以向子 agent 发送消息，确认或质疑其方法
- **XML 标签包裹**: 代理消息使用 `<agent_message>` 或 `<subtask_completion>` 标签包裹，与用户消息区分

### 2. 强制验证机制

当子任务调用 `attempt_completion` 时，系统会自动在父 agent 的消息中注入验证要求：

```xml
<subtask_completion task_id="child_task_id">
<result>
子任务的完成结果...
</result>
</subtask_completion>

IMPORTANT: Before accepting this result, you MUST verify the child agent's work:

1. **Question the claims**: Identify 1-2 specific claims in the result that should be verified
2. **Request evidence**: Use send_message_to_agent with target_agent_id="child_task_id" to ask for concrete proof
   - Example: "Show me the exact code you added"
   - Example: "What was the actual test output?"
   - Example: "How does your solution handle edge case X?"
3. **Verify before accepting**: Only accept after you have seen evidence and confirmed correctness

You can send multiple messages to the child agent to thoroughly verify their work. Do NOT accept the result without verification.
```

这确保了父 agent 不会直接接受子任务的结果，而是被明确要求进行验证。

### 3. 三大使用场景

#### 对齐 (Alignment)

子 agent 在任务执行过程中遇到歧义时，主动向父 agent 寻求确认：

```
"您的意思是使用 JWT tokens 还是 session-based 认证？我理解您提到'无状态'，这建议使用 JWT，但我想在继续之前确认。"
```

#### 确认 (Confirmation)

父 agent 注意到子 agent 的方法可能存在风险时，主动质疑：

```
"您计划删除数据库。您确定这是正确的吗？"
```

#### 复用 (Reuse)

继续与同一 agent 工作，复用之前的上下文和共识：

```
"我完成了前端部分。请注意我使用了 React hooks，这会影响您的 API 设计。"
```

## 委派哲学 (new_task 改进)

### 对齐 WHAT，而非 HOW

- **父 agent**: 明确说明目标和需求，但让子 agent 决定实现方法
- **子 agent**: 拥有完全自主权来决定工具、文件和方法
- **鼓励澄清**: 子 agent 应该使用 `send_message_to_agent` 询问不确定的问题，而不是猜测

### 子 agent 协议

1. **自主性与明确性**: 你有完全的自主权决定如何实现，但对需求不明确时必须询问
2. **永不猜测 - 总是询问**: 遇到任何需求、约束或预期行为的不确定性时：
    - **应该**: 立即使用 `send_message_to_agent` 向父 agent 询问
    - **不应该**: 对父 agent 的意图做出假设或猜测
3. **主动信息收集**: 在询问父 agent 之前，尝试通过以下方式收集信息：
    - 阅读相关文件以了解现有模式
    - 搜索代码库寻找类似实现
    - 分析错误消息或测试失败
    - 如果信息收集无法解决不确定性，则询问父 agent

### 父 agent 验证协议

父 agent 必须验证子 agent 的工作：

1. **批判性审查**: 对子 agent 的完成结果持健康的怀疑态度
2. **基于证据的验证**: 使用 `send_message_to_agent` 要求具体证据
3. **后续问题**: 即使子 agent 已调用 `attempt_completion`，也可以继续提问
4. **接受标准**: 只有在看到具体证据、验证关键功能并确认所有需求满足后才接受

## 消息格式

### XML 标签包裹

代理间消息使用特殊的 XML 标签包裹，以区分用户消息：

```xml
<agent_message source="parent" task_id="task_xxx">
消息内容
</agent_message>
```

或

```xml
<agent_message source="child" task_id="task_yyy">
消息内容
</agent_message>
```

这使得模型能够清楚地识别消息来源，并相应地调整响应。

## 技术实现

### 新增文件

1. **SendMessageToAgentTool** ([src/core/tools/SendMessageToAgentTool.ts](src/core/tools/SendMessageToAgentTool.ts))

    - 实现工具的核心逻辑
    - 处理消息验证和发送
    - 支持向已完成的子任务发送消息

2. **Native Tool Definition** ([src/core/prompts/tools/native-tools/send_message_to_agent.ts](src/core/prompts/tools/native-tools/send_message_to_agent.ts))
    - 定义工具的 OpenAI 函数格式
    - 包含详细的使用说明和示例

### 修改的文件

1. **ClineProvider** ([src/core/webview/ClineProvider.ts](src/core/webview/ClineProvider.ts))

    - 添加 `sendMessageToAgent()` 方法
    - 处理 agent 切换和消息注入
    - 消息使用 `<agent_message>` XML 标签包裹

2. **类型定义**

    - [packages/types/src/tool.ts](packages/types/src/tool.ts): 添加 `send_message_to_agent` 到工具名称
    - [packages/types/src/events.ts](packages/types/src/events.ts): 添加事件 `AgentMessageSent`, `AgentMessageReceived`
    - [packages/types/src/task.ts](packages/types/src/task.ts): 更新 `TaskProviderEvents` 类型
    - [src/shared/tools.ts](src/shared/tools.ts): 添加类型定义和显示名称

3. **presentAssistantMessage** ([src/core/assistant-message/presentAssistantMessage.ts](src/core/assistant-message/presentAssistantMessage.ts))

    - 注册工具处理器
    - 添加工具描述

4. **Tool Guidelines** ([src/core/prompts/sections/tool-use-guidelines.ts](src/core/prompts/sections/tool-use-guidelines.ts))

    - 添加子 agent 使用指导（主动询问，不要猜测）
    - 添加父 agent 验证协议（必须验证子 agent 工作）
    - 说明 XML 标签格式

5. **Rules** ([src/core/prompts/sections/rules.ts](src/core/prompts/sections/rules.ts))

    - 添加"子 agent 协议"部分（自主性、主动询问、结构化问题）
    - 添加"子 agent 验证协议"部分（父 agent 验证流程）

6. **new_task 工具更新**

    - [src/core/prompts/tools/new-task.ts](src/core/prompts/tools/new-task.ts): 更新 XML 协议描述
    - [src/core/prompts/tools/native-tools/new_task.ts](src/core/prompts/tools/native-tools/new_task.ts): 更新 Native 协议描述
    - 强调"对齐 WHAT，而非 HOW"的委派哲学

7. **关键修改: 子任务完成消息构建** ([src/core/webview/ClineProvider.ts](src/core/webview/ClineProvider.ts#L3260-L3340))

    - **问题根源**: 之前版本在子任务完成时，只是简单地告诉父 agent "Subtask completed"，没有要求验证
    - **解决方案**: 修改 `reopenParentFromDelegation()` 方法，注入强制验证指令
    - **消息格式**: 使用 `<subtask_completion>` XML 标签包裹结果，附带明确的验证步骤要求
    - **影响**: 父 agent 现在会收到明确的验证要求，包括具体的验证步骤和示例问题
    - **覆盖范围**: 同时更新了 Native 协议（tool_result）和 XML 协议（text）的消息构建

8. **Native Tools Index** ([src/core/prompts/tools/native-tools/index.ts](src/core/prompts/tools/native-tools/index.ts))
    - 将工具添加到工具列表

## 工作流程

### Child → Parent

1. Child agent 调用 `send_message_to_agent(message="需要澄清的问题")`（不提供 `target_agent_id`）
2. Child agent 暂停执行，消息保存到历史
3. Parent agent 恢复，接收消息作为用户输入
4. Parent agent 处理消息并可以回复（使用相同工具）

### Child Task Completion (强制验证流程)

1. Child agent 调用 `attempt_completion(result="完成结果")`
2. 系统调用 `reopenParentFromDelegation()` 注入验证消息到父 agent
3. 注入的消息包含：
    - `<subtask_completion>` XML 标签包裹的结果
    - 明确的 "IMPORTANT: Before accepting this result, you MUST verify" 指令
    - 三步验证流程（质疑声明、请求证据、验证后接受）
    - 具体的验证问题示例
    - `send_message_to_agent` 使用说明，包含子任务 ID
4. Parent agent 恢复执行，必须按照验证协议进行验证
5. Parent agent 使用 `send_message_to_agent(target_agent_id="child_id", message="验证问题")` 追问
6. Child agent 收到追问并回答
7. 重复步骤 5-6 直到父 agent 满意
8. Parent agent 最终接受或拒绝结果

### Parent → Child

1. Parent agent 调用 `send_message_to_agent(target_agent_id="child_id", message="确认问题")`
2. Parent agent 暂停执行
3. Child agent 恢复，接收消息
4. Child agent 可以回复或继续工作

## 关键特性

### 单一打开约束

- 系统始终只有一个 agent 处于活动状态
- 发送消息时自动切换活动 agent
- 保证视图显示当前活动 agent

### 历史管理

- 消息注入到 UI 历史（`clineMessages`）和 API 历史（`apiConversationHistory`）
- UI 消息使用 📤/📥 表情符号显示方向
- API 消息使用 `<agent_message source="parent|child" task_id="xxx">` XML 标签包裹
- 完整保留对话上下文

### XML 标签格式

代理间消息在 API 上下文中使用特殊的 XML 标签：

```xml
<agent_message source="parent" task_id="parent_task_id">
消息内容
</agent_message>
```

这种格式的优势：

- 清晰区分代理消息和用户消息
- 提供消息来源信息（parent/child）
- 包含任务 ID 用于追踪
- 模型可以根据消息来源调整响应策略

### 验证与追问

- 父 agent 可以向已完成的子任务发送消息
- 支持多轮验证对话
- 通过 `historyItem.childIds` 验证父子关系

### 事件系统

- `AgentMessageSent`: 消息发送时触发
- `AgentMessageReceived`: 消息接收时触发
- 可用于遥测和 UI 更新

## 使用示例

### 子 Agent 向父 Agent 提问

```typescript
// 子 agent 中
send_message_to_agent({
	message:
		"我需要实现用户认证。应该使用 JWT 还是基于会话的认证？需求中提到'无状态'，这暗示 JWT，但我想在继续之前确认。",
})
```

### 父 Agent 向子 Agent 确认

```typescript
// 父 agent 中
send_message_to_agent({
	target_agent_id: "child-task-123",
	message: "你计划删除生产数据库？请再次确认这是正确的操作，因为这是不可逆的。",
})
```

## 注意事项

1. **阻塞操作**: 调用此工具会暂停当前 agent 并转移控制权
2. **验证关系**: 只能在有父子关系的 agent 之间发送消息
3. **适度使用**: 仅在真正需要输入或澄清时使用，不要用于简单的状态更新

## 未来改进

### UI 显示（待实现）

- 在 webview 中显示 agent 间消息的特殊样式
- 实现视图自动切换的动画效果
- 添加消息历史追踪可视化

### 增强功能

- 支持附件/图片传递
- 消息优先级标记
- 超时和自动回退机制
- 支持多层嵌套 agent 通信

## 相关 Issue 和文档

- TASK.md: 原始需求文档
- 单一打开约束：确保系统稳定性的核心机制
- Agent 委托机制：`delegateParentAndOpenChild()` 和 `reopenParentFromDelegation()`
