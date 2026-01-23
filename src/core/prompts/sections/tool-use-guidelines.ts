import { experiments, EXPERIMENT_IDS } from "../../../shared/experiments"

export function getToolUseGuidelinesSection(experimentFlags?: Record<string, boolean>): string {
	// Build guidelines array with automatic numbering
	let itemNumber = 1
	const guidelinesList: string[] = []

	// First guideline is always the same
	guidelinesList.push(`${itemNumber++}. **盘点现状**：梳理现有信息，明确推进任务还缺什么。`)

	guidelinesList.push(
		`${itemNumber++}. **精准选型**：依据任务甄选最优工具（如优先用 \`list_files\` 而非 \`ls\`）。谋定后动，确保工具契合当前步骤。`,
	)

	// Native-only guidelines.
	// Check if multiple native tool calls is enabled via experiment.
	const isMultipleNativeToolCallsEnabled = experiments.isEnabled(
		experimentFlags ?? {},
		EXPERIMENT_IDS.MULTIPLE_NATIVE_TOOL_CALLS,
	)

	if (isMultipleNativeToolCallsEnabled) {
		guidelinesList.push(
			`${itemNumber++}. 若需执行多项操作，可视情况在单条消息中组合使用多个工具，或分多条消息逐步执行。每一步均须基于前一步的结果，严禁臆测执行结果。`,
		)
	} else {
		guidelinesList.push(
			`${itemNumber++}. **步步为营**：多步操作须分批执行。每一步都必须基于上一步的结果，严禁臆测。`,
		)
	}

	guidelinesList.push(
		`${itemNumber++}. **响应反馈**：根据工具执行后的用户反馈（成功、报错、Linter 警告、新输出等）调整决策。利用迭代反馈确保准确性。`,
	)

	const footer = `\n\n严格遵循“步步为营”的原则，且每次使用工具后等待用户反馈，这至关重要。这有助于：
1. 确认每一步成功后再推进。
2. 立即修复新出现的问题或报错。
3. 根据新信息或意外结果调整策略。
4. 确保每一步操作都正确建立在前一步基础之上。

通过仔细考量工具执行后的用户反馈，你可以做出相应调整和明智决策。这种迭代过程有助于确保工作的整体成功率与准确性。`

	return `## 操作准则

${guidelinesList.join("\n")}${footer}`
}
