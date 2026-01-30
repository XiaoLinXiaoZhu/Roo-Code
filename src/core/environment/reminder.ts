import { TodoItem, TodoStatus } from "@roo-code/types"

/**
 * Escape XML special characters in a string.
 */
function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

/**
 * Format the reminders section as XML elements.
 * Returns an empty string if there are no todos (the prompt will be handled in getEnvironmentDetails.ts).
 */
export function formatReminderSection(todoList?: TodoItem[]): string {
	if (!todoList || todoList.length === 0) {
		return ""
	}

	const lines: string[] = []
	todoList.forEach((item, idx) => {
		const escapedContent = escapeXml(item.content)
		lines.push(`<todo id="${idx + 1}" status="${item.status}">${escapedContent}</todo>`)
	})

	return lines.join("\n")
}
