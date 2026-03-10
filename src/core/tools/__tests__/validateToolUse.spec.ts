// npx vitest run src/core/tools/__tests__/validateToolUse.spec.ts

import type { ModeConfig } from "@roo-code/types"

import { modes } from "../../../shared/modes"
import { TOOL_GROUPS } from "../../../shared/tools"

import { validateToolUse, isToolAllowedForMode } from "../validateToolUse"

const codeMode = modes.find((m) => m.slug === "code")?.slug || "code"
const architectMode = modes.find((m) => m.slug === "architect")?.slug || "architect"
const askMode = modes.find((m) => m.slug === "ask")?.slug || "ask"

describe("mode-validator", () => {
	describe("isToolAllowedForMode", () => {
		describe("code mode", () => {
			it("allows all code mode tools", () => {
				// Code mode has read, edit, command, mcp groups
				const codeModeTools = [
					...TOOL_GROUPS.read.tools,
					...TOOL_GROUPS.edit.tools,
					...TOOL_GROUPS.command.tools,
				]
				codeModeTools.forEach((tool: string) => {
					expect(isToolAllowedForMode(tool, codeMode, [])).toBe(true)
				})
			})

			it("disallows unknown tools", () => {
				expect(isToolAllowedForMode("unknown_tool" as any, codeMode, [])).toBe(false)
			})
		})

		describe("architect mode", () => {
			it("allows configured tools", () => {
				// Architect mode has read, edit, command, mcp, modes groups
				const architectTools = [
					...TOOL_GROUPS.read.tools,
					...TOOL_GROUPS.edit.tools,
					...TOOL_GROUPS.command.tools,
					...TOOL_GROUPS.modes.tools,
				]
				architectTools.forEach((tool) => {
					expect(isToolAllowedForMode(tool, architectMode, [])).toBe(true)
				})
			})
		})

		describe("ask mode", () => {
			it("allows configured tools", () => {
				// Ask mode has read, command, mcp groups
				const askTools = [...TOOL_GROUPS.read.tools, ...TOOL_GROUPS.command.tools]
				askTools.forEach((tool) => {
					expect(isToolAllowedForMode(tool, askMode, [])).toBe(true)
				})
			})
		})

		describe("custom modes", () => {
			it("allows tools from custom mode configuration", () => {
				const customModes: ModeConfig[] = [
					{
						slug: "custom-mode",
						name: "Custom Mode",
						roleDefinition: "Custom role",
						groups: ["read", "edit"] as const,
					},
				]
				// Should allow tools from read and edit groups
				expect(isToolAllowedForMode("codebase_search", "custom-mode", customModes)).toBe(true)
				expect(isToolAllowedForMode("write", "custom-mode", customModes)).toBe(true)
				// Should not allow tools from other groups
				expect(isToolAllowedForMode("exec", "custom-mode", customModes)).toBe(false)
			})

			it("allows custom mode to override built-in mode", () => {
				const customModes: ModeConfig[] = [
					{
						slug: codeMode,
						name: "Custom Code Mode",
						roleDefinition: "Custom role",
						groups: ["read"] as const,
					},
				]
				// Should allow tools from read group
				expect(isToolAllowedForMode("codebase_search", codeMode, customModes)).toBe(true)
				// Should not allow tools from other groups
				expect(isToolAllowedForMode("write", codeMode, customModes)).toBe(false)
			})

			it("respects tool requirements in custom modes", () => {
				const customModes: ModeConfig[] = [
					{
						slug: "custom-mode",
						name: "Custom Mode",
						roleDefinition: "Custom role",
						groups: ["edit"] as const,
					},
				]
				const requirements = { edit: false }

				// Should respect disabled requirement even if tool group is allowed
				expect(isToolAllowedForMode("edit", "custom-mode", customModes, requirements)).toBe(false)

				// Should allow other edit tools
				expect(isToolAllowedForMode("write", "custom-mode", customModes, requirements)).toBe(true)
			})
		})

		describe("dynamic MCP tools", () => {
			it("allows dynamic MCP tools when mcp group is in mode groups", () => {
				// Code mode has mcp group, so dynamic MCP tools should be allowed
				expect(isToolAllowedForMode("mcp_context7_resolve-library-id", codeMode, [])).toBe(true)
				expect(isToolAllowedForMode("mcp_serverName_toolName", codeMode, [])).toBe(true)
			})

			it("disallows dynamic MCP tools when mcp group is not in mode groups", () => {
				const customModes: ModeConfig[] = [
					{
						slug: "no-mcp-mode",
						name: "No MCP Mode",
						roleDefinition: "Custom role",
						groups: ["read", "edit"] as const,
					},
				]
				// Custom mode without mcp group should not allow dynamic MCP tools
				expect(isToolAllowedForMode("mcp_context7_resolve-library-id", "no-mcp-mode", customModes)).toBe(false)
				expect(isToolAllowedForMode("mcp_serverName_toolName", "no-mcp-mode", customModes)).toBe(false)
			})

			it("allows dynamic MCP tools in custom mode with mcp group", () => {
				const customModes: ModeConfig[] = [
					{
						slug: "custom-mcp-mode",
						name: "Custom MCP Mode",
						roleDefinition: "Custom role",
						groups: ["read", "mcp"] as const,
					},
				]
				expect(isToolAllowedForMode("mcp_context7_resolve-library-id", "custom-mcp-mode", customModes)).toBe(
					true,
				)
			})
		})

		describe("tool requirements", () => {
			it("respects tool requirements when provided", () => {
				const requirements = { edit: false }
				expect(isToolAllowedForMode("edit", codeMode, [], requirements)).toBe(false)

				const enabledRequirements = { edit: true }
				expect(isToolAllowedForMode("edit", codeMode, [], enabledRequirements)).toBe(true)
			})

			it("allows tools when their requirements are not specified", () => {
				const requirements = { some_other_tool: true }
				expect(isToolAllowedForMode("edit", codeMode, [], requirements)).toBe(true)
			})

			it("handles undefined and empty requirements", () => {
				expect(isToolAllowedForMode("edit", codeMode, [], undefined)).toBe(true)
				expect(isToolAllowedForMode("edit", codeMode, [], {})).toBe(true)
			})

			it("prioritizes requirements over mode configuration", () => {
				const requirements = { edit: false }
				// Even in code mode which allows all tools, disabled requirement should take precedence
				expect(isToolAllowedForMode("edit", codeMode, [], requirements)).toBe(false)
			})

			it("prioritizes requirements over ALWAYS_AVAILABLE_TOOLS", () => {
				// Tools in ALWAYS_AVAILABLE_TOOLS (switch_mode, new_task, etc.) should still
				// be blockable via toolRequirements / disabledTools
				const requirements = { switch_mode: false, new_task: false, attempt_completion: false }
				expect(isToolAllowedForMode("switch_mode", codeMode, [], requirements)).toBe(false)
				expect(isToolAllowedForMode("new_task", codeMode, [], requirements)).toBe(false)
				expect(isToolAllowedForMode("attempt_completion", codeMode, [], requirements)).toBe(false)
			})
		})
	})

	describe("validateToolUse", () => {
		it("throws error for unknown/invalid tools", () => {
			// Unknown tools should throw with a specific "Unknown tool" error
			expect(() => validateToolUse("unknown_tool" as any, "architect", [])).toThrow(
				'Unknown tool "unknown_tool". This tool does not exist.',
			)
		})

		it("does not throw for allowed tools in architect mode command group", () => {
			// exec is in the command group which is included in architect mode
			expect(() => validateToolUse("exec", "architect", [])).not.toThrow()
		})

		it("does not throw for allowed tools in architect mode", () => {
			// codebase_search is in the read group which is included in architect mode
			expect(() => validateToolUse("codebase_search", "architect", [])).not.toThrow()
		})

		it("throws error when tool requirement is not met", () => {
			const requirements = { edit: false }
			expect(() => validateToolUse("edit", codeMode, [], requirements)).toThrow(
				'Tool "edit" is not allowed in code mode.',
			)
		})

		it("does not throw when tool requirement is met", () => {
			const requirements = { edit: true }
			expect(() => validateToolUse("edit", codeMode, [], requirements)).not.toThrow()
		})

		it("handles undefined requirements gracefully", () => {
			expect(() => validateToolUse("edit", codeMode, [], undefined)).not.toThrow()
		})

		it("blocks tool when disabledTools is converted to toolRequirements", () => {
			const disabledTools = ["exec", "new_task"]
			const toolRequirements = disabledTools.reduce(
				(acc: Record<string, boolean>, tool: string) => {
					acc[tool] = false
					return acc
				},
				{} as Record<string, boolean>,
			)

			expect(() => validateToolUse("exec", codeMode, [], toolRequirements)).toThrow(
				'Tool "exec" is not allowed in code mode.',
			)
			expect(() => validateToolUse("new_task", codeMode, [], toolRequirements)).toThrow(
				'Tool "new_task" is not allowed in code mode.',
			)
		})

		it("allows non-disabled tools when disabledTools is converted to toolRequirements", () => {
			const disabledTools = ["exec"]
			const toolRequirements = disabledTools.reduce(
				(acc: Record<string, boolean>, tool: string) => {
					acc[tool] = false
					return acc
				},
				{} as Record<string, boolean>,
			)

			expect(() => validateToolUse("codebase_search", codeMode, [], toolRequirements)).not.toThrow()
			expect(() => validateToolUse("write", codeMode, [], toolRequirements)).not.toThrow()
		})

		it("handles empty disabledTools array converted to toolRequirements", () => {
			const disabledTools: string[] = []
			const toolRequirements = disabledTools.reduce(
				(acc: Record<string, boolean>, tool: string) => {
					acc[tool] = false
					return acc
				},
				{} as Record<string, boolean>,
			)

			expect(() => validateToolUse("exec", codeMode, [], toolRequirements)).not.toThrow()
		})
	})
})
