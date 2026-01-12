import type OpenAI from "openai"

const sendMessageToAgent: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "send_message_to_agent",
		description: `Send a message to another agent (parent or child) for bidirectional communication. This enables agents to ask questions, seek clarification, or provide updates to each other.

**Key Use Cases:**

1. **Alignment (Child → Parent)**: When a child agent needs clarification about the task
   - Example: "I understand you want me to implement a login feature. Should I use JWT tokens or session-based authentication?"
   - Helps ensure agents work on the right solution before investing effort

2. **Confirmation (Parent → Child)**: When a parent agent notices something unusual in child's approach
   - Example: "You're planning to delete the database. Are you sure this is correct?"
   - Catches potential mistakes early through verification

3. **Context Sharing**: Provide additional information or updates
   - Example: "I've completed the frontend. Note that I used React hooks, which affects your API design."
   - Keeps both agents synchronized on progress and decisions

**Direction:**
- **Child → Parent**: Omit target_agent_id (defaults to parent)
- **Parent → Child**: Set target_agent_id to child's task ID

**Important:**
- This tool SUSPENDS the sending agent and transfers control to the receiving agent
- The receiving agent will see your message and can respond by calling this tool back
- Use this for genuine questions/clarifications, not just for status updates
- After sending, you MUST wait for a response before continuing your work`,
		parameters: {
			type: "object",
			properties: {
				target_agent_id: {
					type: "string",
					description: `The task ID of the target agent to send the message to. 
- Omit this parameter when sending from child to parent (parent is determined automatically)
- Provide the child's task ID when sending from parent to child
- You can find the child's task ID in the new_task tool result`,
				},
				message: {
					type: "string",
					description: `The message to send to the other agent. Be clear and specific:
- Ask direct questions that require a response
- Provide context about why you're asking
- Include relevant details that help the other agent understand your situation
- Example good message: "I need to implement user authentication. Should I use JWT or session-based auth? The requirements mention 'stateless', which suggests JWT, but I want to confirm before proceeding."
- Example bad message: "What should I do?" (too vague)`,
				},
			},
			required: ["message"],
		},
	},
}

export default sendMessageToAgent
