# Intent Tree 设计文档

> 本文档记录了 Intent Tree 功能的设计意图、发现的问题、以及改进方案。

## 一、设计意图

### 1.1 要解决的核心问题

在多轮对话中，AI 助手容易陷入"意图漂移"：

```
用户说【A】→ 助手实现【A1】【A2】【A3】
用户说【A1有问题】→ 助手 patch【A1-patch】【A2-patch】
用户说【试试B】→ 助手在【A1-patch】【A2-patch】【B1】【B2】上继续堆叠
```

**根本原因**：助手把"实现"误当成"约束"，在约束的实现上再次实现，只能以 patch 形式修改。

### 1.2 Intent Tree 的核心思想

**将用户的 goal（约束）和 impl（实现）分离**，让助手能够区分：

- **约束**：用户真正想要的，不能随意改变
- **实现**：达成约束的手段，可以重写、替换、废弃

### 1.3 节点类型层级

```
goal（最终目标）
  └── objective（可验证的子目标）
        └── approach（实现路径）
              └── impl（具体实现）
```

| 类型      | 语义                           | 稳定性 | 示例                 |
| --------- | ------------------------------ | ------ | -------------------- |
| goal      | 用户的最终目标，主观、不可证伪 | 最稳定 | "让系统更快"         |
| objective | 可对齐、可确认的中间目标       | 稳定   | "减少数据库查询次数" |
| approach  | 用户尝试达成目标的手段         | 可变   | "使用缓存"           |
| impl      | 代码层面的具体实现             | 最易变 | "添加 Redis 缓存层"  |

### 1.4 与 Git 的绑定

每个 impl 节点可以绑定 git commit，使得：

- 助手能理解"这段代码是为了什么目标而写的"
- 当 approach 被废弃时，能快速定位需要 revert 的 commit
- 支持"断舍离"：明确哪些代码可以删除

---

## 二、发现的问题

### 2.1 Goal 发现的渐进性 vs 树结构的静态性

**问题描述**：

- 用户第一次说【A】时，模型只能将其理解为 goal
- 后来用户说【B】时，才发现【A】【B】都是某个更高层 goal 的 objective
- 但树结构一旦建立就是静态的，没有"提升节点层级"的机制

**本质**：知识的发现是渐进式的，但树结构是声明式的。

**影响**：早期的 goal 占据顶层位置，后来发现的真正 goal 反而被迫成为 objective。

### 2.2 shortId 与类型不匹配

**问题描述**：

- 当类型被自动调整时（如 goal→objective），shortId 仍然基于父节点生成（如 `G1.1`）
- 这导致 shortId 前缀与实际类型不一致

**示例**：

```
在 G1 下创建 goal → 类型被调整为 objective
shortId 是 G1.1（前缀 G 暗示 goal）
但实际类型是 objective
```

### 2.3 类型调整的静默修正

**问题描述**：

- `adjustChildType()` 会静默修正不合法的类型
- 模型不知道发生了什么，心智模型与系统状态不一致

**代码位置**：[`IntentTree.ts:47-62`](../../src/core/intent-tree/IntentTree.ts)

### 2.4 缺乏重构能力

**问题描述**：

- 当前只支持 add/update/prune，没有 reparent/promote
- 无法表达"【A】【B】其实是平级的，它们共同服务于一个更高的 goal"

### 2.5 shortId 可能被复用

**问题描述**：

- 当前 shortId 基于"当前兄弟数量"生成
- 删除节点后，新增节点可能复用被删除节点的 shortId
- 这会造成混淆

**代码位置**：[`IntentTree.ts:133-147`](../../src/core/intent-tree/IntentTree.ts)

---

## 三、设计决策

### 3.1 关于 DAG vs 树

**讨论**：是否允许一个 impl 服务于多个 goal（DAG 结构）？

**结论**：保持树结构。

**理由**：

- DAG 无法保证操作的原子性
- 当上层发生重构时，需要逐个判断共享模块的归属
- 不如在一开始就明确归属，通过"复制节点"而非"共享节点"来实现复用

### 3.2 关于 shortId 的设计

**讨论**：shortId 应该由系统生成还是让模型命名？

**候选方案**：
| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 系统生成 | `{类型前缀}{层级索引}`，如 G1, O1.1 | 可验证性强 | 结构变化时会变 |
| B. 模型命名 | 模型自己取名，如 "perf-goal" | 语义化、稳定 | 给模型臆测空间 |
| C. 混合方案 | 系统生成 + 模型可取别名 | 两全其美 | 复杂度高 |

**结论**：采用方案 A（系统生成），并改进生成算法。

**理由**：

- "防止臆测"的本质是**闭环验证机制**，而非标识符设计
- 系统生成的结构化标识符 + 严格验证 = 最优路径
- 把命名权交给模型 = 把臆测的机会交给模型

**shortId 的设计意图**：

1. LLM 输出友好：比 UUID 更好操作
2. 约束 LLM 行为：模型必须知道要操作的类型+位置，才能正确操作节点

### 3.3 关于工具数量

**讨论**：重构操作（reparent/promote/extract）是否应该独立成工具？

**结论**：合并为单一的 `restructure_intent` 工具。

**理由**：

- 重构是低频操作，不值得占用独立工具槽位
- 三个操作语义相关（都是"改变树结构"），概念内聚
- 减少模型的选择困难

---

## 四、改进方案

### 4.1 工具集设计（5 个）

| 工具                 | 职责             | 使用频率 |
| -------------------- | ---------------- | -------- |
| `add_intent`         | 创建节点         | 高       |
| `update_intent`      | 更新内容/状态    | 高       |
| `prune_intent`       | 剪枝（标记废弃） | 中       |
| `commit_intent`      | 绑定 git commit  | 高       |
| `restructure_intent` | 结构重组（新增） | 低       |

### 4.2 `restructure_intent` 设计

```typescript
interface RestructureIntentParams {
	operation: "reparent" | "promote" | "extract_common_parent"

	// reparent: 移动节点到新父节点
	nodeId?: string
	newParentId?: string | null // null = 提升为根节点

	// promote: 提升层级（语法糖，等价于 reparent 到祖父节点 + 调整类型）
	// 只需 nodeId

	// extract_common_parent: 从多个节点中提取共性
	nodeIds?: string[] // 要提取共性的节点列表
	commonContent?: string // 新父节点的内容
}
```

### 4.3 shortId 生成算法改进

**当前实现**（有问题）：

```typescript
const siblingCount = parent.childrenIds.length
return `${parent.shortId}.${siblingCount + 1}`
```

**改进方案**：使用递增计数器，避免复用

```typescript
// 在节点中记录历史最大子节点序号
const maxChildIndex = parent.maxChildIndex ?? 0
parent.maxChildIndex = maxChildIndex + 1
return `${parent.shortId}.${parent.maxChildIndex}`
```

### 4.4 类型调整通知

**当前实现**：静默调整，模型不知道。

**改进方案**：在 `add_intent` 返回中显式说明：

```xml
<intent_result action="add">
  <node shortId="O1.1" type="objective">
    <content>...</content>
  </node>
  <type_adjustment from="goal" to="objective" reason="子节点类型不能高于父节点"/>
</intent_result>
```

### 4.5 错误反馈增强

**当前实现**：引用不存在的节点时返回 `null`。

**改进方案**：返回可用节点列表

```
Error: Node 'G3' not found.
Available nodes: G1 (goal: 优化性能), G2 (goal: 修复bug), O1.1 (objective: 减少查询)
```

### 4.6 shortId 动态重算

当结构变化时（reparent/promote），需要重新计算整棵树的 shortId：

```typescript
/**
 * 重新计算所有节点的 shortId
 * 返回 oldShortId -> newShortId 的映射
 */
recalculateShortIds(): Map<string, { old: string; new: string }>
```

操作返回值中包含变化映射，帮助模型理解：

```xml
<restructure_result>
  <affected_nodes>
    <node oldShortId="A1.1.1" newShortId="A1.2" />
    <node oldShortId="A1.1.2" newShortId="A1.1.1" />
  </affected_nodes>
  <tree_summary>...</tree_summary>
</restructure_result>
```

---

## 五、实现优先级

### 立即可做（低风险）

1. **类型调整通知**：修改 `AddIntentTool.ts`，当类型被调整时在返回中说明
2. **错误反馈增强**：引用不存在节点时返回可用列表

### 短期可做（中等风险）

3. **shortId 生成算法改进**：使用递增计数器，避免复用
4. **新增 `restructure_intent` 工具**：实现 reparent 操作

### 长期考虑

5. **实现 promote 和 extract_common_parent**：基于 reparent 构建
6. **shortId 动态重算**：在结构变化时自动更新

---

## 六、核心原则总结

1. **约束与实现分离**：树状结构天然区分"约束"（上层）和"实现"（下层）
2. **显式优于隐式**：当系统做了"聪明"的事情时，必须告诉模型
3. **减少模型自由度**：系统生成的结构化标识符 + 严格验证 = 防止臆测
4. **支持演化**：不追求"一开始就设计完美"，而是让系统支持重构
5. **保持简单**：树结构优于 DAG，合并低频工具，避免不必要的复杂度

---

## 七、命名演化：GSPI → GOAI

> 本节记录了将 `subgoal` → `objective`、`path` → `approach` 的命名变更决策过程。

### 7.1 问题

原始命名 GSPI（Goal / Subgoal / Path / Impl）存在自解释性不足的问题：

1. **subgoal**：前缀 "sub-" 暗示"次要的目标"，但实际语义是"可验证的期望状态"。LLM 容易将其理解为"更小的 goal"，从而在 subgoal 中填入动作性描述（如"优化查询"），而非状态性描述（如"查询次数 < 10"）。
2. **path**：与文件系统路径（file path）高度歧义。在代码上下文中，LLM 看到 `path` 时倾向于联想到文件路径而非"实现路径"。此外，"path" 的语义过于抽象，不能引导 LLM 填入具体的方法论。

### 7.2 分析过程

通过三个维度进行了对比分析：

1. **OKR 对比**：OKR（Objectives and Key Results）中，Objective 对应 goal，Key Result 对应 objective——强调"可衡量的结果状态"。这启发了用 `objective` 替代 `subgoal`，因为 objective 天然暗示"期望达到的状态"而非"要做的事"。
2. **Theory of Change 分析**：Theory of Change 框架中，每一层都有明确的 assumption（假设）。这启发了在节点中增加 `assumption` 字段，让 LLM 显式记录"为什么认为这个 approach 能达成 objective"。
3. **专家咨询**：确认了"约束层用名词性描述、实现层用动作性描述"的分界原则，以及 `approach` 比 `path` 更具方法论引导性。

### 7.3 决策

| 旧名称 (GSPI) | 新名称 (GOAI)     | 变更原因                                                              |
| ------------- | ----------------- | --------------------------------------------------------------------- |
| goal (G)      | goal (G)          | 不变——语义清晰，无歧义                                                |
| subgoal (S)   | **objective (O)** | "objective" 暗示可验证的结果状态，引导 LLM 填入名词性描述而非动作     |
| path (P)      | **approach (A)**  | "approach" 避免与 file path 歧义，且暗示方法论，引导 LLM 填入具体做法 |
| impl (I)      | impl (I)          | 不变——语义清晰，无歧义                                                |

### 7.4 借鉴的机制

#### assumption 字段（借鉴 Theory of Change）

每个 `approach` 节点增加可选的 `assumption` 字段，记录"为什么认为这个做法能达成上层 objective"：

```
objective: "首屏加载时间 < 2s"
  └── approach: "使用代码分割"
        assumption: "当前 bundle 过大是首屏慢的主因"
```

这使得当 approach 失败时，LLM 能回溯检查 assumption 是否成立，而非盲目尝试下一个 approach。

#### placementReason 增强（借鉴 OKR 的 alignment）

`placementReason` 字段从"解释为什么放在这个父节点下"增强为同时包含：

- **alignment**：这个节点如何对齐上层目标
- **assumption guidance**：引导 LLM 思考"达成这个 objective 需要什么假设成立"

### 7.5 约束/实现分界线

命名变更后，四层结构形成清晰的两层模型：

```
┌─────────────────────────────────────────┐
│  约束层（名词性，描述期望状态）          │
│                                         │
│    goal     → "让系统更快"              │
│    objective  → "首屏加载时间 < 2s"       │
│                                         │
├─────────────────────────────────────────┤
│  实现层（动作性，描述做法）              │
│                                         │
│    approach → "使用代码分割 + 懒加载"   │
│    impl     → "配置 webpack splitChunks"│
│                                         │
└─────────────────────────────────────────┘
```

- **约束层**回答 "What"：期望达到什么状态？由用户定义，稳定。
- **实现层**回答 "How"：用什么方法达到？由助手提出，可替换。

这个分界线让 LLM 在填写节点时有明确的语法引导：看到 `objective` 就写状态，看到 `approach` 就写方法。
