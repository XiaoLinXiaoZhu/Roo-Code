# Roo Code Changelog

## [3.52.8] - 2026-02-27

### ✨ Intent Tree 父子节点状态联动

为 intent-tree 添加 4 条状态联动规则，使父子节点状态自动保持一致：

- **规则1 — 添加子节点时父链回退**：在已完成的节点下新增子节点时，自动将父链上所有 `done` 状态的祖先回退为 `planned`
- **规则2 — 完成时递归向上冒泡**：标记节点为 `done` 后，如果父节点的所有子节点都已终结（`done`/`pruned`/`superseded`），父节点自动标记为 `done`，递归向上
- **规则3 — 进行中递归向上传播**：标记节点为 `in_progress` 后，父链上 `planned` 和 `done` 的祖先都自动设为 `in_progress`（`done→in_progress` 为重新打开语义）
- **规则4 — 完成时警告未完成子项**：标记拥有未完成子项的节点为 `done` 时，生成警告但不阻止操作

所有联动变更遵循透明原则，在工具返回中通过 `<cascade_updates>` 和 `<warnings>` 明确列出受影响的节点。

**涉及文件**：

- `src/core/intent-tree/types.ts` — 新增 `CascadeUpdate`、`UpdateNodeResult` 类型
- `src/core/intent-tree/IntentTree.ts` — 新增 4 个联动方法，修改 `addNode`/`updateNode` 返回值
- `src/core/tools/AddIntentTool.ts` — 集成联动结果到 XML 返回
- `src/core/tools/UpdateIntentTool.ts` — 集成联动结果和警告到 XML 返回
- `src/core/tools/CommitIntentTool.ts` — 集成联动结果和警告到 XML 返回
- `src/core/intent-tree/__tests__/cascade.spec.ts` — 新增 24 个联动测试用例

## [3.52.7] - 2026-02-27

### 🔧 Agent-as-Tool 专有系统提示词

将 4 个 agent-as-tool 工具从共享 system-prompt + todo 控制方式，改为每个工具配置专有系统提示词。

- **基础设施**：
    - `CreateTaskOptions` 新增 `systemPromptOverride` 字段
    - `Task.getSystemPrompt()` 支持 override 时 early return，跳过模式提示词拼接
    - `delegateParentAndOpenChild` 透传 `systemPromptOverride`，`initialTodos` 改为可选
- **咨询专家** (`ConsultExpertTool`)：邮件场景 + deep-thinking 风格提示词，按 consultType 注入方法论指导，专家先写入 `.roo/expert-output/` 再 attempt_completion 引用
- **代码编辑** (`ApplyEditTool`)：纯代码编辑规范（读→改→验证），不增加额外约束
- **工具构建** (`BuildToolTool`)：工具构建规范（单一职责 + 输出限制 + 存放位置指导）
- **项目搜索** (`SearchProjectTool`)：LSP 优先的分析方法（find_definition/find_usages 优先于文本搜索）
- **模式变更**：expert 模式 groups 新增 `edit`（支持写入文档）
- **移除**：所有工具的 `buildTodos` 方法和 todo 构建逻辑，行为指导融入系统提示词

### 🎨 Subagent 工具 UI 渲染

为 4 个 delegation 工具（consultExpert、applyEdit、buildTool、searchProject）添加 ChatRow UI 渲染，与 newTask 风格一致。

- **ClineSayTool 类型**：新增 4 个工具名和 delegation 工具字段（domain、topic、context、instruction、files、requirement、consultType）
- **ChatRow**：为每个工具添加专属图标和内容展示（mortar-board/edit/tools/search）
- **childIds 匹配修复**：提取统一的 delegation 工具集合，修复 newTask 只匹配自身导致的索引错位问题
- **i18n**：新增 subtask 工具标签翻译

## [3.52.5] - 2026-02-24

### 🐛 修复 update_intent 工具字符串 "null" 污染节点内容

- **问题**：工具描述示例中使用 `content: null` 引导模型在不需要更新 content 时传入字符串 `"null"`，导致节点描述被覆盖为 "null"
- **修复**：
    - `update_intent.ts`：移除示例中的 `content: null` 和 `status: null`，改为省略不需要的可选参数
    - `UpdateIntentTool.ts`：执行层过滤字符串 `"null"` 的 content，视为未提供

### 🧪 SPIRIT v5.1：重度推理模式实验

基于《The Molecular Structure of Thought》论文，将系统提示词从"Soul Document"声明式模式改为重度推理模式。

- **核心变化**：从 3 个 Value 直接声明规则 → 6 个 Fact 通过 9 条推理链自然导出 11 个行为结论
- **新增 F6**（用户看不到思考过程）：渗透所有推理链，强化读代码、多假设、外化验证等行为
- **推理结构**：每条链包含 Deep Reasoning / Self-Reflection / Self-Exploration 三种思维模式的元认知振荡
- **专家审查修复**：区分 ask 的两种模式（信息获取 vs 沟通）、降低反思比例、增加 Normal Operation、诚实标注 Intent Tree 格式为设计决策
- **实验文档**：`docs/deep-thinking/SPIRIT-v5-重度推理实验记录.md`

## [3.52.2] - 2026-02-24

### 🐛 修复终端输出样式

- **问题**：commit `618aa6652`（"Inline terminal rendering parity with the VSCode Terminal"）将命令输出从 `CodeBlock` 替换为 `TerminalOutput` 组件，但新组件直接使用了 `--vscode-editor-font-size` 和 `--vscode-editor-line-height` CSS 变量，导致终端输出字体与编辑器一样大，且没有高度限制
- **修复**：
    - `TerminalOutput.tsx`：`fontSize` 从 `var(--vscode-editor-font-size)` 改为 `0.85em`（相对字体），`lineHeight` 从 `var(--vscode-editor-line-height)` 改为 `1.2`（紧凑行距）
    - `CommandExecution.tsx`：OutputContainer 展开时从 `max-h-[100%]` 改为 `max-h-[500px] overflow-y-auto`，与 CodeBlock 的 window shade 默认高度一致

## [3.52.1] - 2026-02-24

### 📝 工具描述统一优化

按照 `工具描述优化2.md` 文档，统一所有 20 个启用工具的描述模式：

- **描述结构统一**：工具描述 = 能力描述 + When to Use（场景+example 紧密配对），参数描述 = 具体参数含义
- **示例格式统一**：所有示例使用 `tool_name({ param: "value" })` 函数调用风格，不再使用 markdown 代码块或 JSON 对象格式
- **参数说明归位**：将工具描述中的 `Parameters:` 段落移到各参数的 `description` 字段中
- **删除 markdown 格式指令**：移除 `apply_diff` 的 "Use Markdown code block format" 说明、`write_to_file` 的 markdown 代码块示例、`update_todo_list` 的 markdown 格式说明
- **精简冗长描述**：`codebase_search` 移除 CRITICAL 段落、`edit` 精简使用说明、`generate_image` 移除参数段落
- **intent 工具自包含**：`add_intent` 保留教学内容（constraint vs implementation、node types、atomicity rule、intent drift），因为 intent 工具仅在少数模式中可用，需要自包含

涉及文件：`native-tools/` 下的 `codebase_search.ts`、`find_definition.ts`、`find_usages.ts`、`read_media.ts`、`generate_image.ts`、`edit.ts`、`execute_command.ts`、`search_project.ts`、`apply_edit.ts`、`consult_expert.ts`、`build_tool.ts`、`add_intent.ts`、`update_intent.ts`、`prune_intent.ts`、`commit_intent.ts`、`restructure_intent.ts`、`ask_followup_question.ts`、`attempt_completion.ts`、`update_todo_list.ts`、`skill.ts`、`write_to_file.ts`、`apply_diff.ts`

### 🐛 修复 commit_intent 执行顺序

- **问题**：`commit_intent` 先 git commit，再更新 intent-tree.json（bindCode + updateNode + save），导致每次 commit 后 intent-tree.json 都是 dirty 状态
- **修复**：commit 后更新 intent-tree.json，然后 `git add .roo/intent-tree.json && git commit --amend --no-edit` 将更新后的文件追加到同一个 commit
- 涉及文件：`CommitIntentTool.ts`

## [3.52.0] - 2026-02-24

### 🔀 上游同步 (upstream/main → v3.50.4)

合并上游 62 个提交，主要变更：

- **AI-SDK 回退**：上游 revert 了 AI-SDK 迁移（约 152 个提交），随后通过 3 批 cherry-pick 重新应用非 AI-SDK 的功能和修复
- **新模型支持**：Claude Sonnet 4.6、Gemini 3.1 Pro、MiniMax M2.5、GPT-5.3 Codex Spark、恢复 Unbound provider
- **execute_command 超时参数**：Agent 可指定每条命令的超时秒数，超时后命令转后台运行
- **TaskHistoryStore**：per-task 文件历史存储，解决多 VSCode 窗口并发写入 globalState 数据丢失
- **per-workspace 索引控制**：每个工作区独立的索引开关和停止/取消控制
- **文件变更面板**：每个对话显示文件变更面板，header 显示聚合的 +/- 行数
- **内联终端 ANSI 渲染**：修复内联终端输出的 ANSI 转义码渲染
- **Vertex/Gemini 工具偏好**：禁用 apply_diff，启用 edit 工具
- **翻译和冲突解决 Skills**：提取为可复用的 skill + slash command
- **移除 Roomote Control**：完全移除远程控制功能
- **Bug 修复**：Bedrock prompt caching、OpenAI 响应处理、MCP 初始化等待、condensation summary 保留等

冲突解决：多入口 delegation 逻辑适配到 Anthropic 原始消息格式，移除 RooMessage 格式依赖。

### 🗑️ 移除 Markdown 工具调用模式

基于实践验证，markdown 工具调用模式（`MarkdownToolParser`）基于对原生工具调用的错误理解，完全不需要：

- 原生工具调用使用 XML-like 格式，不存在 JSON 转义问题
- 原生工具调用支持流式输出

删除文件：`MarkdownToolParser.ts`、`MarkdownToolParser.spec.ts`、`apply-diff-merge.spec.ts`、`markdown-tool-history.spec.ts`
清理：Task.ts（markdownToolParser、pendingApplyDiff、flushPendingApplyDiff、markdownToolResults、isMarkdownTool 过滤）、tools.ts（isMarkdownTool 属性）

## [3.51.6] - 2026-02-20

### 🐛 修复

- **sanitizeToolUseId 误清洗 OpenAI 原生 ID**：OpenAI 原生 tool call ID（以 `call_` 开头）被 `sanitizeToolUseId` 的字符替换逻辑修改，导致 tool-result 找不到对应的 tool-call。修复：若 ID 以 `call_` 开头，直接返回原值跳过清洗
- **意图树 extract_common_parent 崩溃**：`handleExtractCommonParent` 中 sequential reparent 使用 shortId 而非 UUID，导致节点查找失败。修复：在 reparent 前将 shortId 解析为 UUID

### 🔧 consult_expert 工具重设计

- **定位转型**：从"问题诊断"转向"赋能"——"Teach me to fish" not "Fish for me"
    - 工具不再接受具体问题（"我的代码对吗？""该选 A 还是 B？"），只接受知识/方法论/最佳实践的获取请求
    - 从根本上消除 XY 问题：当工具本身不接受具体问题时，模型无法把实现细节塞进去寻求确认
- **参数精简**：从 7 个参数（domain/topic/ultimateGoal/currentApproach/context/question/consultType）精简为 5 个（domain/topic/context/attachments/consultType）
    - 删除 `question` 字段（确认偏误的温床）
    - 删除 `ultimateGoal`/`currentApproach`/`knownContext`/`unknownPoints`（具体问题诊断相关）
    - 保留 `topic`（重新定义为"想学习的知识类别"）和 `context`（重新定义为"为什么需要这个知识"）
- **consultType 重新定义**：从 analysis/design/comparison/recommendation 改为 `principles`/`best-practices`/`methodology`/`standards`，全部面向知识获取
- **参数描述认知脚手架**：每个参数描述包含 ✅/❌ 对比示例，引导模型正确填写
- **Bug 修复**：修复工具定义参数（ultimateGoal/currentApproach）与执行侧参数（knownContext/unknownPoints）完全不一致的问题，之前 LLM 填写的目标信息在解析时被丢弃
- **expert 模式同步**：更新 `packages/types/src/mode.ts` 中 expert 模式的 roleDefinition 和 customInstructions，对齐赋能定位，明确禁止"帮你解决具体 bug"和"你的方案是对的"式回答
- 涉及文件：`consult_expert.ts`、`ConsultExpertTool.ts`、`NativeToolCallParser.ts`、`tools.ts`、`mode.ts`

## [3.51.5] - 2026-02-16

### 🌳 意图树 (Intent Tree)

- **注入策略优化**：将 `intentTreeUpdated` 从 boolean 改为三级标记（`structural` / `minor` / `false`），只在结构性变化时注入完整树摘要
    - `restructure_intent`（reparent/promote/extract）→ `structural`：shortId 可能大规模变化，需要完整树
    - `add_intent` / `update_intent` / `prune_intent` / `commit_intent` → `minor`：工具返回值已足够说明变更
    - 减少不必要的注意力偏移和 token 消耗

## [3.51.3] - 2026-02-13

### 🐛 修复

- **Native Tool Calling 循环中断**：修复 `#11409` (RooMessage migration) 引入的 bug，native tool call 执行成功后 `pendingToolResults` 被 flush 到历史记录，但 `userMessageContent` 为空导致栈不推入，循环提前退出，触发误报 `[ERROR] You did not use a tool`
    - 根因：`pushToolResultToUserContent()` 改为推入 `pendingToolResults` 而非 `userMessageContent`，但栈推入条件未同步更新
    - 新增 `toolResultsSavedToHistory` 标志追踪 flush 状态
    - 新增栈推入分支：当 `didToolUse && toolResultsSavedToHistory` 时继续循环
    - 新增 debug 日志：`!didToolUse` 时输出 `assistantMessageContent` 详细状态

## [3.51.0] - 2026-02-13

### 🌳 意图树 (Intent Tree)

- **术语统一**：将 subgoal/path 重命名为 objective/approach，保持意图树节点命名一致性
- **XML 格式增强**：更新意图树 XML 输出格式，增加节点类型和属性说明，增强节点信息和内容清洗逻辑
- **注入机制优化**：优化注入机制减少上下文溢出；更新 `getEnvironmentDetails` 新增 `isUserMessage` 参数以优化注入逻辑
- **节点管理增强**：添加 `placement` 和 `placementReason` 参数到 `add_intent` 工具；同步计数器确保 `addNode` 增量逻辑与重建后状态一致
- **本地化支持**：添加模式管理和意图树的本地化支持
- **行为描述更新**：更新 Spirit 行为描述，明确目标发现和执行流程

### 🔧 工具与提示词

- **ReadMediaTool 重构**：使用 ImagePart 和 TextPart 类型重构，更新 architect 模式下的工具验证测试
- **apply_diff 延迟合并**：实现 apply_diff 块的延迟合并逻辑，优化工具调用处理
- **符号导航增强**：增强符号位置接口，支持完整定义范围和预览截断指示
- **模式角色更新**：更新默认模式的角色定义和自定义指令，增强描述和工作流程
- **工具使用规范**：增加 LSP 优先和 MARKDOWN 修改模式的说明
- **代码清理**：移除未使用的 TOOL_ICONS 导入，优化代码结构

### 🐛 修复

- **ExecuteCommandTool**：修复 `result?.trim()` 空值守卫，添加 CommitIntentTool 审批顺序 TODO

### 🔀 上游同步

- 合并 `upstream/main` @ `b4d9f92b4`（上游版本 v3.47.3，2026-02-13）

## [3.50.4] - 2026-02-09

### 🛠️ 优化工具描述和顺序

- **execute_command 描述精简**：重构工具描述，更清晰地展示使用场景（开发、Git、系统检查、网络请求、CLI 工具），移除冗长的 shell 兼容性说明到参数描述中
- **工具顺序优化**：将 `find_definition` 和 `find_usages` 移到工具列表前部，强化 LSP 代码智能工具优先于 grep 进行符号导航的引导

## [3.50.3] - 2026-02-07

### 🧭 优化 Spirit Hints 提示系统

- 对齐 Spirit Kernel v4.0：主题从 v3.0 的 4 主题（certainty/resultOrientation/honesty/efficiency）更新为 v4.0 的 4 Values（evidence/transparency/realGoal/simplicity）
- 新增通用实操 hints：代码导航（find_definition 优先于 grep）、竞争假设调试法、测试工作流、并行工具调用
- 精简风格从 5 种（maxim/question/scenario/contrast/chain）为 3 种（scenario/contrast/checklist），去除重复内容
- 提示展示频率从每 5 轮提高到每 3 轮
- 清理死代码：删除未使用的 `getSpriteHintByType()` 和独立的 `getSpriteHint()`

## [3.50.2] - 2026-02-07

### 📁 优化 Environment Details 文件列表

- 文件列表改为分层目录树格式，优先展示目录层级架构而非扁平文件列表
- 同目录下相似文件名（≥5个）自动折叠为摘要（如 `<files pattern="*-release.png" count="60"/>`）
- `listFiles` 默认不受 `.gitignore` 过滤，让本地重要目录（`.report/`、`.roo/` 等）出现在文件列表中
- 首次初始化时若无 `.rooignore`，自动从 `.gitignore` 复制一份作为模板供用户调整
- 可通过 `.env` 中 `ROO_RESPECT_GITIGNORE=1` 恢复 gitignore 过滤

## [3.50.1] - 2026-02-06

### 🔧 Tool Naming & Prompt Enhancements

- Renamed tools to `go_to_definition` and `find_references`, updated all related references
- Added `baseInstructions` to `generatePrompt` for enhanced prompt content
- Optimized tool descriptions for command execution and reference finding, improving user experience

## [3.50.0] - 2026-02-05

### ✨ Enhanced Read Media Tool with Focus & Scale Support

The `read_media` tool has been completely redesigned to support dynamic multi-pass image examination, allowing the model to zoom into specific regions for detailed analysis.

#### New Features

- **Single-file interface**: Simplified from `files: Array<{path}>` to `path: string` for cleaner tool calls
- **Focus parameters**: New `focusX` (0-1) and `focusY` (0-1) parameters to specify the center point of interest
- **Scale parameter**: New `scale` (1-8) parameter to zoom into regions (e.g., scale=4 shows 25% of the image)
- **Automatic compression**: All images are compressed to 1024px max dimension to optimize token usage
- **Guided exploration**: Tool returns now include recommendations to examine images with at least 10 focused observations

#### UI Improvements

- **Parameter display**: Shows path, focus coordinates, and scale level in the chat UI
- **Size information**: Displays original size, output size, and cropped region coordinates
- **Image preview**: Shows the actual cropped/processed image that was sent to the model

#### Technical Changes

- Replaced `sharp` (native module) with `jimp` (pure JS) for better VSCode extension compatibility
- Added `calculateCropRegion()` and `processImageWithFocus()` helper functions
- Updated `NativeToolCallParser` to handle new parameter structure
- Added comprehensive test coverage for new functionality

#### Usage Example

```typescript
// 1. Get overview
read_media({ path: "diagram.png" })

// 2. Zoom into bottom-left corner
read_media({ path: "diagram.png", focusX: 0.3, focusY: 0.7, scale: 4 })
```

## [1.107.0]

- feat: Add cli support for linux (#11167)
- feat: migrate xAI provider to use dedicated @ai-sdk/xai package (#11158)
- feat: use custom Base URL for OpenRouter model list fetch (#11154)
- feat: migrate SambaNova provider to AI SDK (#11153)
- fix: transform tool blocks to text before condensing (EXT-624) (#10975)
- fix(code-index): remove deprecated text-embedding-004 and migrate to gemini-embedding-001 (#11038)
- feat(api): migrate Mistral provider to AI SDK (#11089)
- fix: queue messages during command execution instead of losing them (#11140)
- IPC fixes for task cancellation and queued messages (#11162)

## [3.46.1-local-3.48.0] - 2026-02-02

- ✨ Read Media Tool: Add `read_media` tool for multimodal agent image reading
    - Dedicated tool for reading image files (PNG, JPG, JPEG, GIF, BMP, SVG, WEBP, ICO, AVIF)
    - Controlled by `supportsImages` model capability flag (same as read_file image support)
    - Respects user-configured `maxImageFileSize` and `maxTotalImageSize` settings
    - Added to `read` tool group for proper mode filtering
    - Added to `isReadOnlyToolAction` for auto-approval support with "Always Allow Read-Only" setting
    - Replaces image reading functionality from removed `read_file` tool
- 🔧 Symbol Navigation: Enhance `go_to_definition` with better context and re-export tracing
    - Now includes 5 lines before and after the definition for better context
    - Added line numbers to preview for easier navigation
    - Auto-trace re-exports: when definition lands in a barrel/index file, automatically follow the export chain to find the actual source definition

## [3.46.1-local-3.47.2] - 2026-02-02

- ✨ Delegation Tool: Introduce delegation tool support and registry for agent-as-tool workflows
- ✨ Build Tool: Add build_tool functionality for creating reusable CLI tools
- ✨ CLI Output Truncation: Add truncation handler and integrate with command execution
- 🔧 .gitignore: Add entries for roo cache, temp files, and CLI output
- 🐛 Symbol Navigation: Auto-trace to definition when finding references from import
- 💄 Symbol Navigation: Add max-height and scroll to references list
- 📝 Tool Descriptions: Clarify priority of symbol navigation tools over grep
    - `go_to_definition`: Add "Priority over grep" section for clearer tool selection
    - `find_references`: Add "Priority over grep" section for clearer tool selection
    - `execute_command`: Add note that grep is for text patterns, symbol navigation should use dedicated tools
- 🔧 build_tool: Apply "Agent as Tool" principle - remove agent/delegate semantics from description
    - Tool now presents as a capability that "handles automatically" rather than "delegates to agent"
    - Added "Returns" section to clarify expected output format
- 🔧 BuildToolTool: Add explicit output limits reminder in task message
    - Emphasize text truncation (2000 chars) and image size limits (800x600)
    - Include --focus and --scale parameters for progressive exploration

## [3.46.1-local-3.47.1] - 2026-02-01

- 🐛 NativeToolCallParser: Fix missing tool cases for partial/non-partial modes
    - Added `read_command_output` and `access_mcp_resource` to partial mode
    - Added `search_project` and `apply_edit` to non-partial mode
- ✨ apply_edit: Enhance tool description and validate parameter
    - Simplified description to focus on selection criteria (vs apply_diff)
    - `validate` parameter now accepts custom commands (e.g., "npm run check", "pytest")
    - Default behavior: sub-agent chooses appropriate validation based on project type
- ✨ apply_diff: Simplify tool description for clearer usage guidance

## [3.46.1-local-3.47.0] - 2026-02-01

- 🧭 Symbol Navigation: Implement symbol navigation service with go-to-definition and find-references lookup
    - Enhanced UI formatting for symbol navigation results
    - Removed unused state management for cleaner code
- 🔧 Tool Groups: Replace file reading and searching tools with CLI command tools for better efficiency
- 🧠 Spirit Kernel: Update core principles and behavioral guidance structure
- 👤 Mode Roles: Enhance solo developer and expert role definitions

## [3.46.1-local-3.46.3] - 2026-01-30

- 🧠 AST Code Intelligence: Add go-to-definition and find-references support using VS Code's built-in language services
- 🔧 Command Interceptor: Add optimized handlers for `head`, `tail`, `ls`, and `wc` commands
    - `HeadHandler`: Output first N lines or bytes of files
    - `TailHandler`: Output last N lines or bytes of files
    - `LsHandler`: List directory contents with long format, hidden files, and recursion options
    - `WcHandler`: Count lines, words, and characters in files
- 📦 Tool Groups: Refactor tool groups structure and update codebase search implementations

## [3.46.1-local-3.46.2] - 2026-01-30

- 🛠️ Tool Schema Enhancement: Refactor tool descriptions and schemas for better clarity and usability
    - `ask_followup_question`: Add `type` parameter for structured reasoning
    - `consult_expert`: Require `knownContext` and `unknownPoints` for higher quality consultations
    - `write_to_file`: Add `purpose` parameter to clarify intent
    - `search_project`: Enhanced schema documentation
    - `update_todo_list`: Improved usage guidelines
- 🔧 Parser Update: Update `NativeToolCallParser` to handle new tool parameters
- 📝 Documentation: Add tool description optimization guidelines

## [3.46.1-local-3.46.0] - 2026-01-28

- 🎯 Spirit Hint System: Add diverse hint styles for user guidance with cognitive anchors (🧭CERTAINTY, 🧭VALUE, 🧭HONESTY)
- 🔍 Search Project Cache: Add cache management for search results with creation, reading, and expiration checking
- 📝 Suggestion Structure: Update suggestion items with impact descriptions and adjust related components
- 🛠️ Tool Description Optimization: Simplify examples and enhance user guidance
- 📦 Dependencies: Add ai and json-stream-stringify packages
- Fix: Update environment details output format with prefix and content requirements
- Fix: Update tool calling logic to support Markdown tools in parallel
- Fix: Update tool usage logic to support multiple delegate tools
