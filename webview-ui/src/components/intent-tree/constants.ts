/**
 * Intent Tree 样式常量
 */

import type { IntentNodeType, IntentNodeStatus } from "./types"

export const TYPE_ICONS: Record<IntentNodeType, string> = {
	goal: "codicon-target",
	subgoal: "codicon-milestone",
	path: "codicon-git-branch",
	impl: "codicon-gear",
}

export const TYPE_LABELS: Record<IntentNodeType, string> = {
	goal: "Goal",
	subgoal: "Subgoal",
	path: "Path",
	impl: "Impl",
}

export const TYPE_COLORS: Record<IntentNodeType, string> = {
	goal: "var(--vscode-charts-purple)",
	subgoal: "var(--vscode-charts-blue)",
	path: "var(--vscode-charts-orange)",
	impl: "var(--vscode-charts-green)",
}

export const STATUS_ICONS: Record<IntentNodeStatus, string> = {
	planned: "○",
	in_progress: "◐",
	done: "●",
	superseded: "◇",
	pruned: "✕",
}

export const STATUS_LABELS: Record<IntentNodeStatus, string> = {
	planned: "Planned",
	in_progress: "In Progress",
	done: "Done",
	superseded: "Superseded",
	pruned: "Pruned",
}

export const STATUS_COLORS: Record<IntentNodeStatus, string> = {
	planned: "var(--vscode-descriptionForeground)",
	in_progress: "var(--vscode-charts-yellow)",
	done: "var(--vscode-charts-green)",
	superseded: "var(--vscode-charts-orange)",
	pruned: "var(--vscode-errorForeground)",
}

export const TOOL_ICONS: Record<string, string> = {
	add: "codicon-add",
	update: "codicon-edit",
	prune: "codicon-trash",
	commit: "codicon-git-commit",
	restructure: "codicon-git-merge",
}

export const TOOL_TITLES: Record<string, string> = {
	add: "Add Intent",
	update: "Update Intent",
	prune: "Prune Intent",
	commit: "Commit Intent",
	restructure: "Restructure Intent",
}
