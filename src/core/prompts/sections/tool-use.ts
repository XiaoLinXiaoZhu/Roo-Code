import { ToolProtocol, TOOL_PROTOCOL, isNativeProtocol } from "@roo-code/types"

import { experiments, EXPERIMENT_IDS } from "../../../shared/experiments"

export function getSharedToolUseSection(
	protocol: ToolProtocol = TOOL_PROTOCOL.XML,
	experimentFlags?: Record<string, boolean>,
): string {
	if (isNativeProtocol(protocol)) {
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

	return `====

工具使用 (TOOL USE)

你拥有一套工具集，须经用户批准后方可执行。每条消息必须且仅能包含一个工具调用。请按步骤使用工具完成任务，并根据上一步的执行结果决定下一步操作。

# 工具使用格式 (Tool Use Formatting)

工具调用采用 XML 风格标签。工具名即为 XML 标签名。每个参数需单独包裹在对应的标签中。结构如下：

<actual_tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</actual_tool_name>

务必使用实际工具名作为 XML 标签名，以便正确解析执行。`
}
