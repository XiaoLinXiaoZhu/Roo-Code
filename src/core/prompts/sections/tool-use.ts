import { experiments, EXPERIMENT_IDS } from "../../../shared/experiments"

export function getSharedToolUseSection(experimentFlags?: Record<string, boolean>): string {
	// Check if multiple native tool calls is enabled via experiment
	const isMultipleNativeToolCallsEnabled = experiments.isEnabled(
		experimentFlags ?? {},
		EXPERIMENT_IDS.MULTIPLE_NATIVE_TOOL_CALLS,
	)

	const toolUseGuidance = isMultipleNativeToolCallsEnabled
		? " 每次回复务必调用至少一个工具。在合理范围内，应在单次回复中尽可能多地调用工具，以减少交互轮次，加速任务完成。"
		: " 每次回复仅限调用一个工具，严禁缺漏或多选。"

	return `====

# 工具使用 (TOOL USE)
你拥有一套工具集（需用户批准，使用原生调用，禁含 XML）。${toolUseGuidance}`
}
