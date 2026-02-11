/**
 * Intent Tree 组件导出
 */

// 类型
export type {
	IntentNodeType,
	IntentNodeStatus,
	IntentCodeBinding,
	IntentNode,
	IntentTreeData,
	AddIntentResult as AddIntentResultData,
	UpdateIntentResult as UpdateIntentResultData,
	PruneIntentResult as PruneIntentResultData,
	CommitIntentResult as CommitIntentResultData,
	RestructureIntentResult as RestructureIntentResultData,
	IntentToolAction,
	IntentTreeUpdateMessage,
} from "./types"

// 常量
export {
	TYPE_ICONS,
	TYPE_LABELS,
	TYPE_COLORS,
	STATUS_ICONS,
	STATUS_LABELS,
	STATUS_COLORS,
	TOOL_ICONS,
	TOOL_TITLES,
} from "./constants"

// 组件
export { IntentNodeItem } from "./IntentNodeItem"
export { IntentTreeDisplay } from "./IntentTreeDisplay"
export { IntentTreeToolBlock } from "./IntentTreeToolBlock"
export { AddIntentResult } from "./AddIntentResult"
export { UpdateIntentResult } from "./UpdateIntentResult"
export { PruneIntentResult } from "./PruneIntentResult"
export { CommitIntentResult } from "./CommitIntentResult"
export { RestructureIntentResult } from "./RestructureIntentResult"

// 默认导出主容器组件
export { IntentTreeToolBlock as default } from "./IntentTreeToolBlock"
