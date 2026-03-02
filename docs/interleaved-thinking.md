# 交替思考（Interleaved Thinking）最佳实践

> 基于实验 6 系列的实证验证（2026-02-24），适用于 GLM-4.7 / GLM-5。

## 1. 核心概念

| 模式                     | 含义                                                            | 生效范围                        |
| ------------------------ | --------------------------------------------------------------- | ------------------------------- |
| **Default Thinking**     | 模型回复前进行一次性推理，产出 `reasoning_content`              | 单次请求                        |
| **Interleaved Thinking** | 模型在 tool calls 之间持续推理，每次 tool result 返回后继续思考 | tool call 链路内                |
| **Preserved Thinking**   | 历史轮次的 `reasoning_content` 被保留在上下文中                 | 仅 tool call 链路内（非跨轮次） |

Interleaved Thinking 和 Preserved Thinking 是两个独立能力。前者是模型在一次请求中多次思考，后者是在 tool call 链路中保留思考历史。

## 2. reasoning_content 的保留规则

通过 token 计数法实证验证（PPIO 和智谱网关数据完全一致）：

**保留的充要条件**（三者同时满足）：

1. 所在的 assistant 消息包含 `tool_calls`
2. 紧跟一条 `tool` 消息
3. 该 `assistant→tool` 序列之后**没有 `user` 消息**（仍在 tool call 链路中）

```
✅ 保留：user → assistant(reasoning₁ + tool_calls) → tool
                                                      ↑ 模型能看到 reasoning₁

✅ 多轮累加：user → assistant(r₁ + tc) → tool → assistant(r₂ + tc) → tool
                                                                      ↑ 能看到 r₁ + r₂

❌ 丢弃：user → assistant(reasoning + tool_calls) → tool → user → ...
                                                            ↑ 新轮次，reasoning 清除

❌ 丢弃：user → assistant(reasoning + content) → user → ...
                                                  ↑ 无 tool_calls，reasoning 从未进入上下文
```

**多轮循环中每一轮的 reasoning 独立保留并累加**（实验 6c 验证，三轮 +83 tokens = 31+26+26）。

## 3. 正确使用方式

本项目使用 `submit_script` 工具，每个 assistant 消息都带 `tool_calls`，用户输入作为 `tool` result 注入。这天然满足保留条件。

**关键代码路径**：

- [`domain-to-llm.ts`](../../packages/core/domain-to-llm.ts) 的 `emitMessageIR()` 将 `ir.reasoningContent` 写入 `AssistantMessage.reasoning_content`
- [`generator.ts`](../../packages/core/generator.ts) 收集流式 `reasoning_content` 到 `GenerationResult.thinking`
- 下一轮构造消息时，`ModelTurn.thinking` 被传回 `reasoning_content` 字段

**必须设置** `clear_thinking: false`（或等效参数），否则 API 会主动清除历史 reasoning。

## 4. 常见误区

**误区 1：认为 reasoning_content 是跨轮次记忆**
不是。一旦出现新的 `user` 消息，所有历史 reasoning 被清除。它只在 tool call 链路的中间步骤中存活。

**误区 2：不传 reasoning_content 也能工作**
单步 tool call 确实如此。但多步链路中，不传会导致模型"失忆"——不知道自己之前为什么调用工具。

**误区 3：篡改 reasoning_content**
官方要求原样回传。篡改可能导致 cache miss 和推理不连贯。

**误区 4：认为不同提供商行为不同**
实验证实 PPIO 和智谱官方网关行为完全一致（token 数完全相同）。这是模型/API 层面的设计。

## 5. 验证方法

**Token 计数法**（最可靠）：

构造两组相同消息，唯一区别是是否包含 `reasoning_content`。比较 `prompt_tokens`：

- `diff > 0` → 保留
- `diff = 0` → 丢弃

比暗号召回更可靠：不依赖模型"意愿"，不受自行推导干扰，提供精确物理证据。

详细实验数据见 [record/long-cot-failure-diagnosis.md](record/long-cot-failure-diagnosis.md)（实验 6 系列）。

## 6. 补充实验：user message 对 reasoning 保留的影响（2026-03-02）

### 背景

Roo Code 的 environment details 作为 `role: "user"` 消息的 text block 注入到 tool result 之后。需要验证这是否会打断 interleaved thinking 链路。

### 实验设计

使用 GLM-5（via PPIO），先获取真实的 `reasoning_content` + `tool_call`，然后构造 4 组对比：

| 组  | 结构                                         | 目的                         |
| --- | -------------------------------------------- | ---------------------------- |
| A   | 1 tool_call + 1 tool result                  | 基线                         |
| B   | 1 tool_call + 1 tool result + user message   | 验证 user 是否打断           |
| C   | 2 tool_calls + 2 tool results                | 验证多 tool results 是否保留 |
| D   | 2 tool_calls + 2 tool results + user message | 验证多 tool + user 是否打断  |

### 实验结果

```
A (1tc + 1tr):           205 prompt_tokens
B (1tc + 1tr + user):    193 prompt_tokens  diff=-12
C (2tc + 2tr):           224 prompt_tokens  diff=+19
D (2tc + 2tr + user):    212 prompt_tokens  diff=+7 (比C少12)
```

### 结论

1. **✅ 多个 tool results 不打断 thinking**：组 C 比 A 多 19 tokens（= 额外 tool_call + tool_result 开销），reasoning 完整保留
2. **❌ user message 必定打断 thinking**：组 B 比 A 少 12 tokens，组 D 比 C 少 12 tokens——丢弃量完全一致，等于 reasoning 的 token 数
3. **❌ content array 混合也会打断**（前次实验）：即使 tool_result 和 text block 在同一条 `role: "user"` 消息的 content array 中，reasoning 同样被丢弃

### 影响

Roo Code 当前将 environment details 作为 user message text block 注入，**每轮都会清除累积的 reasoning_content**。解决方案：完全移除 environment 注入机制，改为模型按需主动获取信息。

验证脚本：[scripts/verify-thinking-preservation.mjs](../scripts/verify-thinking-preservation.mjs)
