# Better Tools：下一代 AI Agent 工具设计白皮书

> 本文档总结了关于 Roo Code 工具系统优化的深度讨论，为下一阶段的开发提供指导。

## 目录

1. [核心问题](#核心问题)
2. [长文本工具的 Markdown 格式优化](#长文本工具的-markdown-格式优化)
3. [专用工具 vs CLI 调用的权衡](#专用工具-vs-cli-调用的权衡)
4. [CLI 代理层：统一解决方案](#cli-代理层统一解决方案)
5. [实现路线图](#实现路线图)

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
