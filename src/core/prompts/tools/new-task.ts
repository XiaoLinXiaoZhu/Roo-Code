import { ToolArgs } from "./types"

/**
 * Prompt when todos are NOT required (default)
 */
const PROMPT_WITHOUT_TODOS = `## new_task
Description: Create a new child agent to work on a delegated task. Focus on goal alignment, not implementation paths.

Delegation Philosophy:
- **Align on WHAT, not HOW**: Clearly state the objective and requirements, but let the child agent decide the implementation approach.
- **Child agent autonomy**: The child agent should make decisions about tools, files, and methods. Don't micromanage.
- **Encourage clarification**: The child agent should use send_message_to_agent to ask questions when uncertain, rather than making assumptions.

Parameters:
- mode: (required) The slug of the mode to start the new task in (e.g., "code", "debug", "architect").
- message: (required) The goal and requirements for the child agent. State WHAT needs to be achieved, not HOW to do it.

Usage:
<new_task>
<mode>your-mode-slug-here</mode>
<message>Your goal-oriented instructions here</message>
</new_task>

Example:
<new_task>
<mode>code</mode>
<message>Implement user authentication that supports email/password login and session management. Requirements: secure password storage, session expiry after 24 hours, and logout functionality. If you need clarification on security requirements or session storage preferences, use send_message_to_agent to ask.</message>
</new_task>
`

/**
 * Prompt when todos ARE required
 */
const PROMPT_WITH_TODOS = `## new_task
Description: Create a new child agent to work on a delegated task. Focus on goal alignment, not implementation paths.

Delegation Philosophy:
- **Align on WHAT, not HOW**: Clearly state the objective and requirements, but let the child agent decide the implementation approach.
- **Child agent autonomy**: The child agent should make decisions about tools, files, and methods. Don't micromanage.
- **Encourage clarification**: The child agent should use send_message_to_agent to ask questions when uncertain, rather than making assumptions.
- **Todos as guidance**: The todo list provides high-level milestones, not detailed steps. The child agent determines the detailed implementation.

Parameters:
- mode: (required) The slug of the mode to start the new task in (e.g., "code", "debug", "architect").
- message: (required) The goal and requirements for the child agent. State WHAT needs to be achieved, not HOW to do it.
- todos: (required) High-level milestones or phases for the child agent to accomplish.

Usage:
<new_task>
<mode>your-mode-slug-here</mode>
<message>Your goal-oriented instructions here</message>
<todos>
[ ] High-level milestone 1
[ ] High-level milestone 2
[ ] High-level milestone 3
</todos>
</new_task>

Example:
<new_task>
<mode>code</mode>
<message>Implement user authentication that supports email/password login and session management. Requirements: secure password storage, session expiry after 24 hours, and logout functionality. If you need clarification on security requirements or session storage preferences, use send_message_to_agent to ask.</message>
<todos>
[ ] Implement secure authentication system
[ ] Add session management with expiry
[ ] Create logout functionality
[ ] Write comprehensive tests
</todos>
</new_task>

`

export function getNewTaskDescription(args: ToolArgs): string {
	const todosRequired = args.settings?.newTaskRequireTodos === true

	// Simply return the appropriate prompt based on the setting
	return todosRequired ? PROMPT_WITH_TODOS : PROMPT_WITHOUT_TODOS
}
