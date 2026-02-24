# Better Tools：下一代 AI Agent 工具设计白皮书

> 本文档总结了关于 Roo Code 工具系统优化的深度讨论，为下一阶段的开发提供指导。

## 目录

1. [核心问题](#核心问题)
2. [长文本工具的 Markdown 格式优化](#长文本工具的-markdown-格式优化)
3. [专用工具 vs CLI 调用的权衡](#专用工具-vs-cli-调用的权衡)
4. [CLI 代理层：统一解决方案](#cli-代理层统一解决方案)
5. [AST 代码智能：跳转定义与查找引用](#ast-代码智能跳转定义与查找引用)
6. [实现路线图](#实现路线图)

---

## 核心问题

### 当前工具系统的挑战

1. **JSON 转义开销**：`write_to_file` 等工具需要将代码内容作为 JSON 字符串输出，导致：

    - Token 消耗增加 10-20%
    - 模型输出错误率上升（转义遗漏）
    - 偏离模型的训练分布

2. **工具学习成本**：模型需要学习新的工具 schema，而非复用预训练中的 CLI 经验

3. **CLI 输出的"视觉依赖"**：原生 CLI 输出依赖视觉对齐（列对齐、ANSI 颜色），对 LLM 产生"注意力成本"

---

## 长文本工具的 Markdown 格式优化

> 警告：该尝试基于错误的理解和分析。
> 实际证明，完全不需要该优化。

### 问题澄清

#### 1. 工具调用并非json格式

在实践的早期，各个模型都没有原生支持工具调用的时候，模型确实使用 json 格式作为输出内容，通过json解析，实现工具调用。

但是现在模型自己支持工具调用，各个模型实际上使用的是自己的 xml like 调用方式，它们有以下特征：

1. 完全使用自然文本，规避了转义问题
2. 使用过自己定义的特殊tag token，而不仅仅是tag标记（比如deepseek的 deepseek markup language），彻底杜绝解析问题。

也就是说，我们想要解决的问题之一——转义问题本身就是不存在的。

#### 2. 工具调用不能够流式输出

实际上工具调用是支持流式输出的，但是它存在下面的问题：

1. 只能够流式 Record<string,string> 结构，对于嵌套和列表格式，模型会需要等待完整的子项全部输出完毕才流式出块。
2. 当必要参数增多，模型失误率会增加，因为这意味着模型需要关注多个 tag token 的闭合情况。同时似乎也会降低模型的调用意愿。

### 学习到的新东西 / 关键洞察

#### 1. 原生调用格式

实际上对于大部分模型使用的都是 xml like 工具调用，但是在模型的直觉认知层面，json和它所使用的xml结构实际上是等价的。因此在描述工具时，不建议使用：

- 请你使用json格式调用工具
- 请你使用原生调用方式调用工具

而是直接使用：

- 请你调用 xx 工具
- 请你调用 xx

如果需要举例，建议使用

- `函数名称(json)` 的模式说明

---

在认知层面，模型认为提供的工具类似于通过json调用的具名函数

#### 2. 参数设计

模型不喜欢复杂的json schema格式，当存在多个参数、或者需要传递大量内容的情况，应该思考设计 DSL，将所有内容塞入一个（或者几个）参数中。

模型对于生成list的内容也较差，建议使用自定义解析的方式实现（这样还能带来一个潜在的好处就是可以流式生成）

因为不论是 xml 还是 json 格式，都可能给模型带来误解，较好的方式是使用 yaml 或者 markdown 作为基底，然后额外解析处理。

#### 3. 工具定义模式

我个人比较喜欢的工具定义模式为：

- 工具描述： 能力描述 何时使用 和 fewshot
- 参数描述： 具体参数含义

而不是将所有描述都添加进工具描述中，保持：工具描述提供判断依据，参数描述指导具体使用。

### 旧的计划备份

`````markdown
### 问题分析

当前 `write_to_file` 使用 JSON 格式：

```json
{ "path": "src/app.ts", "content": "function foo() {\n  return 1;\n}" }
```

**问题**：

- 换行符需要转义为 `\n`
- 引号需要转义为 `\"`
- 模型在预训练中很少见到这种格式

### 提议的 Markdown 格式

````markdown
```write_to src/app.ts
function foo() {
  return 1;
}
```
````

**优势**：
| 维度 | JSON 格式 | Markdown 格式 |
|------|----------|---------------|
| 转义开销 | 需要转义 `\n`, `\"` | **零转义** |
| 流式支持 | 需要 partial-json 解析器 | **天然支持** |
| 模型输出难度 | 中（需记住转义规则） | **低（原始文本）** |
| 训练分布一致性 | 偏离 | **高度一致** |

### 适用范围

| 工具              | 参数特征             | Markdown 格式价值 |
| ----------------- | -------------------- | ----------------- |
| `write_to_file`   | 大量代码、换行、转义 | **高**            |
| `apply_diff`      | 多行 diff 内容       | **高**            |
| `execute_command` | 单行命令             | **低**（不推荐）  |
| `read_file`       | 简短路径             | **低**（不推荐）  |

### 实现要点

1. **新建 Markdown 解析器**：`src/core/assistant-message/MarkdownToolParser.ts`
2. **处理嵌套代码块**：使用动态 fence 长度（```而非`）
3. **向后兼容**：保留 Native JSON 解析器，两种格式并存
`````

---

## 专用工具 vs CLI 调用的权衡

### 核心洞察

**专用工具的本质是"注意力工程"**——通过控制输出格式，减少 LLM 需要处理的噪音。

### 对比分析

| 维度             | 专用工具                  | CLI 调用         |
| ---------------- | ------------------------- | ---------------- |
| **输出格式**     | 为 LLM 优化               | 为人类视觉优化   |
| **安全边界**     | 强制执行 `.rooignore`     | 无法控制         |
| **输出大小**     | 可控（`MAX_RESULTS=300`） | 不可预测         |
| **Token 效率**   | 高（去除冗余）            | 低（重复信息多） |
| **灵活性**       | 固定参数                  | 完全灵活         |
| **模型学习成本** | 需要学习新 schema         | 复用预训练经验   |

### CLI 输出的"注意力成本"

```
注意力成本 = Token数量 × 噪音比例 × 位置衰减
```

**噪音来源**：
| 类型 | 示例 | 影响 |
|------|------|------|
| ANSI 颜色码 | `\x1b[31mERROR\x1b[0m` | 增加 token，无语义 |
| 视觉对齐空格 | `ls -l` 的列对齐 | 大量空格 token |
| 装饰字符 | `tree` 的 `├──` `└──` | 视觉友好但对 LLM 无意义 |

### 当前设计原则（将被演进）

**黄金法则**：

- **高频、可预测操作** → 专用工具（`search_files`, `list_files`）
- **低频、不可预测操作** → CLI 逃生舱（`execute_command`）

**问题**：这种二分法迫使我们在"模型熟悉度"和"输出质量"之间做选择。

---

## CLI 代理层：统一解决方案

### 核心洞察

**CLI 代理层是"专用工具 vs CLI 调用"问题的统一解决方案**，它融合了两者的优势：

| 维度       | 专用工具              | CLI 调用                 | CLI 代理层                  |
| ---------- | --------------------- | ------------------------ | --------------------------- |
| 模型熟悉度 | 低（需学习新 schema） | **高**（复用预训练经验） | **高**（使用原生 CLI 语法） |
| 输出质量   | **高**（为 LLM 优化） | 低（视觉依赖）           | **高**（拦截后格式化）      |
| 安全边界   | **强制执行**          | 无法控制                 | **强制执行**                |
| 灵活性     | 固定参数              | **完全灵活**             | **完全灵活**                |
| 组合能力   | 无                    | **管道、重定向**         | **管道、重定向**            |

**核心思想**：模型使用熟悉的 CLI 命令，代理层在进程内拦截并优化输出。

### 演进路径

这是一个**渐进式替换方案**：

```
Phase 1: 专用工具 + CLI 逃生舱（当前状态）
         ↓
Phase 2: CLI 代理层拦截常用命令（grep, cat, find...）
         ↓
Phase 3: 逐步废弃专用工具，统一为 CLI 代理
         ↓
Phase 4: 模型只需要学习一个工具：execute_command
```

### 架构设计

**不创建独立 CLI，而是在 Node.js 进程内实现命令语义**

```
AI Agent → "grep pattern file | head -20"
       ↓
   ExecuteCommandTool.execute()
       ↓ 拦截（不重写命令）
   CommandInterceptor.intercept(command, context)
       ↓ 解析管道链
   PipelineExecutor.execute([
     { cmd: "grep", handler: GrepHandler },  // 进程内执行
     { cmd: "head", handler: null }          // 透传执行
   ])
       ↓
   返回格式化结果
```

### 为什么不用"命令重写"方案？

原方案：将 `grep` 重写为 `roogrep`，然后独立实现 `roogrep`

**问题**：状态传递困难
| 方式 | 问题 |
|------|------|
| 环境变量 | 规则可能很长，超出限制 |
| 临时文件 | 竞态条件；清理问题 |
| Unix Socket IPC | 复杂度爆炸 |

**根本原因**：试图用**进程间通信**解决本应在**进程内**解决的问题。

### 推荐架构

#### 1. 命令拦截器

```typescript
// src/core/command-interceptor/CommandInterceptor.ts

interface CommandContext {
	cwd: string
	rooIgnoreController: RooIgnoreController
	outputFormat: "structured" | "raw"
}

class CommandInterceptor {
	private handlers = new Map([
		["grep", new GrepHandler()],
		["cat", new CatHandler()],
		["head", new HeadHandler()],
		["find", new FindHandler()],
	])

	canIntercept(command: string): boolean {
		const baseCommand = this.parseBaseCommand(command)
		return this.handlers.has(baseCommand)
	}

	async intercept(command: string, context: CommandContext): Promise<CommandResult> {
		const handler = this.handlers.get(this.parseBaseCommand(command))!
		return handler.execute(command, context)
	}
}
```

#### 2. 管道执行器

```typescript
// src/core/command-interceptor/PipelineExecutor.ts

class PipelineExecutor {
	async execute(pipeline: string, context: CommandContext): Promise<CommandResult> {
		const commands = this.parsePipeline(pipeline)
		let currentInput = ""

		for (const cmd of commands) {
			if (this.interceptor.canIntercept(cmd)) {
				// 可拦截：进程内执行
				result = await this.interceptor.intercept(cmd, { ...context, stdin: currentInput })
			} else {
				// 不可拦截：真正执行
				result = await this.executeNative(cmd, currentInput)
			}
			currentInput = result.stdout
		}

		return result
	}
}
```

#### 3. 命令处理器示例

```typescript
// src/core/command-interceptor/handlers/GrepHandler.ts

class GrepHandler implements CommandHandler {
	async execute(args: string[], context: CommandContext): Promise<CommandResult> {
		const { pattern, files, flags } = this.parseGrepArgs(args)

		// 1. 过滤被 .rooignore 忽略的文件
		const allowedFiles = files.filter((f) => context.rooIgnoreController.validateAccess(f))

		// 2. 使用 ripgrep 执行实际搜索
		const results = await regexSearchFiles(context.cwd, allowedFiles, pattern)

		// 3. 格式化输出
		return {
			stdout: this.formatAsStructuredOutput(results),
			exitCode: results.length > 0 ? 0 : 1,
		}
	}
}
```

### 架构优势

| 维度       | 命令重写方案 | 进程内拦截方案   |
| ---------- | ------------ | ---------------- |
| 状态传递   | 需要跨进程   | 直接访问内存对象 |
| 管道一致性 | 无法保证     | 单线程顺序执行   |
| 调用者识别 | 需要额外机制 | 天然明确         |
| 可测试性   | 需要集成测试 | 可单元测试       |

---

## AST 代码智能：跳转定义与查找引用

### 问题背景

当前 AI 理解代码的方式是"搜索 + 猜测"：

| 场景         | 当前方案                     | 问题                     |
| ------------ | ---------------------------- | ------------------------ |
| 理解函数实现 | 语义搜索 (`codebase_search`) | 基于文本相似度，可能找错 |
| 重构影响分析 | 正则搜索 (`search_files`)    | 高噪音，容易遗漏         |
| 追踪调用链   | 多次搜索 + 推理              | 效率低，准确性差         |

**核心诉求**：让 AI 能像人类使用 IDE 一样，通过"跳转到定义"和"查找引用"来精确理解代码。

### 现有能力分析

项目已有 tree-sitter AST 解析基础：

| 能力                     | 现状                          | 局限性               |
| ------------------------ | ----------------------------- | -------------------- |
| **tree-sitter AST 解析** | ✅ 30+ 语言 WASM 解析器       | 仅单文件，仅提取定义 |
| **定义提取**             | ✅ 函数/类/方法/接口等        | 无跨文件符号解析     |
| **语义搜索**             | ✅ OpenAI Embeddings + Qdrant | 非精确符号匹配       |
| **LSP 集成**             | ❌ 完全没有                   | —                    |
| **引用查找**             | ❌ 完全没有                   | —                    |

**关键文件**：

- [`src/services/tree-sitter/index.ts`](../../src/services/tree-sitter/index.ts) - AST 解析入口
- [`src/services/tree-sitter/queries/`](../../src/services/tree-sitter/queries/) - 30+ 语言的查询定义

### 技术方案对比

#### 方案 A：直接调用 VSCode LSP API（推荐）

**原理**：VSCode 已经为打开的项目运行了语言服务器，直接调用其 API。

```typescript
// 跳转到定义
const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
	"vscode.executeDefinitionProvider",
	document.uri,
	position,
)

// 查找所有引用
const references = await vscode.commands.executeCommand<vscode.Location[]>(
	"vscode.executeReferenceProvider",
	document.uri,
	position,
	{ includeDeclaration: true },
)
```

| 优点          | 说明                                   |
| ------------- | -------------------------------------- |
| ✅ 零维护成本 | 复用 VSCode 已有的语言服务器           |
| ✅ 高准确性   | TypeScript/Python LSP 有完整的类型推断 |
| ✅ 多语言支持 | 用户安装的语言扩展都可用               |
| ✅ 实现简单   | 几百行代码即可完成                     |

**实现工作量**：**1-2 周**

#### 方案 B：自建符号索引（基于 tree-sitter）

**原理**：扩展现有 tree-sitter 能力，添加引用查询，构建跨文件符号索引。

| 缺点            | 说明                               |
| --------------- | ---------------------------------- |
| ❌ 工作量巨大   | 30+ 语言 × 引用查询 + 符号表       |
| ❌ 准确性有限   | tree-sitter 是语法解析，无类型推断 |
| ❌ 动态语言困难 | JS/Python 的动态特性难以静态分析   |

**实现工作量**：**2-3 个月**（且准确性不如 LSP）

### 推荐方案：VSCode LSP API + 轻量降级

**策略**：

- **主路径**：优先使用 VSCode LSP API
- **降级路径**：LSP 不可用时，使用 tree-sitter + 语义搜索

```typescript
async function findDefinition(symbol: string, file: string, position: Position) {
	// 1. 尝试 LSP
	const lspResult = await tryLspDefinition(file, position)
	if (lspResult) return lspResult

	// 2. 降级到 tree-sitter 定义提取 + 语义搜索
	const semanticResult = await fallbackSearch(symbol)
	return semanticResult
}
```

### 新增工具定义

```typescript
// 工具 1: go_to_definition
{
  name: "go_to_definition",
  description: "跳转到符号的定义位置，获取定义的完整代码",
  parameters: {
    purpose: "调用目的：understand_implementation | trace_import | verify_signature",
    path: "符号所在的文件路径",
    symbol: "必填，要查找定义的符号名称",
    surrounding_code: "可选，包含符号的周围代码片段（用于精确定位，字面文本匹配）",
    start_line: "可选，从哪一行开始搜索（1-based）"
  }
}

// 工具 2: find_references
{
  name: "find_references",
  description: "查找符号的所有引用位置",
  parameters: {
    purpose: "调用目的：impact_analysis | usage_patterns | dead_code_check",
    path: "符号所在的文件路径",
    symbol: "必填，要查找引用的符号名称",
    surrounding_code: "可选，包含符号的周围代码片段（字面文本匹配）",
    start_line: "可选，从哪一行开始搜索（1-based）",
    include_declaration: "可选，是否包含定义本身，默认 true",
    max_results: "可选，最大返回数量，默认 50"
  }
}
```

**设计说明**：

- 使用 `symbol` + `surrounding_code` + `start_line` 的模糊定位方式，而非精确的行号/列号
- 这样设计是因为 LLM 不擅长精确计数行号和列号
- `surrounding_code` 参数允许模型提供符号周围的代码片段，服务层会自动定位符号位置

### 实现架构

```
┌─────────────────────────────────────────────────────────────┐
│                     新增工具层                              │
├─────────────────────────────────────────────────────────────┤
│  go_to_definition    │  find_references    │  find_type_def │
│  ─────────────────────────────────────────────────────────  │
│                    SymbolNavigationService                  │
│  ─────────────────────────────────────────────────────────  │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  VSCode LSP API │  │  Fallback       │                   │
│  │  (Primary)      │  │  (tree-sitter)  │                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### 实现步骤

| 阶段     | 任务                                                | 工作量      |
| -------- | --------------------------------------------------- | ----------- |
| Phase 1  | 实现 `SymbolNavigationService`，封装 VSCode LSP API | 3 天        |
| Phase 2  | 实现 `go_to_definition` 工具                        | 2 天        |
| Phase 3  | 实现 `find_references` 工具                         | 2 天        |
| Phase 4  | 添加降级逻辑（tree-sitter fallback）                | 2 天        |
| Phase 5  | 测试和优化                                          | 3 天        |
| **总计** |                                                     | **约 2 周** |

### 风险和注意事项

| 风险               | 概率 | 缓解措施                  |
| ------------------ | ---- | ------------------------- |
| LSP 响应慢         | 中   | 添加超时（5s），显示进度  |
| 某些语言无 LSP     | 低   | 降级到 tree-sitter + 搜索 |
| 动态语言准确性有限 | 中   | 在工具描述中说明局限性    |

### 预期收益

实现后，AI 将能够：

- 🎯 **精确定位**：不再依赖搜索猜测，直接跳转到定义
- 🔍 **完整分析**：找到所有引用，不遗漏任何调用点
- ⚡ **高效理解**：减少 token 消耗，提升响应速度
- 🛡️ **安全重构**：基于完整的引用信息进行修改

---

## 实现路线图

### 整体演进视图

```
┌─────────────────────────────────────────────────────────────────────┐
│  当前状态                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │ search_files│  │ list_files  │  │execute_cmd  │                  │
│  │ (专用工具)   │  │ (专用工具)   │  │ (CLI透传)   │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ Phase 2-3
┌─────────────────────────────────────────────────────────────────────┐
│  过渡状态                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │ search_files│  │ list_files  │  │     execute_command         │  │
│  │ (保留兼容)   │  │ (保留兼容)   │  │  ┌─────────────────────┐   │  │
│  └─────────────┘  └─────────────┘  │  │   CLI 代理层         │   │  │
│                                     │  │  grep→GrepHandler   │   │  │
│                                     │  │  cat→CatHandler     │   │  │
│                                     │  │  其他→透传执行       │   │  │
│                                     │  └─────────────────────┘   │  │
│                                     └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ Phase 4+
┌─────────────────────────────────────────────────────────────────────┐
│  目标状态                                                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    execute_command                           │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │                  CLI 代理层                          │    │    │
│  │  │  grep, find, cat, head, tail, wc, sort, ls...       │    │    │
│  │  │  ↓                                                   │    │    │
│  │  │  优化输出 + 安全边界 + 管道支持                       │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │  未知命令 → 透传执行 + 输出后处理                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  模型只需学习一个工具：execute_command                               │
│  复用预训练中的 CLI 经验，获得优化的输出                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Phase 1: Markdown 格式支持（3-5 人天）

**目标**：优化长文本工具的输入体验

| 任务                 | 文件                                                   | 复杂度 |
| -------------------- | ------------------------------------------------------ | ------ |
| 新建 Markdown 解析器 | `src/core/assistant-message/MarkdownToolParser.ts`     | ⭐⭐⭐ |
| 修改流处理逻辑       | `src/core/task/Task.ts`                                | ⭐⭐   |
| 更新 System Prompt   | `src/core/prompts/tools/native-tools/write_to_file.ts` | ⭐     |
| 前端流式预览         | `webview-ui/src/components/chat/ChatRow.tsx`           | ⭐⭐⭐ |

### Phase 2: CLI 代理层基础（5-7 人天）

**目标**：建立拦截框架，实现核心命令代理

| 任务                             | 复杂度 |
| -------------------------------- | ------ |
| 命令解析器（使用 `shell-quote`） | ⭐⭐   |
| 基础拦截器框架                   | ⭐⭐   |
| `grep` Handler（复用 ripgrep）   | ⭐⭐   |
| `cat`/`head`/`tail` Handler      | ⭐⭐   |
| 集成到 ExecuteCommandTool        | ⭐⭐   |

**里程碑**：模型可以使用 `grep pattern file` 并获得优化输出

### Phase 3: 管道支持（3-5 人天）

**目标**：支持命令组合，释放 CLI 的灵活性

| 任务                    | 复杂度 |
| ----------------------- | ------ |
| 管道解析器              | ⭐⭐⭐ |
| stdin/stdout 传递       | ⭐⭐   |
| 混合执行（拦截 + 透传） | ⭐⭐⭐ |

**里程碑**：模型可以使用 `grep pattern | head -20 | sort`

### Phase 4: 专用工具迁移（持续）

**目标**：逐步将专用工具的功能迁移到 CLI 代理层

| 任务           | 说明                                  |
| -------------- | ------------------------------------- |
| `find` Handler | 替代 `list_files` 的递归搜索功能      |
| `ls` Handler   | 替代 `list_files` 的目录列表功能      |
| 输出格式统一   | 确保代理输出与专用工具质量一致        |
| 废弃专用工具   | 从 System Prompt 中移除，保留向后兼容 |

**里程碑**：模型只需要 `execute_command` 一个工具

### Phase 5: 高级特性（远期）

- 重定向支持（`> file`, `>> file`）
- 命令替换（`$(...)`, `` `...` ``）
- 环境变量展开
- 更多命令 Handler（`awk`, `sed`, `xargs`）

---

## 附录：输出格式设计规范

### LLM 友好的输出格式检查清单

| 检查项   | 好的设计             | 坏的设计               |
| -------- | -------------------- | ---------------------- |
| 文件路径 | 相对路径，每文件一次 | 绝对路径，每行重复     |
| 行号     | 右对齐，固定宽度     | 无对齐或过度对齐       |
| 分隔符   | `----` 或空行        | ANSI 颜色、box drawing |
| 元信息   | 语义 emoji（🔒）     | 视觉装饰（`[INFO]`）   |
| 截断提示 | 明确说明如何获取更多 | 静默截断               |

### 示例：grep 输出格式

**原生 grep**：

```
src/app.ts:5:function processData(data: any) {
src/app.ts:6:  // TODO: Implement error handling
src/app.ts:7:  return processedData;
```

**优化后**：

```
# src/app.ts
  5 | function processData(data: any) {
  6 |   // TODO: Implement error handling
  7 |   return processedData;
----
```

**优势**：

- 文件名只出现一次（减少 token）
- 行号右对齐（结构清晰）
- `----` 分隔符（明确边界）

---

## 参考资料

- [Roo Code 工具调用架构](../architecture/01-tools-design.md)
- [NativeToolCallParser 实现](../../src/core/assistant-message/NativeToolCallParser.ts)
- [ExecuteCommandTool 实现](../../src/core/tools/ExecuteCommandTool.ts)
