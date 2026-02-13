# TODO: 将 apply_diff 迁移为 edit 工具

## 背景

上游已将 `search_and_replace` 重命名为 `edit`，并引入了 `edit_file`、`apply_patch` 等 customTools。经过对比分析（见下方），`edit_file` 综合评分最高（8.4/10），建议将默认编辑工具从 `apply_diff` 迁移到 `edit`（或 `edit_file`）。

### 工具对比总结

| 工具          | LLM友好度            | 容错匹配    | 多处修改                | 多文件 | 创建文件 | 综合评分 |
| ------------- | -------------------- | ----------- | ----------------------- | ------ | -------- | -------- |
| `apply_diff`  | 中（自定义标记格式） | 可配置      | ✅ 多块                 | ❌     | ❌       | 6.6      |
| `edit`        | ✅ JSON参数          | ❌ 精确     | `replace_all`           | ❌     | ❌       | 6.6      |
| `edit_file`   | ✅ JSON参数          | ✅ 三级降级 | `expected_replacements` | ❌     | ✅       | **8.4**  |
| `apply_patch` | 中（行首前缀格式）   | ✅ 四级降级 | ✅ 多hunk               | ✅     | ✅       | 7.5      |

### 迁移动机

1. `apply_diff` 的自定义 SEARCH/REPLACE 标记格式容易被 LLM 搞错（与 Git merge conflict 标记相似）
2. `:start_line:` 行号在多轮编辑后容易漂移
3. `edit` / `edit_file` 的 JSON 参数格式对 LLM 最友好，生成准确率最高
4. `edit_file` 的三级容错匹配（精确→空白容忍→token级）能自动处理 LLM 常见的空白错误

## 迁移步骤

### 1. 修改默认工具配置

**文件**: `src/shared/tools.ts`

在 `TOOL_GROUPS` 中将 `edit` 工具从 `customTools` 移到 `tools`，将 `apply_diff` 移到 `customTools`：

```ts
edit: {
    tools: ["edit", "write_to_file", "generate_image"],  // edit 替代 apply_diff 成为默认
    customTools: ["apply_diff", "search_replace", "edit_file", "apply_patch"],  // apply_diff 降级为可选
},
```

### 2. 处理 Markdown 语法调用模式

我们的 `apply_diff` 有自定义的 Markdown 调用模式（通过 `MarkdownToolParser` 解析 ` ```apply_diff ` 代码块）。迁移时需要：

- [ ] 评估是否为 `edit` 工具也设计 Markdown 调用语法
- [ ] 如果保留 Markdown 模式，设计 `edit` 的 Markdown 格式（例如 ` ```edit file-path ` ）
- [ ] 更新 `MarkdownToolParser.ts` 支持新格式
- [ ] 考虑向后兼容：是否同时支持旧的 `apply_diff` Markdown 格式

### 3. 更新提示词

- [ ] 更新 `src/core/prompts/tools/native-tools/` 中的工具描述
- [ ] 更新系统提示词中关于编辑工具的使用指导

### 4. 测试验证

- [ ] 确保 `edit` 工具在所有模式下正常工作
- [ ] 验证 Markdown 调用模式的兼容性
- [ ] 对比迁移前后的编辑成功率

## 相关文件

- `src/shared/tools.ts` — 工具组配置（**核心修改点**）
- `src/core/assistant-message/MarkdownToolParser.ts` — Markdown 工具解析器
- `src/core/prompts/tools/native-tools/edit.ts` — edit 工具提示词定义
- `src/core/prompts/tools/native-tools/apply_diff.ts` — apply_diff 工具提示词定义
- `src/core/tools/EditTool.ts` — edit 工具实现
- `src/core/tools/ApplyDiffTool.ts` — apply_diff 工具实现
