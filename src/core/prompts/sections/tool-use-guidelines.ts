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
	guidelinesList.push(
		`${itemNumber++}. Assess what information you already have and what information you need to proceed with the task.`,
	)

	guidelinesList.push(
		`${itemNumber++}. Choose the most appropriate tool based on the task and the tool descriptions provided. Assess if you need additional information to proceed, and which of the available tools would be most effective for gathering this information. For example using the list_files tool is more effective than running a command like \`ls\` in the terminal. It's critical that you think about each available tool and use the one that best fits the current step in the task.`,
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
				`${itemNumber++}. If multiple actions are needed, you may use multiple tools in a single message when appropriate, or use tools iteratively across messages. Each tool use should be informed by the results of previous tool uses. Do not assume the outcome of any tool use. Each step must be informed by the previous step's result.`,
			)
		} else {
			guidelinesList.push(
				`${itemNumber++}. If multiple actions are needed, use one tool at a time per message to accomplish the task iteratively, with each tool use being informed by the result of the previous tool use. Do not assume the outcome of any tool use. Each step must be informed by the previous step's result.`,
			)
		}
	} else {
		guidelinesList.push(
			`${itemNumber++}. If multiple actions are needed, use one tool at a time per message to accomplish the task iteratively, with each tool use being informed by the result of the previous tool use. Do not assume the outcome of any tool use. Each step must be informed by the previous step's result.`,
		)
	}

	// Protocol-specific guideline - only add for XML protocol
	if (!isNativeProtocol(protocol)) {
		guidelinesList.push(`${itemNumber++}. Formulate your tool use using the XML format specified for each tool.`)
	}
	guidelinesList.push(`${itemNumber++}. After each tool use, the user will respond with the result of that tool use. This result will provide you with the necessary information to continue your task or make further decisions. This response may include:
	 - Information about whether the tool succeeded or failed, along with any reasons for failure.
	 - Linter errors that may have arisen due to the changes you made, which you'll need to address.
	 - New terminal output in reaction to the changes, which you may need to consider or act upon.
	 - Any other relevant feedback or information related to the tool use.`)

	// Only add the "wait for confirmation" guideline for XML protocol
	// Native protocol allows multiple tools per message, so waiting after each tool doesn't apply
	if (!isNativeProtocol(protocol)) {
		guidelinesList.push(
			`${itemNumber++}. ALWAYS wait for user confirmation after each tool use before proceeding. Never assume the success of a tool use without explicit confirmation of the result from the user.`,
		)
	}

	// Add send_message_to_agent guidance for both protocols
	guidelinesList.push(
		`${itemNumber++}. When working as part of a parent-child agent delegation:
   - As a **child agent**: 
     * You receive goal-oriented instructions (WHAT to achieve), not implementation details (HOW to do it)
     * You have autonomy to decide implementation approaches, tools, and methods
     * When you encounter ambiguity or uncertainty about requirements, you MUST use send_message_to_agent to ask your parent for clarification
     * DO NOT make assumptions or guess about unclear requirements - always ask first
     * After asking a question, attempt_completion will pause your task and wait for the parent's response
     * Inter-agent messages appear in <agent_message> XML tags to distinguish them from user messages
   - As a **parent agent**: 
     * When using new_task, focus on WHAT needs to be achieved and key constraints, not HOW to implement it
     * Let the child agent make implementation decisions - don't micromanage
     * When you receive a completion result from a child agent, you MUST critically evaluate it before accepting
     * Follow this verification protocol:
       a) **Question the result**: Identify 1-2 specific claims that could be verified
       b) **Request evidence**: Use send_message_to_agent to ask the child agent to provide proof (e.g., "Can you show me the exact file content you modified?", "What was the exact output when you ran the test?")
       c) **Accept only after verification**: Do not accept the child's completion until you have verified their claims through follow-up questions
       d) **You can reopen completed child tasks**: Even after a child calls attempt_completion, you can still send it messages to ask follow-up questions or request additional work
     * Inter-agent messages appear in <agent_message> XML tags in the child's context
   - IMPORTANT: Using send_message_to_agent will pause your execution and transfer control to the other agent.`,
	)

	// Join guidelines and add the footer
	// For native protocol, the footer is less relevant since multiple tools can execute in one message
	const footer = isNativeProtocol(protocol)
		? `\n\nBy carefully considering the user's response after tool executions, you can react accordingly and make informed decisions about how to proceed with the task. This iterative process helps ensure the overall success and accuracy of your work.`
		: `\n\nIt is crucial to proceed step-by-step, waiting for the user's message after each tool use before moving forward with the task. This approach allows you to:
1. Confirm the success of each step before proceeding.
2. Address any issues or errors that arise immediately.
3. Adapt your approach based on new information or unexpected results.
4. Ensure that each action builds correctly on the previous ones.

By waiting for and carefully considering the user's response after each tool use, you can react accordingly and make informed decisions about how to proceed with the task. This iterative process helps ensure the overall success and accuracy of your work.`

	return `# Tool Use Guidelines

${guidelinesList.join("\n")}${footer}`
}
