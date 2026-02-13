# Roo Code Changelog

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
