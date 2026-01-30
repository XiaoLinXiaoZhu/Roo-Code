import type OpenAI from "openai"

const UPDATE_TODO_LIST_DESCRIPTION = `Replace the entire TODO list with an updated checklist reflecting the current state. Always provide the full list; the system will overwrite the previous one.

When to Use:
- Task involves multiple steps or requires ongoing tracking
- Need to update status of several todos at once
- New actionable items are discovered during execution
- Task is complex and benefits from stepwise progress tracking

When NOT to Use:
- Only a single, trivial task
- Task can be completed in one or two simple steps
- Request is purely conversational or informational

Checklist Format:
- Use a single-level markdown checklist (no nesting or subtasks)
- List todos in the intended execution order
- Status options: [ ] (pending), [x] (completed), [-] (in progress)

Use Markdown code block format with \`\`\`todo_list syntax. This format requires zero escaping for newlines and quotes, making it more natural and readable. **Use 6 backticks (\`\`\`\`\`\`) for maximum compatibility** - this ensures any code blocks within your content won't conflict with the tool fence.

Example: Initial task list
\`\`\`\`\`\`todo_list
[x] Analyze requirements
[x] Design architecture
[-] Implement core logic
[ ] Write tests
[ ] Update documentation
\`\`\`\`\`\`

Example: After completing implementation
\`\`\`\`\`\`todo_list
[x] Analyze requirements
[x] Design architecture
[x] Implement core logic
[-] Write tests
[ ] Update documentation
[ ] Add performance benchmarks
\`\`\`\`\`\``

const TODOS_PARAMETER_DESCRIPTION = `Full markdown checklist in execution order, using [ ] for pending, [x] for completed, and [-] for in progress`

export default {
	type: "function",
	function: {
		name: "update_todo_list",
		description: UPDATE_TODO_LIST_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				todos: {
					type: "string",
					description: TODOS_PARAMETER_DESCRIPTION,
				},
			},
			required: ["todos"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
