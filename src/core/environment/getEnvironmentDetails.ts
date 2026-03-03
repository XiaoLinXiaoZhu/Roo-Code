import { Task } from "../task/Task"
import { formatReminderSection } from "./reminder"

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

	if (shouldIncludeReminder && todoListEnabled && reminderContent) {
		xmlContent += `\n  <todos>\n    ${reminderContent.split("\n").join("\n    ")}\n  </todos>`
	}

	// ============================================================================
	// First-message reminder prompt
	// ============================================================================
	const reminderEnabled =
		state && typeof state.apiConfiguration?.reminderEnabled === "boolean"
			? state.apiConfiguration.reminderEnabled
			: true
	if (isFirstMessage && reminderEnabled && !cline.pendingReminder) {
		xmlContent += `\n  <reminder_hint>You have the reminder tool enabled. You MUST set a reminder for every task — it is your "estimate → execute → reflect → re-evaluate" rhythm anchor. First: quickly estimate the task scope and rounds needed. Then: set reminder #1 with your plan (investigation steps, implementation steps, estimated rounds). Investigation itself is a step in your plan, not something that happens before planning. When a reminder fires, set the next one IMMEDIATELY — before doing any other work. If you finish early, call reminder() with a completion summary to overwrite the stale one.</reminder_hint>`
	}

	// ============================================================================
	// Pending Reminder Section (reminder tool)
	// ============================================================================
	if (cline.pendingReminder) {
		cline.pendingReminder.roundsLeft--
		if (cline.pendingReminder.roundsLeft <= 0) {
			const reminderId = cline.pendingReminder.id
			xmlContent += `\n  <reminder id="${reminderId}">${cline.pendingReminder.content}</reminder>`
			xmlContent += `\n  <reminder_instruction>⏰ Reminder #${reminderId} fired. Everything between reminder #${reminderId > 1 ? reminderId - 1 : 1} and now is one work phase.

Reflect on this phase:
- Compare your checklist (above) against actual progress. What's done? What drifted? What's blocked?
- Did this phase take MORE rounds than you estimated? → Your estimate was off. Why? Wrong scope, unexpected complexity, or wrong approach? Don't just continue — diagnose first.
- Did you finish BEFORE this reminder fired? → You overestimated. Calibrate: next delay should be shorter. Also ask yourself if the task was simpler than expected, or if you cut corners.
- Should you continue the current approach, pivot, or consult_expert?

⚠️ You MUST set reminder #${reminderId + 1} RIGHT NOW — before doing anything else. Include: updated progress, next phase plan, and calibrated delay. No exceptions. If you skip this, you lose your rhythm anchor and will drift.</reminder_instruction>`
			cline.pendingReminder = null
		}
	}

	// ============================================================================
	// Assemble Final XML — return empty string if no content to inject
	// This prevents empty user message text blocks from breaking
	// Interleaved Thinking chains on models like GLM-4.7/5.
	// ============================================================================
	if (!xmlContent) {
		return ""
	}
	return `<environment current_time="${currentTime}">${xmlContent}\n</environment>`
}
