## 当前架构

Parent --单向委托--> Subagent
Subagent --单向回复--> Parent

### 存在的问题

- Parent 无条件接受 Subagent 的结果，即使结果存在系统性偏差或者错误
- Subagent 即使存在困惑，也无法向 Parent 提问或请求帮助

## 修改目标

- 代码上，提供 send_message_to_agent 方法，用于 agent 向 agent 发送消息。（包含 agent 向 subagent 发送消息和 subagent 向 agent 发送消息两种情况）
- 提示词上，设计相关提示词指导模型使用该工具。

### 核心目标

模拟人类讨论时候的对齐机制。

1. 对齐：parent向subagent委托任务后，subagent工作了一段时间后，subagent向parent提问“你的意思是XXX吗？我的理解对吗”，从而让 agent 和 subagent 之间更加协调。
2. 确认：subagent向parent汇报工作结果，parent发现存在可疑点，向subagent提问“你确定是XXX吗？”，subagent根据parent的确认结果进行调整。
3. 复用：当遇到相关问题时可以直接再次委派同一subagent，从而复用subagent之前的工作成果。subagent拥有之前的工作记忆和共识，能够迅速和更好的完成任务。比如 subagent1: 处理前端逻辑，subagent2: 处理后端逻辑，subagent3: 处理数据库逻辑，subagent4: 处理UI逻辑。当parent检查发现ui逻辑存在问题，可以再次委派subagent4进行处理。

### ui 显示

因为 roocode 保持 保持单一打开约束。webview 显示栈顶会话。

最终的效果应该类似于，subagent 向 parent 提问，视图直接切换为 parent，展示为parent接收到一条特殊消息（类似 subagent向agent递交的 attempt_completion 消息），然后 控制权切换到 parent。

parent进行生成循环，可能调用若干个工具，最终再次调用 send_message_to_agent 方法，向 subagent 发送消息。

然后视图直接切换为 subagent，展示为 subagent 接收到一条特殊消息，然后 控制权切换到 subagent。subagent进行生成循环，可能调用若干个工具，最终再次调用 send_message_to_agent 方法，向 parent 发送消息。在任务完成后，subagent 调用 attempt_completion 工具，输出最终结果。
