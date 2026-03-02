import { Task } from "../task/Task"
import { formatReminderSection } from "./reminder"

/**
 * Escape XML special characters in a string
 */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

/**
 * Build environment details XML for injection into user messages.
 *
 * After removing vscode/git/workspace/terminals/recently_modified sections,
 * this only contains: intent tree, todo list, and pending reminder.
 * The `current_time` attribute is always included.
 */
export async function getEnvironmentDetails(
	cline: Task,
	_includeFileDetails: boolean = false,
	_isUserMessage: boolean = false,
) {
	const currentTime = new Date().toISOString()
	const isFirstMessage = cline.apiConversationHistory.length === 0
	const messageCount = cline.apiConversationHistory.length
	let xmlContent = ""

	const clineProvider = cline.providerRef.deref()
	const state = await clineProvider?.getState()

	// Reset didEditFile (was used for terminal delay, kept for compatibility)
	cline.didEditFile = false

	// ============================================================================
	// Intent Tree Section
	// ============================================================================
	const intentTreeEnabled =
		state && typeof state.apiConfiguration?.intentTreeEnabled === "boolean"
			? state.apiConfiguration.intentTreeEnabled
			: false
	const shouldIncludeIntentTree =
		intentTreeEnabled && cline.intentTree && (isFirstMessage || cline.intentTreeUpdated === "structural")
	if (shouldIncludeIntentTree) {
		const intentSummary = cline.intentTree!.toSummary()
		const treeDescription = `Separates CONSTRAINTS (what user wants) from IMPLEMENTATIONS (how to achieve it).
		  Constraints=[G]goal/[S]subgoal: Stable. Don't change when implementation fails.
		  Implementations=[P]path/[I]impl: Volatile. Can be replaced or abandoned.
		  Status: 📋=planned, 🔧=in_progress, ✅=done, 🔄=superseded, ❌=pruned`

		const updateHint =
			cline.intentTreeUpdated === "structural" ? ' hint="structural change since last message"' : ""

		if (intentSummary) {
			xmlContent += `\n  <intent_tree description="${treeDescription}"${updateHint}>`
			xmlContent += `\n${intentSummary
				.split("\n")
				.map((l) => "    " + l)
				.join("\n")}`
			xmlContent += `\n  </intent_tree>`
		} else {
			xmlContent += `\n  <intent_tree description="${treeDescription}" status="empty"${updateHint}/>`
		}
	}

	if (cline.intentTreeUpdated) {
		cline.intentTreeUpdated = false
	}

	// ============================================================================
	// Todo List Section
	// ============================================================================
	const shouldIncludeReminder = isFirstMessage || messageCount % 3 === 0
	const todoListEnabled =
		state && typeof state.apiConfiguration?.todoListEnabled === "boolean"
			? state.apiConfiguration.todoListEnabled
			: true

	const reminderContent = todoListEnabled ? formatReminderSection(cline.todoList) : ""

	if (shouldIncludeReminder && todoListEnabled) {
		if (reminderContent) {
			xmlContent += `\n  <todos>\n    ${reminderContent.split("\n").join("\n    ")}\n  </todos>`
		} else {
			xmlContent += `\n  <todos hint="Create with update_todo_list if task is complex"/>`
		}
	}

	// ============================================================================
	// Pending Reminder Section (reminder tool)
	// ============================================================================
	if (cline.pendingReminder) {
		cline.pendingReminder.roundsLeft--
		if (cline.pendingReminder.roundsLeft <= 0) {
			xmlContent += `\n  <reminder>${escapeXml(cline.pendingReminder.content)}</reminder>`
			cline.pendingReminder = null
		}
	}

	// ============================================================================
	// Assemble Final XML
	// ============================================================================
	return `<environment current_time="${currentTime}">${xmlContent}\n</environment>`
}
