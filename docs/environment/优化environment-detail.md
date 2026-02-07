## 已完成的优化

1. 只在对话开始 提示 文件列表
2. 按照当前对话的情景、工具调用情况，动态选择hints
3. 调整 environment 的内容为 xml 格式，增强可读性

## 仍然存在的问题

1. 当用户重新开始对话（比如说在中断后），用户消息仍然会带上完整的文件列表。
2. 文件列表仍然以一种简陋的方式组织，没有重点突出，缺乏层次感，难以快速浏览和理解。
3. 因为 提示词的优化： [text](../sprite-polish/prompt-optimization-todos.md) 或许hints 我们也需要考虑优化一下，且需要增加更加贴合我们的 系统提示词的 hints

## 文件列表优化方向（讨论结论）

### 核心认知

**文件列表的真正价值不是"让 AI 知道有哪些文件"，而是给 AI 提供"察觉联动"的可能性。**

- 没有文件列表 → AI 连想都想不到某些文件需要同步修改（Unknown Unknowns）
- 有文件列表 → AI 至少能通过文件名察觉到潜在的联动关系
- 例如：添加一个工具时，AI 看到 `packages/types/src/tool.ts`，就有可能联想到需要同步修改类型定义

这种联动关系往往是**基于约定而非配置/类型系统强制**的，所以 AI（和人）都容易遗漏。理想情况下应该通过类型系统强制（tsc 检查），但现实中每个项目都不可避免地存在这类隐式依赖——尤其是敏捷开发、快速原型、或频繁变化的模块。

### 优化层次

#### 第一层：提高文件列表信噪比（基础）

当前问题：200 个文件扁平列出，`releases/*.png` 等噪音文件淹没了真正有联动价值的文件，**降低**了 AI 察觉联动的概率。

优化方向：

- 过滤低价值文件（图片、锁文件、翻译文件等）
- 按语义分组（源码、配置、测试、文档）
- 突出关键文件（类型定义、注册表、配置文件）
- 目录折叠（`releases/` → `<dir name="releases/" count="60"/>`）

目标：**让同样的 token 预算传递更多有效信息，让有联动价值的文件更容易被 AI 注意到。**

#### 第二层：上下文感知的联动推荐（进阶）

类似 [getSpriteHint](../../src/core/environment/getSpriteHint.ts) 根据上下文选择行为提示，设计一个**根据 AI 当前操作上下文，自动推荐相关联动文件**的机制。

信息来源（按实现难度排序）：

1. **Import 依赖分析**：解析当前文件的 import，推荐被导入/导入它的文件
2. **约定规则**：源文件 → 测试文件、工具实现 → 类型定义、组件 → 样式
3. **用户自定义规则**：允许在 `.roo/` 中配置项目特定的联动关系
4. **Git co-change 分析**：分析 git 历史，找出经常一起修改的文件
5. **TypeScript 类型联动**：利用 VSCode 语言服务获取类型定义位置

触发时机：

- 文件操作后（read_file / write_to_file）
- 周期性（每 N 轮）
- 检测到特定模式时（如正在添加新工具）

呈现方式：

```xml
<related_files hint="files you may need to check/modify">
  <file reason="imports">src/shared/types.ts</file>
  <file reason="test_file">src/core/tools/__tests__/ReadFileTool.spec.ts</file>
  <file reason="type_definition">packages/types/src/tool.ts</file>
</related_files>
```

关键约束：

- 每次最多推荐 3-5 个文件，避免噪音
- 显示推荐原因（reason），让 AI 理解为什么需要关注
- 保守策略：宁可少推荐，不要错推荐

### 实施路线

1. **Phase 1（短期）**：提高文件列表信噪比——过滤噪音、分层展示
2. **Phase 2（中期）**：实现基础联动推荐——import 分析 + 约定规则
3. **Phase 3（长期）**：智能联动——git co-change + 用户配置 + 类型联动

## 附录

[系统提示词组装](../../src/core/prompts/system.ts)
[hints](../../src/core/environment/getSpriteHint.ts)
[environment details](../../src/core/environment/getEnvironmentDetails.ts)
