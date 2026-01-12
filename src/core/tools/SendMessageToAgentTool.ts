import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { t } from "../../i18n"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import { RooCodeEventName } from "@roo-code/types"

interface SendMessageToAgentParams {
	target_agent_id?: string
	message: string
}

/**
 * Interface for provider methods needed by SendMessageToAgentTool.
 */
interface AgentCommunicationProvider {
	sendMessageToAgent(params: { sourceTaskId: string; targetTaskId: string; message: string }): Promise<void>
}

/**
 * SendMessageToAgentTool enables bidirectional communication between parent and child agents.
 * This tool supports three core scenarios:
 *
 * 1. Alignment: Subagent asks parent for clarification ("Do you mean XXX?")
 * 2. Confirmation: Parent questions subagent's approach ("Are you sure about XXX?")
 * 3. Reuse: Continue working with the same agent to leverage previous context
 *
 * Usage:
 * - Child → Parent: Call without target_agent_id (defaults to parent)
 * - Parent → Child: Call with target_agent_id set to child's taskId
 */
export class SendMessageToAgentTool extends BaseTool<"send_message_to_agent"> {
	readonly name = "send_message_to_agent" as const

	parseLegacy(params: Partial<Record<string, string>>): SendMessageToAgentParams {
		return {
			target_agent_id: params.target_agent_id,
			message: params.message || "",
		}
	}

	async execute(params: SendMessageToAgentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { target_agent_id, message } = params
		const { handleError, pushToolResult } = callbacks

		try {
			// Validate required parameter
			if (!message) {
				task.consecutiveMistakeCount++
				task.recordToolError("send_message_to_agent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(await task.sayAndCreateMissingParamError("send_message_to_agent", "message"))
				return
			}

			const provider = task.providerRef.deref() as AgentCommunicationProvider | undefined
			if (!provider) {
				pushToolResult(formatResponse.toolError("Provider reference lost"))
				return
			}

			task.consecutiveMistakeCount = 0

			// Determine target agent: if no target_agent_id provided, assume sending to parent
			let targetTaskId: string
			let direction: "to_parent" | "to_child"

			if (!target_agent_id) {
				// Child sending to parent
				if (!task.parentTaskId) {
					task.consecutiveMistakeCount++
					task.recordToolError("send_message_to_agent")
					pushToolResult(
						formatResponse.toolError(
							"Cannot send message to parent: this task has no parent agent. " +
								"If you want to send a message to a child agent, provide target_agent_id parameter.",
						),
					)
					return
				}
				targetTaskId = task.parentTaskId
				direction = "to_parent"
			} else {
				// Parent sending to child
				targetTaskId = target_agent_id
				direction = "to_child"

				// Validate that the target is actually a child of this task
				if (task.childTaskId !== targetTaskId) {
					task.consecutiveMistakeCount++
					task.recordToolError("send_message_to_agent")
					pushToolResult(
						formatResponse.toolError(
							`Invalid target agent: ${targetTaskId} is not a child of this task. ` +
								`Current child task ID is: ${task.childTaskId || "none"}`,
						),
					)
					return
				}
			}

			// Show the message in the current agent's view
			await task.say(
				"agent_message_sent",
				JSON.stringify({
					direction,
					targetTaskId,
					message,
				}),
			)

			// Send the message to the target agent
			await provider.sendMessageToAgent({
				sourceTaskId: task.taskId,
				targetTaskId,
				message,
			})

			// Return success result
			const resultMessage =
				direction === "to_parent"
					? `Message sent to parent agent. Waiting for parent's response...`
					: `Message sent to child agent (${targetTaskId}). Waiting for child's response...`

			pushToolResult(formatResponse.toolResult(resultMessage))
		} catch (error) {
			await handleError("sending message to agent", error as Error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"send_message_to_agent">): Promise<void> {
		const target_agent_id: string | undefined = block.params.target_agent_id
		const message: string | undefined = block.params.message

		const direction = target_agent_id ? "to_child" : "to_parent"
		const partialMessage = JSON.stringify({
			direction,
			targetTaskId: target_agent_id || task.parentTaskId || "unknown",
			message: this.removeClosingTag("message", message, block.partial),
		})

		await task.say("agent_message_sent", partialMessage, undefined, block.partial).catch(() => {})
	}
}

export const sendMessageToAgentTool = new SendMessageToAgentTool()
