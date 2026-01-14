import { ToolProtocol, TOOL_PROTOCOL } from "@roo-code/types"
import { isNativeProtocol } from "@roo-code/types"

import { experiments, EXPERIMENT_IDS } from "../../../shared/experiments"

export function getToolUseGuidelinesSection(
	protocol: ToolProtocol = TOOL_PROTOCOL.XML,
	experimentFlags?: Record<string, boolean>,
): string {
	// Build guidelines array with automatic numbering
	let itemNumber = 1
	const guidelinesList: string[] = []

	// First guideline is always the same
	guidelinesList.push(`${itemNumber++}. **盘点现状**：梳理现有信息，明确推进任务还缺什么。`)

	guidelinesList.push(
		`${itemNumber++}. **精准选型**：依据任务甄选最优工具（如优先用 \`list_files\` 而非 \`ls\`）。谋定后动，确保工具契合当前步骤。`,
	)

	// Remaining guidelines - different for native vs XML protocol
	if (isNativeProtocol(protocol)) {
		// Check if multiple native tool calls is enabled via experiment
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
	} else {
		guidelinesList.push(
			`${itemNumber++}. **步步为营**：多步操作须分批执行。每一步都必须基于上一步的结果，严禁臆测。`,
		)
	}

	// Protocol-specific guideline - only add for XML protocol
	if (!isNativeProtocol(protocol)) {
		guidelinesList.push(`${itemNumber++}. 严格按照各工具指定的 XML 格式构建调用请求。`)
	}
	guidelinesList.push(
		`${itemNumber++}. **响应反馈**：根据工具执行后的用户反馈（成功、报错、Linter 警告、新输出等）调整决策。利用迭代反馈确保准确性。`,
	)

	// Only add the "wait for confirmation" guideline for XML protocol
	// Native protocol allows multiple tools per message, so waiting after each tool doesn't apply
	if (!isNativeProtocol(protocol)) {
		guidelinesList.push(`${itemNumber++}. 务必等待用户确认后方可继续。未获明确结果前，绝不可默认工具执行成功。`)
	}

	// Join guidelines and add the footer
	// For native protocol, the footer is less relevant since multiple tools can execute in one message
	const footer = isNativeProtocol(protocol)
		? `\n\n`
		: `\n\n严格遵循“步步为营”的原则，且每次使用工具后等待用户反馈，这至关重要。这有助于：
1. 确认每一步成功后再推进。
2. 立即修复新出现的问题或报错。
3. 根据新信息或意外结果调整策略。
4. 确保每一步操作都正确建立在前一步基础之上。

通过仔细考量工具执行后的用户反馈，你可以做出相应调整和明智决策。这种迭代过程有助于确保工作的整体成功率与准确性。`

	return `## 操作准则

${guidelinesList.join("\n")}${footer}`
}
