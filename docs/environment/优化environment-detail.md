## 已完成的优化

1. 只在对话开始 提示 文件列表
2. 按照当前对话的情景、工具调用情况，动态选择hints
3. 调整 environment 的内容为 xml 格式，增强可读性
4. **文件列表改为分层目录树展示**：优先展示目录层级架构，文件嵌套在对应目录下
5. **相似文件自动折叠**：同目录下文件名高度相似且 ≥5 个时折叠为 `<files pattern="*-release.png" count="60"/>`
6. **文件列表不再受 .gitignore 过滤**：使用 `ignoreGitIgnore: true`，让 `.report/`、`.roo/` 等本地重要目录出现在列表中；仅受 `.rooignore` 控制

## 仍然存在的问题

1. 当用户重新开始对话（比如说在中断后），用户消息仍然会带上完整的文件列表。
2. 因为 提示词的优化： [text](../sprite-polish/prompt-optimization-todos.md) 或许hints 我们也需要考虑优化一下，且需要增加更加贴合我们的 系统提示词的 hints

## 文件列表优化方向（讨论结论）

### 核心认知

**文件列表的真正价值不是"让 AI 知道有哪些文件"，而是给 AI 提供"察觉联动"的可能性。**

- 没有文件列表 → AI 连想都想不到某些文件需要同步修改（Unknown Unknowns）
- 有文件列表 → AI 至少能通过文件名察觉到潜在的联动关系
- 例如：添加一个工具时，AI 看到 `packages/types/src/tool.ts`，就有可能联想到需要同步修改类型定义

这种联动关系往往是**基于约定而非配置/类型系统强制**的，所以 AI（和人）都容易遗漏。理想情况下应该通过类型系统强制（tsc 检查），但现实中每个项目都不可避免地存在这类隐式依赖——尤其是敏捷开发、快速原型、或频繁变化的模块。

### 未来优化方向：上下文感知的联动推荐（进阶）

类似 [getSpriteHint](../../src/core/environment/getSpriteHint.ts) 根据上下文选择行为提示，设计一个**根据 AI 当前操作上下文，自动推荐相关联动文件**的机制。

信息来源（按实现难度排序）：

1. **Import 依赖分析**：解析当前文件的 import，推荐被导入/导入它的文件
2. **约定规则**：源文件 → 测试文件、工具实现 → 类型定义、组件 → 样式
3. **用户自定义规则**：允许在 `.roo/` 中配置项目特定的联动关系
4. **Git co-change 分析**：分析 git 历史，找出经常一起修改的文件
5. **TypeScript 类型联动**：利用 VSCode 语言服务获取类型定义位置

呈现方式：

```xml
<related_files hint="files you may need to check/modify">
  <file reason="imports">src/shared/types.ts</file>
  <file reason="test_file">src/core/tools/__tests__/ReadFileTool.spec.ts</file>
  <file reason="type_definition">packages/types/src/tool.ts</file>
</related_files>
```

## Hints 优化经验传承

### 当前架构

- **入口**：[`getContextualSpriteHint(context)`](../../src/core/environment/getSpriteHint.ts) 在 [`getEnvironmentDetails.ts:330`](../../src/core/environment/getEnvironmentDetails.ts) 中被调用
- **选择逻辑**：根据 `HintContext`（连续错误次数、工具是否失败、对话轮次、是否有最近修改文件）检测主题，80% 按主题选、20% 完全随机
- **4 个主题**：`certainty`（确定性追求）、`resultOrientation`（结果导向）、`honesty`（诚实透明）、`efficiency`（效率简洁）
- **5 种风格**：格言（maxim）、问句（question）、场景（scenario）、对比（contrast）、链条（chain）+ 2 个身份提醒（identity）
- **共 22 条 hints**

### 已知问题（原始记录）

1. **hints 内容与 Spirit Kernel v4.0 不同步**：当前 hints 基于 v3.0 编写，但系统提示词已升级到 v4.0。v4.0 的核心变化：

    - 从 4 个主题（certainty/resultOrientation/honesty/efficiency）变为 4 个 Value + 10 个 Behavior
    - Value: "Evidence over Speculation" + "Transparency over Mystery" + "User's Real Goal over Literal Request" + "Simplicity over Cleverness"
    - Behavior 编号从 1-10，每个有明确的 When/What/Violations
    - 需要重新对齐 hints 的主题分类和内容

2. **上下文信号太少**：当前 `HintContext` 只有 4 个信号，缺少：

    - 当前正在使用的工具类型（读文件 vs 写文件 vs 执行命令）
    - 是否在调试循环中（反复修改同一文件）
    - 用户消息的意图类型（提问 vs 指令 vs 反馈）
    - ~~当前 mode（code vs architect vs ask）~~

3. **hint 内容偏抽象**：很多 hint 是通用格言，缺少与工具使用最佳实践绑定的具体指导。比如：

    - 没有提醒"使用 `find_definition`/`find_usages` 而不是 grep"
    - 没有提醒"修改前检查是否有对应的 `.spec.ts` 测试文件"
    - 没有提醒"从正确的工作区目录运行测试"

4. **主题检测规则过于简单**：`detectTheme()` 用硬编码阈值（`messageCount <= 2` → resultOrientation），没有考虑对话的实际内容

### 讨论结论与决策

**代码审查发现**：

- `getSpriteHintByType()` 是**死代码**，完全没有外部调用
- `getSpriteHint()` 只在文件内部被 `getContextualSpriteHint` 作为 fallback 调用
- 没有针对 hint 内容的测试文件，只需确保选择逻辑正确

**信号评估**：
| 信号 | 结论 | 理由 |
|---|---|---|
| `lastToolName` | ✅ 采纳 | 可以在用户刚用了 grep 时提醒 find_definition，或在写文件后提醒检查测试 |
| `currentMode` | ❌ 不需要 | mode 信息已在系统提示词中，hint 再提醒没有增量价值 |
| `isDebuggingLoop` | ⏸ 暂缓 | 有价值但实现复杂，`consecutiveMistakeCount` 已部分覆盖 |
| `recentFileExtensions` | ❌ 不需要 | 很难基于扩展名给出有意义的差异化 hint |

**方向 2 修正**：`.roo/rules/rules.md` 是项目级配置，不应硬编码到 hints。实操 hints 应聚焦于**通用的工具使用最佳实践**（如 find_definition 优先于 grep、修改前检查测试文件、竞争假设调试法），而非项目特定规则。

**方向 4 修正**：hints 每 5 轮才展示一次（`shouldIncludeReminder`），重复概率已经不高，衰减机制暂缓。

**最终优先级**：

1. **方向 2**（通用实操 hints）— 最高 ROI，直接改善行为
2. **方向 1**（对齐 v4.0）— 主题重命名 + hint 内容对齐 Behavior
3. **方向 3**（只加 `lastToolName`）— 增强上下文感知
4. **方向 4**（暂缓）— 等前三个方向落地后再评估
5. **清理死代码** — 删除 `getSpriteHintByType`，简化 `getSpriteHint`

### 优化方向详细设计

#### 方向 1：对齐 Spirit Kernel v4.0

将 `HintTheme` 从 4 主题改为对应 v4.0 的结构：

```typescript
type HintTheme =
	| "evidence" // Value: Evidence over Speculation (Behavior 1-3)
	| "transparency" // Value: Transparency over Mystery (Behavior 4-5)
	| "realGoal" // Value: User's Real Goal (Behavior 6-8)
	| "simplicity" // Value: Simplicity over Cleverness (Behavior 9-10)
```

#### 方向 2：增加通用实操 hints

```typescript
// 示例：工具使用提醒（通用，不绑定项目特定规则）
const HINT_TOOL_NAVIGATION = `
🧭 TOOL: Code Navigation

**Use find_definition / find_usages instead of grep for code navigation.**
- find_definition: trace imports, understand implementations
- find_usages: impact analysis before refactoring
- grep: only for text patterns that aren't code symbols
`

// 示例：测试流程提醒
const HINT_TOOL_TESTING = `
🧭 TOOL: Test Workflow

Before completing a task:
1. Check if a .spec.ts/.test.ts file exists for modified code
2. Run tests from the correct workspace directory
3. Read the test file to understand expected behavior before modifying code
`

// 示例：调试方法提醒（对齐 v4.0 Behavior 2）
const HINT_TOOL_DEBUGGING = `
🧭 TOOL: Competing Hypotheses

**When debugging, generate 2-3 competing hypotheses.**
For each: what evidence would confirm or rule it out?
Design ONE experiment that distinguishes between them.
Don't chase the first guess — eliminate systematically.
`
```

注意：项目特定规则（如 vitest 工作区目录、Tailwind 偏好）属于 `.roo/rules/` 的职责，不应硬编码到 hints 中。

#### 方向 3：丰富上下文信号

```typescript
interface HintContext {
	// 现有
	consecutiveMistakeCount: number
	lastToolFailed: boolean
	messageCount: number
	hasRecentlyModifiedFiles: boolean
	// 新增
	lastToolName?: string // 最近使用的工具，用于触发工具相关 hints
}
```

#### 方向 4：hint 去重与衰减（暂缓）

当前 22 条 hints 中有不少内容重叠（比如 MAXIM_2 和 SCENARIO_3 都在说"知道何时求助"）。可以：

- 合并重复内容，减少总数
- 引入衰减机制：最近展示过的 hint 降低权重，避免短期内重复
- **暂缓理由**：hints 每 5 轮才展示一次，重复概率已经不高

### 注意事项

- hints 是嵌入在 `<environment>` XML 的 `<spirit_hint>` 标签中的，每次 API 调用都会带上一条
- 每条 hint 消耗 token，所以要控制长度——当前每条约 50-100 tokens，总共 22 条轮换
- hints 的效果难以量化测试，主要靠主观观察 AI 行为是否符合预期
- 修改 hints 不需要改测试（没有针对 hint 内容的测试），但要确保 `getContextualSpriteHint` 的选择逻辑测试通过

## 附录

[系统提示词组装](../../src/core/prompts/system.ts)
[hints](../../src/core/environment/getSpriteHint.ts)
[environment details](../../src/core/environment/getEnvironmentDetails.ts)
[文件列表格式化](../../src/core/environment/formatWorkspaceTree.ts)
[Spirit Kernel v4.0](../../src/core/prompts/system.ts) — 搜索 "SPIRIT KERNEL"
