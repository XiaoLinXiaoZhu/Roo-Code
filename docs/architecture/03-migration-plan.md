# 从旧架构的迁移计划

## 1. 迁移总览

### 1.1 迁移目标

```
┌─────────────────────────────────────────────────────────────┐
│                       迁移路线图                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  阶段一 (Week 1-2)     阶段二 (Week 3)      阶段三 (Week 4)   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ 新工具实现    │ →  │ 兼容层建设    │ →  │ 旧工具移除    │  │
│  │              │    │              │    │              │  │
│  │ • searchProj │    │ • 特性开关    │    │ • new_task   │  │
│  │ • applyEdit  │    │ • A/B测试     │    │ • switch_mod │  │
│  │ • consultExp │    │ • 渐进迁移    │    │   e          │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心原则

| 原则         | 描述                       |
| ------------ | -------------------------- |
| **渐进式**   | 不做大爆炸式切换，逐步迁移 |
| **可回滚**   | 每个阶段都可以安全回退     |
| **可观测**   | 迁移过程有充分的监控和日志 |
| **向后兼容** | 过渡期内新旧架构并存       |

### 1.3 影响范围分析

```typescript
// 需要修改的文件清单
const AFFECTED_FILES = {
	// 核心修改
	"src/core/tools/": [
		"index.ts", // 添加新工具导出
		"SearchProjectTool.ts", // 新增
		"ApplyEditTool.ts", // 新增
		"ConsultExpertTool.ts", // 新增
	],

	// 配置修改
	"src/shared/modes.ts": "添加新工具到工具组",
	"src/shared/tool-groups.ts": "定义新工具组",

	// 提示词修改
	"src/core/prompts/system.ts": "更新工具描述",

	// 可能的轻微修改
	"src/core/task/Task.ts": "工具上下文传递",
	"src/extension/providers/ClineProvider.ts": "特性开关",
}
```

## 2. 阶段一：新工具实现

### 2.1 实现任务清单

| ID  | 任务名称                        | 优先级 | 估时  | 负责人 |
| --- | ------------------------------- | ------ | ----- | ------ |
| P1  | 实现 SearchProjectTool 基础框架 | 高     | 1天   | -      |
| P2  | 实现 ApplyEditTool 基础框架     | 高     | 1天   | -      |
| P3  | 实现 ConsultExpertTool 基础框架 | 高     | 1天   | -      |
| P4  | 实现统一的工具返回格式          | 高     | 0.5天 | -      |
| P5  | 编写单元测试                    | 中     | 2天   | -      |
| P6  | 集成测试                        | 中     | 1天   | -      |

### 2.2 SearchProjectTool 实现细节

#### 2.2.1 核心逻辑

```typescript
// src/core/tools/SearchProjectTool.ts
export class SearchProjectTool extends BaseTool<"search_project"> {
	async execute(params: SearchProjectParams): Promise<SearchProjectResult> {
		// 步骤 1: 验证参数
		this.validateParams(params)

		// 步骤 2: 构建子任务消息
		const taskMessage = this.buildSearchMessage(params)

		// 步骤 3: 委派到 ask 模式的子任务
		const childTaskId = await this.provider.delegateParentAndOpenChild({
			parentTaskId: this.task.taskId,
			message: taskMessage,
			mode: "ask",
			initialTodos: [],
			customInstructions: this.buildAskModeInstructions(params),
		})

		// 步骤 4: 等待子任务完成
		const completion = await this.waitForChildCompletion(childTaskId)

		// 步骤 5: 解析结果
		if (params.schema) {
			return this.extractStructuredData(completion, params.schema)
		}

		return this.parseSearchResult(completion)
	}

	private buildSearchMessage(params: SearchProjectParams): string {
		let message = `你需要调查项目并回答以下问题：\n\n${params.query}`

		if (params.scope?.directories) {
			message += `\n\n搜索范围：${params.scope.directories.join(", ")}`
		}

		if (params.scope?.filePatterns) {
			message += `\n文件模式：${params.scope.filePatterns.join(", ")}`
		}

		return message
	}

	private buildAskModeInstructions(params: SearchProjectParams): string {
		return `
你在一个只读的调查任务中执行。

**你的工具权限：**
- ✅ read_file
- ✅ search_files
- ✅ list_files
- ✅ codebase_search
- ❌ write_to_file（禁止任何编辑操作）
- ❌ apply_diff（禁止任何编辑操作）
- ❌ consultExpert（禁止递归调用）
- ❌ applyEdit（禁止递归调用）

**你的任务：**
1. 调查项目以回答问题
2. 使用 search_files 和 codebase_search 查找相关代码
3. 使用 read_file 阅读关键文件
4. 如果有 schema 要求，按该格式组织结果
5. 完成调查后，使用 attempt_completion 返回结果

**输出要求：**
- 如果有 schema，严格按 schema 格式返回 JSON
- 如果没有 schema，返回结构化的文本报告
- 包含相关的代码片段和文件路径
		`.trim()
	}
}
```

#### 2.2.2 测试用例

```typescript
describe("SearchProjectTool", () => {
	test("应该能够搜索项目结构", async () => {
		const tool = new SearchProjectTool(/* ... */)
		const result = await tool.execute({
			query: "这个项目使用哪些主要技术栈？",
		})

		expect(result.success).toBe(true)
		expect(result.findings).toBeDefined()
		expect(result.summary).toBeDefined()
	})

	test("应该支持 schema 参数进行结构化返回", async () => {
		const tool = new SearchProjectTool(/* ... */)
		const result = await tool.execute({
			query: "列出所有 API 端点",
			schema: {
				type: "array",
				items: {
					type: "object",
					properties: {
						method: { type: "string" },
						path: { type: "string" },
					},
				},
			},
		})

		expect(result.success).toBe(true)
		expect(Array.isArray(result.structuredData)).toBe(true)
	})

	test("应该在 ask 模式下禁止编辑操作", async () => {
		const tool = new SearchProjectTool(/* ... */)
		// 尝试调用被禁止的工具应该被拦截
	})
})
```

### 2.3 ApplyEditTool 实现细节

#### 2.3.1 核心逻辑

```typescript
// src/core/tools/ApplyEditTool.ts
export class ApplyEditTool extends BaseTool<"apply_edit"> {
	async execute(params: ApplyEditParams): Promise<ApplyEditResult> {
		// 步骤 1: 验证参数
		this.validateParams(params)

		// 步骤 2: 创建记录点（用于回滚）
		const checkpointId = await this.createCheckpoint()

		try {
			// 步骤 3: 构建编辑任务消息
			const taskMessage = this.buildEditMessage(params)

			// 步骤 4: 委派到 code 模式的子任务
			const childTaskId = await this.provider.delegateParentAndOpenChild({
				parentTaskId: this.task.taskId,
				message: taskMessage,
				mode: "code",
				initialTodos: this.buildTodos(params),
				customInstructions: this.buildCodeModeInstructions(params),
			})

			// 步骤 5: 等待子任务完成
			const completion = await this.waitForChildCompletion(childTaskId)

			// 步骤 6: 收集修改的文件
			const filesModified = await this.collectModifiedFiles(checkpointId)

			// 步骤 7: 可选的校验
			if (params.validate !== false) {
				const validation = await this.runValidation(filesModified)
				if (!validation.passed) {
					// 校验失败，回滚
					await this.rollbackCheckpoint(checkpointId)
					return {
						success: false,
						summary: "代码校验失败",
						validationPassed: false,
						errors: validation.errors,
					}
				}
			}

			return {
				success: true,
				summary: completion.message || "编辑完成",
				filesModified,
				validationPassed: true,
			}
		} catch (error) {
			// 发生错误，回滚
			await this.rollbackCheckpoint(checkpointId)
			throw error
		}
	}

	private buildEditMessage(params: ApplyEditParams): string {
		let message = `你需要按照以下指令编辑代码：\n\n${params.instruction}`

		if (params.files && params.files.length > 0) {
			message += `\n\n需要修改的文件：\n${params.files.map((f) => `- ${f}`).join("\n")}`
		}

		if (params.context) {
			message += `\n\n额外上下文：\n${params.context}`
		}

		return message
	}

	private buildCodeModeInstructions(params: ApplyEditParams): string {
		let instructions = `
你在一个代码编辑任务中执行。

**你的工具权限：**
- ✅ read_file
- ✅ write_to_file
- ✅ apply_diff
- ✅ search_files
- ✅ list_files
- ❌ consultExpert（禁止递归调用）
- ❌ searchProject（禁止递归调用）

**你的任务：**
1. 理解编辑指令
2. 使用 read_file 阅读需要修改的文件
3. 使用 write_to_file 或 apply_diff 进行修改
4. 完成后使用 attempt_completion 返回结果
		`.trim()

		if (params.files && params.files.length > 0) {
			instructions += `\n\n**文件限制：**\n你只能修改以下文件：\n${params.files.map((f) => `- ${f}`).join("\n")}`
		}

		return instructions
	}
}
```

#### 2.3.2 测试用例

```typescript
describe("ApplyEditTool", () => {
	test("应该能够修改文件", async () => {
		const tool = new ApplyEditTool(/* ... */)
		const result = await tool.execute({
			instruction: "把按钮颜色改成红色",
			files: ["src/components/Button.tsx"],
		})

		expect(result.success).toBe(true)
		expect(result.filesModified).toContain("src/components/Button.tsx")
	})

	test("校验失败时应该回滚", async () => {
		const tool = new ApplyEditTool(/* ... */)
		const result = await tool.execute({
			instruction: "故意制造语法错误",
			files: ["src/test.ts"],
			validate: true,
		})

		expect(result.success).toBe(false)
		expect(result.validationPassed).toBe(false)
	})

	test("应该在 code 模式下禁止 consultExpert", async () => {
		const tool = new ApplyEditTool(/* ... */)
		// 尝试调用被禁止的工具应该被拦截
	})
})
```

### 2.4 ConsultExpertTool 实现细节

#### 2.4.1 核心逻辑

```typescript
// src/core/tools/ConsultExpertTool.ts
export class ConsultExpertTool extends BaseTool<"consult_expert"> {
	async execute(params: ConsultExpertParams): Promise<ConsultExpertResult> {
		// 步骤 1: 验证参数
		this.validateParams(params)

		// 步骤 2: 根据 domain 构建专家角色
		const expertPrompt = this.buildExpertPrompt(params.domain, params.outputFormat)

		// 步骤 3: 构建咨询消息
		const taskMessage = this.buildConsultMessage(params)

		// 步骤 4: 委派到 expert 模式的子任务
		const childTaskId = await this.provider.delegateParentAndOpenChild({
			parentTaskId: this.task.taskId,
			message: taskMessage,
			mode: "expert",
			initialTodos: [],
			customInstructions: this.buildExpertModeInstructions(params),
			modeOverrides: {
				roleDefinition: expertPrompt,
			},
		})

		// 步骤 5: 等待子任务完成
		const completion = await this.waitForChildCompletion(childTaskId)

		// 步骤 6: 解析专家意见
		return this.parseExpertOpinion(completion, params.outputFormat)
	}

	private buildExpertPrompt(domain: string, outputFormat?: string): string {
		let prompt = `你是一位 ${domain} 领域的资深专家。`

		if (outputFormat === "design") {
			prompt += `\n\n你擅长架构设计和技术方案设计。你的输出应该清晰、可执行、考虑周全。`
		} else if (outputFormat === "comparison") {
			prompt += `\n\n你擅长技术方案对比和分析。你的输出应该客观、基于事实、给出明确建议。`
		} else if (outputFormat === "recommendation") {
			prompt += `\n\n你擅长提供实践建议和最佳实践。你的输出应该具体、可操作、有优先级。`
		}

		prompt += `
\n\n**你的角色：**
- 基于专业知识提供深思熟虑的建议
- 考虑多种方案和权衡
- 识别潜在风险和注意事项
- 提供清晰、可执行的建议

**你的限制：**
- 不能修改任何文件
- 不能执行任何代码
- 只能进行分析和建议
		`.trim()

		return prompt
	}

	private buildConsultMessage(params: ConsultExpertParams): string {
		let message = `**主题：** ${params.topic}\n\n**问题：** ${params.question}`

		if (params.attachments && params.attachments.length > 0) {
			message += `\n\n**附件：**\n${params.attachments.map((a) => `- ${a}`).join("\n")}`
		}

		return message
	}

	private buildExpertModeInstructions(params: ConsultExpertParams): string {
		return `
你在一个专家咨询任务中执行。

**你的工具权限：**
- ✅ read_file
- ✅ search_files
- ✅ list_files
- ✅ codebase_search
- ✅ searchProject
- ❌ write_to_file（禁止编辑）
- ❌ apply_diff（禁止编辑）
- ❌ consultExpert（禁止递归）
- ❌ applyEdit（禁止编辑）

**你的任务：**
1. 理解咨询主题和问题
2. 使用 searchProject 和 read_file 了解相关上下文
3. 基于你的专业领域知识提供深入分析
4. 考虑多种方案，识别风险
5. 使用 attempt_completion 返回你的意见

**输出格式要求：**
- 提供简明的意见摘要
- 列出具体的建议
- 识别注意事项和风险点
		`.trim()
	}
}
```

#### 2.4.2 测试用例

```typescript
describe("ConsultExpertTool", () => {
	test("应该能够提供专家意见", async () => {
		const tool = new ConsultExpertTool(/* ... */)
		const result = await tool.execute({
			domain: "前端架构",
			topic: "状态管理方案",
			question: "对于中大型应用，应该选择哪个状态管理方案？",
			outputFormat: "comparison",
		})

		expect(result.success).toBe(true)
		expect(result.opinion).toBeDefined()
		expect(result.recommendations).toBeDefined()
	})

	test("应该在 expert 模式下禁止编辑操作", async () => {
		const tool = new ConsultExpertTool(/* ... */)
		// 尝试调用被禁止的工具应该被拦截
	})
})
```

### 2.5 统一工具基类

```typescript
// src/core/tools/BaseTool.ts
export abstract class BaseTool<TToolName extends string> {
	constructor(
		protected readonly task: Task,
		protected readonly provider: ClineProvider,
	) {}

	abstract execute(params: unknown): Promise<ToolResult>

	protected validateParams(params: unknown): void {
		// 参数验证逻辑
	}

	protected async waitForChildCompletion(childTaskId: string): Promise<TaskCompletion> {
		// 等待子任务完成的逻辑
	}

	protected async createCheckpoint(): Promise<string> {
		// 创建记录点的逻辑
	}

	protected async rollbackCheckpoint(checkpointId: string): Promise<void> {
		// 回滚记录点的逻辑
	}
}
```

## 3. 阶段二：兼容层建设

### 3.1 特性开关设计

#### 3.1.1 配置结构

```typescript
// src/shared/config.ts
export interface RooCodeConfig {
	/**
	 * 是否启用新的 Agent as Tools 架构
	 * @default false
	 */
	agentAsToolsEnabled?: boolean

	/**
	 * A/B 测试分组（0-100）
	 * 0-49: 使用旧架构
	 * 50-100: 使用新架构
	 * @default 0
	 */
	abTestGroup?: number

	/**
	 * 强制使用特定工具
	 */
	forceTools?: {
		searchProject?: boolean
		applyEdit?: boolean
		consultExpert?: boolean
	}
}
```

#### 3.1.2 渐进式启用策略

```typescript
// src/extension/providers/ClineProvider.ts
class ClineProvider {
	private shouldUseNewArchitecture(): boolean {
		const config = this.getConfig()

		// 1. 显式开关优先
		if (config.agentAsToolsEnabled !== undefined) {
			return config.agentAsToolsEnabled
		}

		// 2. A/B 测试分组
		if (config.abTestGroup !== undefined) {
			return config.abTestGroup >= 50
		}

		// 3. 默认使用旧架构
		return false
	}

	private getAvailableTools() {
		if (this.shouldUseNewArchitecture()) {
			// 新工具组
			return [
				{
					name: "search_project",
					description: "搜索和调查项目代码",
					parameters: {
						/* ... */
					},
				},
				{
					name: "apply_edit",
					description: "编辑和修改代码",
					parameters: {
						/* ... */
					},
				},
				{
					name: "consult_expert",
					description: "咨询专家意见",
					parameters: {
						/* ... */
					},
				},
			]
		} else {
			// 旧工具组
			return [
				{
					name: "new_task",
					description: "创建新的子任务",
					parameters: {
						/* ... */
					},
				},
				{
					name: "attempt_completion",
					description: "完成任务",
					parameters: {
						/* ... */
					},
				},
				{
					name: "switch_mode",
					description: "切换任务模式",
					parameters: {
						/* ... */
					},
				},
			]
		}
	}
}
```

### 3.2 工具注册与路由

```typescript
// src/core/tools/registry.ts
export class ToolRegistry {
	private tools: Map<string, Tool> = new Map()

	register(tool: Tool) {
		this.tools.set(tool.name, tool)
	}

	async execute(toolName: string, params: unknown): Promise<ToolResult> {
		const tool = this.tools.get(toolName)
		if (!tool) {
			throw new Error(`工具不存在: ${toolName}`)
		}

		return await tool.execute(params)
	}

	// 旧工具到新工具的适配器
	private adaptOldToolCall(oldTool: string, params: any): { newTool: string; newParams: any } {
		switch (oldTool) {
			case "new_task":
				// 智能判断应该使用哪个新工具
				if (params.mode === "ask") {
					return { newTool: "search_project", newParams: { query: params.message } }
				} else if (params.mode === "code") {
					return { newTool: "apply_edit", newParams: { instruction: params.message } }
				} else if (params.mode === "expert") {
					return { newTool: "consult_expert", newParams: { topic: "通用咨询", question: params.message } }
				}
				break
			default:
				throw new Error(`未知工具: ${oldTool}`)
		}
	}
}
```

### 3.3 监控与日志

```typescript
// src/core/telemetry/tools.ts
export class ToolTelemetry {
	private events: ToolEvent[] = []

	async trackToolExecution(event: ToolEvent) {
		this.events.push({
			...event,
			timestamp: Date.now(),
			architecture: this.detectArchitecture(),
		})

		// 上报到遥测系统
		await this.sendToTelemetry(event)
	}

	private detectArchitecture(): "old" | "new" | "hybrid" {
		// 检测当前使用的架构类型
		// ...
	}

	async getMetrics(period: TimeRange) {
		return {
			// 新工具使用率
			newToolsUsage: this.calculateUsageRate("new"),
			// 旧工具使用率
			oldToolsUsage: this.calculateUsageRate("old"),
			// 成功率
			successRate: this.calculateSuccessRate(),
			// 平均执行时间
			avgDuration: this.calculateAvgDuration(),
			// 错误率
			errorRate: this.calculateErrorRate(),
		}
	}
}
```

### 3.4 A/B 测试实施

```typescript
// src/core/experiments/ab-testing.ts
export class ABTestingManager {
	private getTestGroup(userId: string): number {
		// 基于用户 ID 的哈希值分配测试组
		const hash = this.hashString(userId)
		return hash % 100
	}

	async isUserInTreatmentGroup(userId: string): Promise<boolean> {
		const group = this.getTestGroup(userId)
		const config = await this.getConfig()

		if (config.abTestThreshold !== undefined) {
			return group >= config.abTestThreshold
		}

		return false
	}

	async getMetricsSummary(): Promise<ABTestMetrics> {
		return {
			treatment: {
				userCount: this.getUserCount("treatment"),
				successRate: this.getSuccessRate("treatment"),
				avgResponseTime: this.getAvgResponseTime("treatment"),
				userSatisfaction: this.getUserSatisfaction("treatment"),
			},
			control: {
				userCount: this.getUserCount("control"),
				successRate: this.getSuccessRate("control"),
				avgResponseTime: this.getAvgResponseTime("control"),
				userSatisfaction: this.getUserSatisfaction("control"),
			},
			significance: this.calculateStatisticalSignificance(),
		}
	}
}
```

### 3.5 渐进式迁移策略

```markdown
### 迁移阶段时间表

| 周次   | 旧架构用户占比 | 新架构用户占比 | 目标                      |
| ------ | -------------- | -------------- | ------------------------- |
| Week 1 | 100%           | 0%             | 新工具开发完成，内部测试  |
| Week 2 | 100%           | 0%             | 内部测试完成，修复 bug    |
| Week 3 | 90%            | 10%            | 开启 A/B 测试（10% 流量） |
| Week 4 | 70%            | 30%            | 扩展到 30% 流量           |
| Week 5 | 50%            | 50%            | 扩展到 50% 流量           |
| Week 6 | 30%            | 70%            | 扩展到 70% 流量           |
| Week 7 | 10%            | 90%            | 扩展到 90% 流量           |
| Week 8 | 0%             | 100%           | 完全切换到新架构          |

### 回滚触发条件

如果出现以下情况之一，立即暂停或回滚：

1. 新架构成功率低于旧架构 5 个百分点
2. 新架构平均响应时间比旧架构慢 50% 以上
3. 用户投诉率上升超过 10%
4. 出现任何数据安全问题
5. 系统稳定性指标下降超过 15%
```

## 4. 阶段三：旧工具移除

### 4.1 移除准备清单

| 检查项              | 状态   | 说明                          |
| ------------------- | ------ | ----------------------------- |
| ✅ 新工具稳定性验证 | 待完成 | 新工具成功率 > 95%，持续 2 周 |
| ✅ 性能对比         | 待完成 | 新架构性能不低于旧架构        |
| ✅ 用户反馈收集     | 待完成 | 正面反馈 > 80%                |
| ✅ 回滚计划验证     | 待完成 | 确认可以安全回滚              |
| ✅ 文档更新         | 待完成 | 所有文档已更新到新架构        |
| ✅ 测试覆盖         | 待完成 | 所有测试用例已更新            |

> **注意：** `attempt_completion` 工具**不会被移除**，它仍然是任务完成的必需机制。

### 4.2 废弃流程

#### 4.2.1 废弃通知阶段（Week 7）

```markdown
### 用户通知

**标题：重要更新：Roo-Code 架构升级通知**

**正文：**

亲爱的用户，

我们即将对 Roo-Code 进行架构升级，以提供更好的性能和用户体验。

**升级时间：** 2026-02-XX

**主要变化：**

- 简化的工具调用方式
- 更快的响应速度
- 更智能的任务处理

**如果您使用的旧 API：**

- `new_task` → 请使用 `search_project`、`apply_edit` 或 `consult_expert`
- `switch_mode` → 新架构自动处理，无需手动切换
- `attempt_completion` → 继续正常使用，无需改变

> **注意：** `attempt_completion` 仍然需要用于任务完成。

**迁移帮助：**
请查阅我们的迁移指南：[链接]
如有问题，请联系支持：[邮箱]

感谢您的理解和支持！
```

#### 4.2.2 废弃警告阶段（Week 8-9）

```typescript
// src/core/tools/deprecated.ts
export class DeprecatedToolWrapper {
	private warnings: Map<string, number> = new Map()

	async execute(oldTool: string, params: any): Promise<ToolResult> {
		// 记录使用次数
		const count = (this.warnings.get(oldTool) || 0) + 1
		this.warnings.set(oldTool, count)

		// 显示警告
		this.showDeprecationWarning(oldTool)

		// 转发到适配器
		const { newTool, newParams } = this.adapter.adaptOldToolCall(oldTool, params)
		return await this.registry.execute(newTool, newParams)
	}

	private showDeprecationWarning(oldTool: string) {
		console.warn(
			`
=========================================
⚠️  废弃警告：${oldTool}
=========================================

该工具已被废弃，请使用新工具：
- new_task → search_project / apply_edit / consult_expert
- switch_mode → 新架构自动处理，无需调用

注意：attempt_completion 仍然有效，继续使用即可。

更多信息请查阅：[迁移指南链接]
=========================================
		`.trim(),
		)
	}
}
```

### 4.3 代码清理

#### 4.3.1 删除的文件

```bash
# 删除旧工具实现
rm src/core/tools/NewTaskTool.ts
rm src/core/tools/SwitchModeTool.ts

# 注意：AttemptCompletionTool.ts 保留，attempt_completion 工具仍然需要

# 删除旧模式定义
rm src/shared/modes.ts

# 删除旧工具组
rm src/shared/tool-groups.ts

# 删除旧提示词
rm src/core/prompts/system-legacy.ts
```

#### 4.3.2 清理依赖

```typescript
// 清理 src/core/tools/index.ts
// 删除旧工具的导出

// 清理 src/extension/providers/ClineProvider.ts
// 移除旧工具相关的代码

// 清理 src/core/prompts/system.ts
// 移除旧工具的系统提示词
```

### 4.4 删除后的验证

```typescript
describe("旧工具移除验证", () => {
	test("应该无法调用已废弃的旧工具", async () => {
		const registry = new ToolRegistry()

		// 尝试调用已删除的工具
		await expect(registry.execute("new_task", { message: "test" })).rejects.toThrow("工具不存在: new_task")

		await expect(registry.execute("switch_mode", { mode: "code" })).rejects.toThrow("工具不存在: switch_mode")
	})

	test("新工具应该正常工作", async () => {
		const registry = new ToolRegistry()

		// 验证所有新工具都可用
		await expect(registry.execute("search_project", { query: "test" })).resolves.toBeDefined()
		await expect(registry.execute("apply_edit", { instruction: "test" })).resolves.toBeDefined()
		await expect(
			registry.execute("consult_expert", { domain: "test", topic: "test", question: "test" }),
		).resolves.toBeDefined()
	})

	test("attempt_completion 仍然可用", async () => {
		const registry = new ToolRegistry()

		// attempt_completion 应该仍然可用
		await expect(registry.execute("attempt_completion", { message: "任务完成" })).resolves.toBeDefined()
	})

	test("应该没有旧工具的残留代码", async () => {
		// 检查代码中没有对已废弃旧工具的引用
		const code = await loadSourceCode()
		expect(code).not.toContain("new_task")
		expect(code).not.toContain("switch_mode")
		// 注意：attempt_completion 应该仍然存在于代码中
	})
})
```

### 4.5 移除后的监控

```typescript
// src/core/monitoring/post-removal.ts
export class PostRemovalMonitor {
	async monitorForWeeks(weeks: number) {
		for (let i = 0; i < weeks; i++) {
			await this.collectMetrics()
			await this.checkForIssues()
			await this.generateReport()

			if (await this.hasCriticalIssues()) {
				console.error("发现严重问题，需要立即处理！")
				await this.notifyTeam()
			}

			await this.sleep(7 * 24 * 60 * 60 * 1000) // 等待一周
		}
	}

	private async collectMetrics() {
		return {
			// 性能指标
			avgResponseTime: await this.getAvgResponseTime(),
			p95ResponseTime: await this.getP95ResponseTime(),
			p99ResponseTime: await this.getP99ResponseTime(),

			// 成功率
			successRate: await this.getSuccessRate(),
			errorRate: await this.getErrorRate(),

			// 用户满意度
			userSatisfaction: await this.getUserSatisfaction(),
			supportTickets: await this.getSupportTicketCount(),

			// 资源使用
			cpuUsage: await this.getCPUUsage(),
			memoryUsage: await this.getMemoryUsage(),
			tokenUsage: await this.getTokenUsage(),
		}
	}

	private async checkForIssues() {
		const issues = []

		const metrics = await this.collectMetrics()

		if (metrics.successRate < 0.95) {
			issues.push({
				severity: "critical",
				message: `成功率过低: ${metrics.successRate}`,
			})
		}

		if (metrics.avgResponseTime > 10000) {
			issues.push({
				severity: "warning",
				message: `平均响应时间过长: ${metrics.avgResponseTime}ms`,
			})
		}

		if (metrics.userSatisfaction < 0.8) {
			issues.push({
				severity: "critical",
				message: `用户满意度过低: ${metrics.userSatisfaction}`,
			})
		}

		return issues
	}
}
```

## 5. 风险评估与回滚计划

### 5.1 风险识别与评估

| 风险 ID | 风险描述             | 概率 | 影响 | 风险等级 | 缓解措施                     |
| ------- | -------------------- | ---- | ---- | -------- | ---------------------------- |
| R01     | 新工具成功率低于预期 | 中   | 高   | 高       | 充分测试，A/B 测试，监控指标 |
| R02     | 用户对新工具不适应   | 高   | 中   | 高       | 详细文档，渐进式迁移，支持   |
| R03     | 性能下降             | 低   | 高   | 中       | 性能测试，优化，资源监控     |
| R04     | 回滚失败             | 低   | 极高 | 中       | 完整的回滚计划，测试回滚流程 |
| R05     | 数据安全问题         | 极低 | 极高 | 低       | 代码审查，安全测试           |
| R06     | 兼容性问题           | 中   | 中   | 中       | 向后兼容层，适配器           |

### 5.2 回滚触发条件

```markdown
### 立即回滚（紧急）

满足以下任一条件，立即回滚：

- [ ] 新架构成功率 < 90%
- [ ] 出现数据安全问题
- [ ] 系统可用性下降 > 20%
- [ ] 用户投诉激增 > 50%
- [ ] 出现无法修复的严重 bug

### 暂停并评估（警告）

满足以下任一条件，暂停迁移并评估：

- [ ] 新架构成功率 < 95%（持续 3 天）
- [ ] 平均响应时间增加 > 30%
- [ ] 用户满意度下降 > 10%
- [ ] 资源使用增加 > 40%
```

### 5.3 回滚流程

#### 5.3.1 回滚前准备

```typescript
// src/core/rollback/preparation.ts
export class RollbackPreparation {
	async prepareRollback() {
		// 1. 备份当前配置
		await this.backupConfiguration()

		// 2. 备份数据库
		await this.backupDatabase()

		// 3. 记录当前状态
		await this.recordCurrentState()

		// 4. 验证回滚脚本
		await this.validateRollbackScripts()

		// 5. 准备回滚通知
		await this.prepareRollbackNotification()
	}
}
```

#### 5.3.2 回滚执行步骤

```markdown
### 回滚步骤（按顺序执行）

**步骤 1：紧急通知（5 分钟内）**

- 通知团队：启动回滚
- 通知用户：临时维护中
- 停止新用户迁移

**步骤 2：切换到旧架构（10 分钟内）**

- 修改配置：agentAsToolsEnabled = false
- 重启服务
- 验证旧架构可用性

**步骤 3：回滚数据变更（30 分钟内）**

- 如有数据迁移，执行反向迁移
- 验证数据完整性
- 重建索引

**步骤 4：回滚代码变更（如有必要）**

- 回退到上一个稳定版本
- 重新部署
- 验证系统功能

**步骤 5：恢复服务（15 分钟内）**

- 移除维护通知
- 监控系统指标
- 收集用户反馈

**步骤 6：事后分析（后续）**

- 分析回滚原因
- 修复问题
- 重新评估迁移计划
```

#### 5.3.3 回滚验证

```typescript
// src/core/rollback/verification.ts
export class RollbackVerification {
	async verifyRollback(): Promise<VerificationResult> {
		const checks = await this.runAllChecks()

		return {
			success: checks.every((c) => c.passed),
			checks,
			summary: this.generateSummary(checks),
		}
	}

	private async runAllChecks(): Promise<Check[]> {
		return [
			// 1. 旧架构工具可用性
			await this.checkOldToolsAvailable(),

			// 2. 配置正确性
			await this.checkConfiguration(),

			// 3. 数据完整性
			await this.checkDataIntegrity(),

			// 4. 性能指标
			await this.checkPerformance(),

			// 5. 用户功能
			await this.checkUserFeatures(),
		]
	}

	private async checkOldToolsAvailable(): Promise<Check> {
		// 验证 old_task, switch_mode 等旧工具可用
		const tools = ["new_task", "switch_mode", "attempt_completion"]
		const results = await Promise.all(tools.map((t) => this.toolRegistry.isAvailable(t)))

		return {
			name: "旧工具可用性",
			passed: results.every((r) => r),
			details: results.map((r, i) => `${tools[i]}: ${r ? "✅" : "❌"}`).join(", "),
		}
	}
}
```

### 5.4 回滚后恢复

```markdown
### 回滚后的恢复计划

**阶段 1：稳定期（3-7 天）**

- 密切监控所有指标
- 收集用户反馈
- 修复紧急问题
- 分析失败原因

**阶段 2：修复期（1-2 周）**

- 修复导致回滚的问题
- 重新进行测试
- 更新迁移计划
- 加强质量保证

**阶段 3：重新评估（1 周）**

- 评估是否继续迁移
- 制定新的迁移策略
- 可能需要重新设计
- 与团队沟通新计划

**阶段 4：再次尝试（按需）**

- 基于新的计划再次尝试
- 采用更保守的策略
- 增加测试和验证
- 更好的监控和预警
```

### 5.5 风险监控仪表板

```typescript
// src/core/monitoring/dashboard.ts
export class RiskMonitoringDashboard {
	async getRiskStatus(): Promise<RiskStatus> {
		const metrics = await this.collectMetrics()

		return {
			overallRisk: this.calculateOverallRisk(metrics),
			risks: this.identifyRisks(metrics),
			recommendations: this.generateRecommendations(metrics),
			triggerLevel: this.determineTriggerLevel(metrics),
		}
	}

	private determineTriggerLevel(metrics: Metrics): "none" | "warning" | "critical" {
		if (metrics.successRate < 0.9) return "critical"
		if (metrics.successRate < 0.95) return "warning"
		if (metrics.responseTimeIncrease > 0.3) return "critical"
		if (metrics.responseTimeIncrease > 0.15) return "warning"
		if (metrics.userSatisfaction < 0.7) return "critical"
		if (metrics.userSatisfaction < 0.8) return "warning"

		return "none"
	}

	private generateRecommendations(metrics: Metrics): string[] {
		const recommendations = []

		if (metrics.successRate < 0.95) {
			recommendations.push("成功率过低，建议检查错误日志")
		}

		if (metrics.responseTimeIncrease > 0.15) {
			recommendations.push("响应时间增加，建议优化性能")
		}

		if (metrics.userSatisfaction < 0.8) {
			recommendations.push("用户满意度下降，建议收集反馈")
		}

		if (metrics.errorRate > 0.05) {
			recommendations.push("错误率过高，建议紧急修复")
		}

		return recommendations
	}
}
```

## 6. 验收标准

### 6.1 功能验收标准

#### 6.1.1 新工具功能完整性

| 工具           | 验收标准                                                                                                          | 测试方法                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| search_project | ✅ 能够搜索项目代码<br>✅ 支持自然语言查询<br>✅ 支持指定搜索范围<br>✅ 支持结构化返回<br>✅ 只读保证（无副作用） | 单元测试<br>集成测试<br>用户验收测试 |
| apply_edit     | ✅ 能够修改代码文件<br>✅ 支持自然语言指令<br>✅ 支持文件范围限制<br>✅ 支持自动校验<br>✅ 校验失败自动回滚       | 单元测试<br>集成测试<br>用户验收测试 |
| consult_expert | ✅ 能够提供专家意见<br>✅ 支持自定义领域<br>✅ 支持多种输出格式<br>✅ 只读保证（无副作用）<br>✅ 防止递归调用     | 单元测试<br>集成测试<br>用户验收测试 |

#### 6.1.2 架构迁移完整性

```typescript
describe("架构迁移验收", () => {
	test("新工具应该完全替代旧工具功能", async () => {
		// 测试 new_task 的功能被新工具覆盖
		const oldTasks = [
			{ mode: "ask", message: "调查项目结构" },
			{ mode: "code", message: "修复这个bug" },
			{ mode: "expert", message: "设计架构" },
		]

		for (const oldTask of oldTasks) {
			const result = await testNewToolEquivalent(oldTask)
			expect(result.success).toBe(true)
		}
	})

	test("旧工具应该在新架构下不可用", async () => {
		const config = { agentAsToolsEnabled: true }
		const registry = new ToolRegistry(config)

		// new_task 和 switch_mode 应该不可用
		await expect(registry.execute("new_task", {})).rejects.toThrow()
		await expect(registry.execute("switch_mode", {})).rejects.toThrow()

		// attempt_completion 仍然可用
		await expect(registry.execute("attempt_completion", {})).resolves.toBeDefined()
	})

	test("应该支持配置切换", async () => {
		// 测试配置切换的实时性
		const config = new ConfigManager()

		// 切换到新架构
		await config.set("agentAsToolsEnabled", true)
		expect(await config.isNewArchitectureEnabled()).toBe(true)

		// 切换回旧架构
		await config.set("agentAsToolsEnabled", false)
		expect(await config.isNewArchitectureEnabled()).toBe(false)
	})
})
```

### 6.2 性能验收标准

| 指标           | 目标值          | 测试方法   | 验收条件       |
| -------------- | --------------- | ---------- | -------------- |
| 新工具成功率   | ≥ 95%           | 统计分析   | 连续 7 天达标  |
| 平均响应时间   | ≤ 旧架构的 100% | 性能测试   | 与旧架构对比   |
| P95 响应时间   | ≤ 旧架构的 120% | 性能测试   | 与旧架构对比   |
| Token 使用效率 | ≥ 旧架构的 110% | Token 分析 | 与旧架构对比   |
| 系统可用性     | ≥ 99.5%         | 监控统计   | 连续 30 天达标 |
| 错误率         | ≤ 5%            | 统计分析   | 连续 7 天达标  |

```typescript
describe("性能验收测试", () => {
	test("响应时间不应该比旧架构慢", async () => {
		const oldMetrics = await measureOldArchitecturePerformance()
		const newMetrics = await measureNewArchitecturePerformance()

		// 平均响应时间不应该增加超过 20%
		expect(newMetrics.avgResponseTime).toBeLessThanOrEqual(oldMetrics.avgResponseTime * 1.2)
	})

	test("Token 使用应该更高效", async () => {
		const oldUsage = await measureOldTokenUsage()
		const newUsage = await measureNewTokenUsage()

		// 新架构应该节省至少 10% 的 token
		expect(newUsage).toBeLessThanOrEqual(oldUsage * 0.9)
	})

	test("成功率应该达到 95% 以上", async () => {
		const successRate = await calculateSuccessRate()
		expect(successRate).toBeGreaterThanOrEqual(0.95)
	})
})
```

### 6.3 用户体验验收标准

| 指标         | 目标值    | 测试方法 | 验收条件           |
| ------------ | --------- | -------- | ------------------ |
| 用户满意度   | ≥ 4.0/5.0 | 用户调查 | 样本量 ≥ 100       |
| 学习曲线降低 | ≥ 30%     | 用户测试 | 新用户上手时间对比 |
| 任务完成率   | ≥ 旧架构  | A/B 测试 | 统计显著性检验     |
| 用户投诉率   | ≤ 旧架构  | 统计分析 | 连续 30 天         |

```typescript
describe("用户体验验收测试", () => {
	test("新用户上手时间应该减少", async () => {
		// 对比新旧架构下新用户的上手时间
		const oldLearningTime = await measureLearningCurve("old")
		const newLearningTime = await measureLearningCurve("new")

		// 新架构应该至少快 30%
		expect(newLearningTime).toBeLessThanOrEqual(oldLearningTime * 0.7)
	})

	test("用户满意度应该达到 4.0 以上", async () => {
		const satisfaction = await collectUserSatisfaction()
		expect(satisfaction.averageScore).toBeGreaterThanOrEqual(4.0)
	})

	test("任务完成率不应该下降", async () => {
		const oldCompletionRate = await measureCompletionRate("old")
		const newCompletionRate = await measureCompletionRate("new")

		// 新架构的任务完成率不应该低于旧架构
		expect(newCompletionRate).toBeGreaterThanOrEqual(oldCompletionRate)
	})
})
```

### 6.4 安全性验收标准

| 安全检查项   | 验收标准              | 测试方法            |
| ------------ | --------------------- | ------------------- |
| 工具权限隔离 | ✅ 严格隔离，禁止递归 | 权限测试            |
| 文件访问控制 | ✅ 保护路径不可写     | 安全测试            |
| 敏感信息保护 | ✅ 无泄露             | 静态分析 + 动态测试 |
| 记录点回滚   | ✅ 100% 可回滚        | 回滚测试            |
| 错误处理     | ✅ 无崩溃             | 边界测试            |

```typescript
describe("安全性验收测试", () => {
	test("search_project 应该禁止编辑操作", async () => {
		const tool = new SearchProjectTool(/* ... */)

		// 尝试使用被禁止的工具
		const result = await tool.execute({
			query: "test",
		})

		// 验证子任务没有执行任何编辑操作
		expect(result.filesModified).toBeUndefined()
	})

	test("apply_edit 校验失败应该回滚", async () => {
		const tool = new ApplyEditTool(/* ... */)

		const result = await tool.execute({
			instruction: "故意制造语法错误",
			files: ["test.ts"],
			validate: true,
		})

		expect(result.success).toBe(false)
		expect(result.validationPassed).toBe(false)
		// 验证文件被回滚
	})

	test("consult_expert 应该禁止编辑操作", async () => {
		const tool = new ConsultExpertTool(/* ... */)

		const result = await tool.execute({
			domain: "test",
			topic: "test",
			question: "test",
		})

		// 验证没有修改任何文件
		expect(result.filesModified).toBeUndefined()
	})
})
```

### 6.5 文档验收标准

```markdown
### 文档清单

- [x] 架构概述文档（00-overview.md）
- [x] 工具设计文档（01-tools-design.md）
- [x] 边界处理文档（02-boundaries.md）
- [x] 迁移计划文档（03-migration-plan.md）
- [x] 系统提示词文档（04-prompts.md）
- [x] 实现计划文档（05-implementation.md）
- [x] 用户迁移指南
- [x] API 文档更新
- [x] 变更日志
```

### 6.6 验收流程

```markdown
### 阶段一：内部验收（Week 2）

**负责人：** 开发团队
**时间：** Week 1-2
**内容：**

- 完成所有单元测试
- 完成所有集成测试
- 通过代码审查
- 通过安全审查
- 通过性能测试

**验收标准：**

- 所有测试通过率 = 100%
- 代码覆盖率 ≥ 80%
- 无严重安全漏洞
- 性能达标

---

### 阶段二：用户验收（Week 3-4）

**负责人：** 产品团队 + 用户代表
**时间：** Week 3-4
**内容：**

- 内部用户试用
- 收集反馈
- 修复问题
- 优化体验

**验收标准：**

- 用户满意度 ≥ 4.0/5.0
- 任务完成率 ≥ 旧架构
- 无阻塞性问题

---

### 阶段三：正式验收（Week 5）

**负责人：** 技术委员会
**时间：** Week 5
**内容：**

- 审查所有测试报告
- 审查用户反馈
- 审查性能指标
- 审查安全报告
- 最终决策

**验收标准：**

- 所有验收标准达标
- 无未解决的高优先级问题
- 获得技术委员会批准
```

### 6.7 最终验收清单

```markdown
### 验收前检查清单

#### 功能性

- [ ] search_project 工具功能完整
- [ ] apply_edit 工具功能完整
- [ ] consult_expert 工具功能完整
- [ ] 工具组合模式正常工作
- [ ] 错误处理完善
- [ ] 回滚机制可靠

#### 性能

- [ ] 成功率 ≥ 95%
- [ ] 响应时间达标
- [ ] Token 使用效率提升
- [ ] 系统稳定性达标

#### 安全性

- [ ] 工具权限隔离有效
- [ ] 文件访问控制完善
- [ ] 无安全漏洞
- [ ] 敏感信息保护到位

#### 用户体验

- [ ] 用户满意度 ≥ 4.0/5.0
- [ ] 学习曲线降低
- [ ] 任务完成率达标
- [ ] 用户反馈正面

#### 文档

- [ ] 所有技术文档完整
- [ ] 用户指南清晰
- [ ] API 文档更新
- [ ] 变更日志完整

#### 运维

- [ ] 监控系统就绪
- [ ] 告警机制完善
- [ ] 日志记录完整
- [ ] 回滚计划验证

**所有项目必须打勾后才能正式发布！**
```

---

下一篇：[04-prompts.md](./04-prompts.md) - 系统提示词设计

---

下一篇：[04-prompts.md](./04-prompts.md) - 系统提示词设计
