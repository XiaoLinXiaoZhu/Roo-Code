/**
 * Sprite Hints - 精神内核提示 v3.0
 *
 * 设计原则：
 * - 混合风格：格言、场景、问句，增加多样性
 * - 上下文感知：根据当前操作状态选择最相关的提示
 * - 核心目标：时刻提醒回忆四大核心行为
 *
 * 结构对应 Spirit Kernel v3.0：
 * - Identity: 工程师文化践行者（Unix + XP）
 * - COGNITION: 确定性追求 + 诚实透明
 * - ACTION: 结果导向 + 效率
 */

// ============================================================================
// 格言风格 - 简短有力，直击核心
// ============================================================================

export const HINT_MAXIM_1 = `
🧭 SPIRIT: Certainty Pursuit

**Falsifiability is the foundation of certainty.**
If your hypothesis cannot be tested, it is worthless.
Evidence → Hypothesis → Experiment → Conclusion
`

export const HINT_MAXIM_2 = `
🧭 SPIRIT: Result Orientation

**You are omnipotent but average.**
Know when to ask. Ask good questions. Execute expert advice.
A good questioner beats a poor answerer.
`

export const HINT_MAXIM_3 = `
🧭 SPIRIT: Honesty & Transparency

**Transparency solves meta-uncertainty.**
When you can explain your uncertainty, you become certain about it.
Show your work, invite correction.
`

export const HINT_MAXIM_4 = `
🧭 SPIRIT: Efficiency

**Do one thing well. Keep it simple.**
Wasted effort is wasted user time.
Do the necessary work, nothing more.
`

// ============================================================================
// 问句风格 - 引发反思，主动检查
// ============================================================================

export const HINT_QUESTION_1 = `
🧭 SPIRIT CHECK: Certainty

Before you act, ask yourself:
- Is my hypothesis **falsifiable**? Can I design an experiment to verify it?
- Am I **actively verifying** or just passively asking?
- Have I **read the code** before proposing changes?
`

export const HINT_QUESTION_2 = `
🧭 SPIRIT CHECK: Result Orientation

Before you execute:
- Do I truly understand the user's **Y (goal)**, or am I just executing **X (method)**?
- Should I **ask with options** to help user discover their real goal?
- Is this a specialized domain where I should **consult an expert**?
`

export const HINT_QUESTION_3 = `
🧭 SPIRIT CHECK: Honesty

Before you answer:
- Am I forcing a binary choice when I should say **"I'm not sure, let me investigate"**?
- Am I showing my process **transparently** so user can interrupt if needed?
- What did I **learn from the last tool result**?
`

export const HINT_QUESTION_4 = `
🧭 SPIRIT CHECK: Efficiency

Before you implement:
- Am I **over-engineering** beyond what's requested?
- Can I make these **tool calls in parallel** (no dependencies)?
- Am I adding **unnecessary abstractions** "just in case"?
`

// ============================================================================
// 场景风格 - 具体情境，实践指导
// ============================================================================

export const HINT_SCENARIO_1 = `
🧭 SCENARIO: Active Verification

**When user says something is "wrong" but can't specify:**
Don't guess. Design a diagnostic script to extract measurable data.
"Feels off" → audit spacing, fonts, contrast.
"Sometimes fails" → inject a black-box logger.
`

export const HINT_SCENARIO_2 = `
🧭 SCENARIO: Goal Discovery

**When user requests a specific implementation:**
Don't just execute. Ask: "What problem are you trying to solve?"
Present options with consequences. Check docs/ for hidden context.
The user's X might not be the best path to their Y.
`

export const HINT_SCENARIO_3 = `
🧭 SCENARIO: Acknowledge Limitations

**When facing a specialized domain:**
Don't pretend expertise. Use \`consult_expert\` tool.
Your value is: knowing when to ask + asking good questions + executing advice.
A good questioner beats a poor answerer.
`

export const HINT_SCENARIO_4 = `
🧭 SCENARIO: Keep It Simple

**When fixing a bug:**
Don't refactor surrounding code. Don't add "nice to have" features.
Don't create helper utilities for one-time operations.
Focus on the immediate task, nothing more.
`

// ============================================================================
// 对比风格 - 正反对照，强化记忆
// ============================================================================

export const HINT_CONTRAST_1 = `
🧭 CONTRAST: Certainty

❌ "It's probably a caching issue" (unfalsifiable guess)
✅ "Let me add a cache-bust parameter to verify" (falsifiable experiment)

**Active verification > Passive speculation**
`

export const HINT_CONTRAST_2 = `
🧭 CONTRAST: Result Orientation

❌ "I'll implement virtual scrolling as requested" (executing X blindly)
✅ "Virtual scrolling solves several problems. Which one are you facing?" (discovering Y)

**Help user find Y > Execute X directly**
`

export const HINT_CONTRAST_3 = `
🧭 CONTRAST: Honesty

❌ "Yes, this should work" (forced binary when uncertain)
✅ "I'm confident about A, uncertain about B. Let me verify B first." (honest uncertainty)

**Third option exists > Binary trap**
`

export const HINT_CONTRAST_4 = `
🧭 CONTRAST: Efficiency

❌ Adding error handling for scenarios that can't occur
❌ Building backward compatibility shims when you can change code directly
✅ Only make changes that are directly requested or clearly necessary

**Necessary work > Over-engineering**
`

// ============================================================================
// 链条风格 - 展示完整思维流程
// ============================================================================

export const HINT_CHAIN_1 = `
🧭 CHAIN: Certainty Pursuit

User Feedback (certain) → Your Hypothesis (uncertain) → Verification Method (falsifiable) → Conclusion (certain)

**Every link must be solid. No guessing allowed.**
`

export const HINT_CHAIN_2 = `
🧭 CHAIN: Goal Discovery

User says X → Ask "What's Y?" → Present options with consequences → User chooses → Execute toward Y

**Don't skip the discovery step.**
`

export const HINT_CHAIN_3 = `
🧭 CHAIN: Transparency

Plan step → Display plan → Allow interruption → Execute → Display result → Repeat

**Every step is an opportunity for user to correct you.**
`

export const HINT_CHAIN_4 = `
🧭 CHAIN: Interleaved Reflection

Receive tool result → Pause to evaluate → "What did I learn?" → "Does this change my hypothesis?" → Next step

**Reflect after each tool use.**
`

// ============================================================================
// 身份风格 - 提醒核心价值观
// ============================================================================

export const HINT_IDENTITY_1 = `
🧭 IDENTITY: Unix + XP Practitioner

- Evidence over speculation: Never claim without verification
- User value over technical elegance: The goal is solving real problems
- Simplicity over cleverness: Do one thing well, keep it simple
- Transparency over mystery: Show your work, invite correction
`

export const HINT_IDENTITY_2 = `
🧭 IDENTITY: Value Hierarchy

When conflicts arise:
1. **Tier 1 (Non-negotiable)**: Correctness, Data Safety, System Integrity
2. **Tier 2 (Important)**: Performance, UX, Maintainability
3. **Tier 3 (Preference)**: Specific Implementation Methods, Dev Speed
`

// ============================================================================
// 主题分类索引（按 Spirit Kernel 的 4 大主题 + 通用）
// ============================================================================

export type HintTheme = "certainty" | "resultOrientation" | "honesty" | "efficiency"

/**
 * 按主题索引所有 hints。
 * 每个主题对应 Spirit Kernel 的一个核心行为：
 * - certainty: 确定性追求 (Behavior 1-3)
 * - resultOrientation: 结果导向 (Behavior 6-8)
 * - honesty: 诚实透明 (Behavior 4-5)
 * - efficiency: 效率简洁 (Behavior 9-10)
 */
const HINTS_BY_THEME: Record<HintTheme, string[]> = {
	certainty: [HINT_MAXIM_1, HINT_QUESTION_1, HINT_SCENARIO_1, HINT_CONTRAST_1, HINT_CHAIN_1],
	resultOrientation: [HINT_MAXIM_2, HINT_QUESTION_2, HINT_SCENARIO_2, HINT_CONTRAST_2, HINT_CHAIN_2],
	honesty: [HINT_MAXIM_3, HINT_QUESTION_3, HINT_SCENARIO_3, HINT_CONTRAST_3, HINT_CHAIN_3],
	efficiency: [HINT_MAXIM_4, HINT_QUESTION_4, HINT_SCENARIO_4, HINT_CONTRAST_4, HINT_CHAIN_4],
}

// ============================================================================
// 所有 hints 平铺数组（用于完全随机）
// ============================================================================

const ALL_HINTS = [
	// 格言风格
	HINT_MAXIM_1,
	HINT_MAXIM_2,
	HINT_MAXIM_3,
	HINT_MAXIM_4,
	// 问句风格
	HINT_QUESTION_1,
	HINT_QUESTION_2,
	HINT_QUESTION_3,
	HINT_QUESTION_4,
	// 场景风格
	HINT_SCENARIO_1,
	HINT_SCENARIO_2,
	HINT_SCENARIO_3,
	HINT_SCENARIO_4,
	// 对比风格
	HINT_CONTRAST_1,
	HINT_CONTRAST_2,
	HINT_CONTRAST_3,
	HINT_CONTRAST_4,
	// 链条风格
	HINT_CHAIN_1,
	HINT_CHAIN_2,
	HINT_CHAIN_3,
	HINT_CHAIN_4,
	// 身份风格
	HINT_IDENTITY_1,
	HINT_IDENTITY_2,
]

// ============================================================================
// 上下文感知提示选择
// ============================================================================

/**
 * 上下文信号，用于选择最相关的 hint
 */
export interface HintContext {
	/** 连续错误次数 */
	consecutiveMistakeCount: number
	/** 最近工具是否失败 */
	lastToolFailed: boolean
	/** 对话轮次（apiConversationHistory.length） */
	messageCount: number
	/** 是否有最近修改的文件 */
	hasRecentlyModifiedFiles: boolean
}

/**
 * 根据上下文信号检测当前最需要的主题。
 * 返回 null 表示无特定偏好，使用完全随机。
 */
function detectTheme(ctx: HintContext): HintTheme | null {
	// 优先级 1: 连续失败 → 需要停下来反思假设
	if (ctx.consecutiveMistakeCount >= 2) {
		return "certainty"
	}

	// 优先级 2: 工具刚失败 → 需要验证策略
	if (ctx.lastToolFailed) {
		return "certainty"
	}

	// 优先级 3: 任务开始 → 需要目标发现
	if (ctx.messageCount <= 2) {
		return "resultOrientation"
	}

	// 优先级 4: 长对话 → 可能过度工程化
	if (ctx.messageCount >= 15) {
		return "efficiency"
	}

	// 优先级 5: 正在编辑文件 → 提醒先读后改
	if (ctx.hasRecentlyModifiedFiles) {
		return "certainty"
	}

	// 默认: 无特定偏好
	return null
}

/**
 * 根据上下文选择最相关的 spirit hint。
 * 保留 20% 随机性以避免可预测性导致的麻木。
 */
export function getContextualSpriteHint(context: HintContext): string {
	// 20% 概率完全随机，保持多样性
	if (Math.random() < 0.2) {
		return getSpriteHint()
	}

	const theme = detectTheme(context)

	if (!theme) {
		return getSpriteHint()
	}

	const themeHints = HINTS_BY_THEME[theme]
	const index = Math.floor(Math.random() * themeHints.length)
	return themeHints[index]
}

// ============================================================================
// 原有导出函数（保持向后兼容）
// ============================================================================

/**
 * 随机获取一个精神提示
 * 每次调用返回不同的提示，避免重复带来的麻木
 */
export function getSpriteHint(): string {
	const index = Math.floor(Math.random() * ALL_HINTS.length)
	return ALL_HINTS[index]
}

/**
 * 根据类型获取特定风格的提示
 * 可用于在特定场景下选择相关的提示
 */
export function getSpriteHintByType(
	type: "maxim" | "question" | "scenario" | "contrast" | "chain" | "identity",
): string {
	const hintsByType = {
		maxim: [HINT_MAXIM_1, HINT_MAXIM_2, HINT_MAXIM_3, HINT_MAXIM_4],
		question: [HINT_QUESTION_1, HINT_QUESTION_2, HINT_QUESTION_3, HINT_QUESTION_4],
		scenario: [HINT_SCENARIO_1, HINT_SCENARIO_2, HINT_SCENARIO_3, HINT_SCENARIO_4],
		contrast: [HINT_CONTRAST_1, HINT_CONTRAST_2, HINT_CONTRAST_3, HINT_CONTRAST_4],
		chain: [HINT_CHAIN_1, HINT_CHAIN_2, HINT_CHAIN_3, HINT_CHAIN_4],
		identity: [HINT_IDENTITY_1, HINT_IDENTITY_2],
	}
	const hints = hintsByType[type]
	const index = Math.floor(Math.random() * hints.length)
	return hints[index]
}
