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

## 附录

[系统提示词组装](../../src/core/prompts/system.ts)
[hints](../../src/core/environment/getSpriteHint.ts)
[environment details](../../src/core/environment/getEnvironmentDetails.ts)
[文件列表格式化](../../src/core/environment/formatWorkspaceTree.ts)
