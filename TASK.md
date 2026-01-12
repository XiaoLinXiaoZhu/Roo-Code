# Roo Code Agent 双向对话协作方案

## 一、核心设计思路

### 1.1 从"单向委托"升级为"双向对话"

**现状**：

- Parent 委托任务 → Subagent 独立完成 → Parent 收到结果
- 中间过程对 Parent 不可见
- Parent 无条件接受 Subagent 的结果，即使结果存在偏差或者错误

**目标**：

- Subagent 在执行中可以向 Parent 提问
- Parent 可以对 Subagent 的结果进行追问或要求补充，Subagent 根据 Parent 的要求进行调整
- 双方可以主动确认理解，消除信息传递噪声

**类比**：模拟人类职场中的"经理-实习生"对话协作模式，而非简单的"派单-收单"流程。

---

## 二、核心变更点

### 2.1 新增消息类型

在现有的 `ClineMessage` 类型系统基础上，新增一种消息类型：

**新增 say 类型**：`agent_message`

**用途**：来自另一个 Agent 的消息

**消息结构**：

```typescript
{
  type: "say",
  say: "agent_message",
  text: string,  // 消息内容
  metadata: {
    from: string,  // 来源 Agent ID
    timestamp: number
  }
}
```

---

### 2.2 新增通信能力

**能力名称**：`send_message_to_agent`

**功能描述**：向另一个 Agent 发送消息

**使用场景**：

- Subagent 执行中遇到疑问，向 Parent 提问
- Parent 回答 Subagent 的问题
- Parent 对 Subagent 的结果进行补充要求
- Subagent 回应 Parent 的补充要求

**关键特点**：

- 不区分"提问"、"回答"、"对齐"等类别
- 不强制消息格式
- 让 Agent 自然发挥

---

### 2.3 新增消息路由机制

**路由逻辑**：

- 当收到 `agent_message` 类型消息时，根据 `metadata.from` 和 `metadata.to`（如果有）路由到目标 Agent
- 如果没有明确目标，自动路由到 Parent

**路由方式**：

- 通过 ClineProvider 的内部方法，不暴露给 UI
- Webview 只显示消息内容，不参与路由决策

---

### 2.4 更新系统提示词

为 Subagent 和 Parent 分别添加通信指导。

**Subagent 的提示词**：

- 说明何时使用 `send_message_to_agent`
- 给出自然表达的示例
- 强调避免过度信息，只说必要的
- 提供主动确认理解的示例

**Parent 的提示词**：

- 说明收到 Subagent 消息时如何处理
- 给出简单直接回答的示例
- 提供建设性反馈（而非单纯否定）的示例
- 强调基于 Subagent 已有工作进行补充

---

## 三、总体逻辑

### 3.1 通信流程

```
Subagent 遇到疑问
  ↓ 调用 send_message_to_agent(target="parent", message="...")
  ↓
ClineProvider 收到消息，路由到 Parent
  ↓
Parent 自动收到消息（类似用户输入）
  ↓
Parent 直接回复（无需调用任何工具）
  ↓
ClineProvider 将回复路由回 Subagent
  ↓
Subagent 自动收到回复，继续执行
```

### 3.2 状态处理

**保持现有 5 个状态不变**：

- NO_TASK、RUNNING、STREAMING、WAITING_FOR_INPUT、IDLE、RESUMABLE

**状态转换**：

- 当 Agent 收到 `agent_message` 时，根据当前状态决定：
    - 如果在 WAITING_FOR_INPUT（如 completion_result）→ 自动恢复到 RUNNING
    - 如果在 RUNNING → 保持 RUNNING，触发下一轮对话

**关键点**：不引入新的阻塞状态，避免复杂的状态机。

### 3.3 边界条件处理

**并发安全**：

- 在等待用户批准时（tool, command 等），仍然可以接收来自另一个 Agent 的消息
- 避免因 Agent 间通信导致 UI 冻结

**循环控制**：

- 不在系统层面限制交互次数
- 通过提示词建议 Agent 理性使用，避免无限循环
- 保留 Subagent 的自主决策空间

**多个 Subagent 协作**（未来扩展点）：

- Parent 可以将 Subagent 的关键信息传递给后续 Subagent
- 保持树状结构，所有通信仍通过 Parent

---

## 四、设计原则

### 4.1 简约性

- 不引入复杂的消息分类系统
- 不定义多种工具参数类型
- 消息格式就是纯文本字符串

### 4.2 自然性

- Agent 间的对话像人类聊天一样自然
- 不强制使用特定格式或结构
- 通过提示词引导，而非硬编码约束

### 4.3 自主性

- Agent 可以根据判断自由决定何时通信
- 不在系统层面限制通信频率或时机
- 相信 Agent 的能力，只提供沟通渠道

### 4.4 向后兼容

- 不改变现有任务委托机制
- 不影响现有工具的使用
- 新增能力是可选的，不强制使用

---

## 五、实现优先级

### 阶段一（核心能力）

1. 新增 `agent_message` 消息类型
2. 实现 `send_message_to_agent` 工具
3. 添加消息路由逻辑
4. 更新基础提示词

### 阶段二（体验优化）

1. 丰富提示词中的使用示例
2. 优化 Webview 的消息显示样式
3. 添加 Agent 间通信的视觉区分（如特殊标记）

### 阶段三（高级特性，可选）

1. 支持多个 Subagent 间的信息传递
2. 实现 Agent 间共享上下文的持久化
3. 添加 Agent 通信的历史记录和回放

---

## 六、预期效果

### 6.1 减少信息传递误差

- Subagent 遇到歧义时主动向 Parent 澄清
- Parent 可以纠正 Subagent 的理解偏差
- 双方多次确认，确保共识达成

### 6.2 提高协作效率

- 结果不理想时，可以针对性补充而非从头开始
- Subagent 基于已有工作进行调整
- 减少不必要的重做和 Token 消耗

### 6.3 保持架构简洁

- 不引入复杂的状态机和分类系统
- 复用现有的消息传递机制
- 保持单一打开约束不变

---

## 七、风险评估

### 7.1 潜在风险

- Agent 可能过于频繁通信，增加成本
- 双方可能在某些问题上形成无限循环
- 提示词设计不当可能导致滥用通信能力

### 7.2 缓解措施

- 在提示词中强调"理性使用"、"避免过度通信"
- 给出明确的使用场景示例
- 保留用户最终决策权（可以随时介入停止通信）
