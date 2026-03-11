// Active sections used by system.ts
export { getSystemInfoSection } from "./system-info"
export { getProjectContext } from "./custom-instructions"
export { getSkillsSection } from "./skills"

// Runtime detection (used by system-info)
export { detectEnv, getCachedEnv, formatRuntimesForPrompt, _resetCache } from "./env-detection"

// Legacy exports (used by tests and other consumers, kept for backward compatibility)
export { addCustomInstructions } from "./custom-instructions"
export { getRulesSection } from "./rules"
export { getCapabilitiesSection } from "./capabilities"
export { getObjectiveSection } from "./objective"
export { getSharedToolUseSection } from "./tool-use"
export { getToolUseGuidelinesSection } from "./tool-use-guidelines"
export { getModesSection } from "./modes"
export { markdownFormattingSection } from "./markdown-formatting"
export { getSpiritSection } from "./spirit"
export { getCodeIntelligenceSection } from "./code-intelligence"
