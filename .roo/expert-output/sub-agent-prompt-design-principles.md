# Sub-Agent System Prompt Design: Principles, Tradeoffs, and Critique

> Expert consultation on designing effective system prompts for sub-agent delegation in agentic coding tools.

---

## Executive Summary

Your approach of replacing shared system prompt + todo list with dedicated per-sub-agent system prompts is directionally correct. It addresses a real problem: **context pollution** — when a sub-agent inherits instructions irrelevant to its narrow task, it wastes tokens and increases the probability of confused behavior.

However, after reviewing your four implementations (ConsultExpert, ApplyEdit, BuildTool, SearchProject), I see both strong patterns worth preserving and structural issues worth addressing. This document covers:

1. **Core Principles** — The fundamental design principles for sub-agent prompts
2. **Critique of Your Implementation** — What's working, what's not, and why
3. **Tradeoff Matrix** — The tensions between competing principles
4. **Decision Framework** — How to make judgment calls in specific scenarios

---

## Part 1: Core Principles

### Principle 1: Identity Compression — "One sentence should predict all behavior"

**WHY**: LLMs use the identity statement as an anchor for all subsequent reasoning. A vague or overloaded identity ("you are a helpful assistant that can do X, Y, Z") creates ambiguity about which capability to prioritize. A compressed identity acts as a **decision filter** — when the agent faces an ambiguous situation, it can ask "does this fit my identity?" and get a clear answer.

**The Principle**: The identity section should be compressible to a single sentence that, if the agent internalized nothing else, would still produce roughly correct behavior 80% of the time.

**Test**: Cover the rest of your system prompt and read only the identity. Can you predict what the agent will refuse to do? Can you predict its default behavior when instructions are ambiguous?

**Your Implementation — Scorecard**:

- ✅ `ApplyEdit`: "你是一个精确的代码编辑器" — Excellent. "精确" implies minimal changes; "编辑器" implies no architecture decisions. One sentence predicts behavior.
- ✅ `SearchProject`: "你是一个项目代码分析师" — Good. "分析师" implies read-only investigation, not modification.
- ⚠️ `ConsultExpert`: "你是一位 ${domain} 领域的资深专家顾问" — The identity is dynamic (good for flexibility), but "资深专家顾问" is broad. It doesn't compress to a behavioral prediction. Compare: "你是一位只传授心智模型的 ${domain} 导师" — now the refusal behavior (won't write code, won't diagnose bugs) is predictable from identity alone.
- ⚠️ `BuildTool`: "你是一个工具构建专家" — Adequate but could be sharper. "专家" doesn't constrain behavior. Compare: "你是一个 CLI 工具工匠——接收需求，交付可运行的单一用途工具".

### Principle 2: Boundary Explicitness — "What you DON'T do is more important than what you do"

**WHY**: LLMs are trained to be helpful, which means they have a strong prior toward doing _more_ than asked. In a delegation architecture, this is dangerous — a sub-agent that "helpfully" expands its scope creates unpredictable side effects that the parent agent can't reason about. The parent delegated a bounded task; it needs a bounded result.

**The Principle**: Every sub-agent prompt must contain explicit **negative boundaries** — things the agent must NOT do. These boundaries should be derived from the most likely "helpful overreach" for that specific role.

**How to derive boundaries**: Ask yourself: "If I gave this task to an eager junior engineer, what extra things would they do that I didn't ask for?" Those are your boundaries.

**Your Implementation — Scorecard**:

- ✅ `ApplyEdit`: "不要做指令之外的'改进'或'优化'" — Precisely targets the #1 failure mode of code editing agents. Well done.
- ✅ `SearchProject`: "只读调查，禁止任何编辑操作" — Clear, absolute boundary. The most important constraint for a read-only agent.
- ⚠️ `ConsultExpert`: "不要诊断具体 bug 或编写具体实现代码" — Good boundaries, but missing the most common failure mode: **the expert becoming a yes-man**. Experts tend to give the answer the questioner wants to hear. Consider adding: "如果咨询者的前提假设有误，直接指出，不要在错误前提上构建建议。"
- ❌ `BuildTool`: No explicit negative boundaries section. This is the highest-risk omission because tool building has the widest scope. The agent could: over-engineer, add unnecessary dependencies, build a framework instead of a tool, ignore the output size constraints. Add a "# 边界" section similar to ApplyEdit.

**Meta-pattern**: Notice that your best boundary definitions (ApplyEdit, SearchProject) are the ones where the role is narrowest. Broader roles need _more_ boundaries, not fewer — yet your implementation has the inverse relationship. This is a common trap.

### Principle 3: Workflow as Scaffold, Not Script — "Guide the shape, not the steps"

**WHY**: There's a fundamental tension in workflow instructions. Too prescriptive ("step 1, step 2, step 3") and the agent follows the script even when the situation calls for deviation — it becomes brittle. Too loose ("figure it out") and the agent may skip critical steps or do them in a harmful order. The sweet spot is a **scaffold**: define the _shape_ of the workflow (what phases exist, what each phase produces) while leaving the _steps within each phase_ to the agent's judgment.

**The Principle**: Define workflow in terms of **phases and their exit criteria**, not step-by-step instructions. The agent should know "what done looks like" for each phase, not "what to type next."

**Your Implementation — Scorecard**:

- ✅ `ApplyEdit`: "读取 → 修改 → 验证 → 交付" — Four phases, each with a clear purpose. The validation phase even has conditional logic (validate param). This is good scaffold design.
- ⚠️ `SearchProject`: No explicit workflow. The "分析方法" section lists tools but doesn't define phases. The agent doesn't know when to stop investigating. Consider: "Phase 1: Orientation (list_files, understand structure) → Phase 2: Targeted investigation (LSP + search) → Phase 3: Synthesis (connect findings, answer the question)". The exit criterion for Phase 2 is critical: "stop when you can answer the query with evidence."
- ⚠️ `BuildTool`: Seven numbered steps — this is too prescriptive. Steps 2-5 are implementation details the agent should decide. Better: "Phase 1: Assess (check existing tools, decide build-or-reuse) → Phase 2: Build (implement, test) → Phase 3: Deliver (path + help output + example)". The agent knows what to deliver without being told the order of implementation.
- ✅ `ConsultExpert`: The "思考路径" sections are excellent scaffold design — they guide _what to think about_ without prescribing the output structure. The bullet points are prompts for reasoning, not steps to follow.

**Key insight**: The difference between a script and a scaffold is **whether the agent can skip or reorder steps based on context**. If step 3 only makes sense after step 2, that's a real dependency — keep it. If steps 2 and 3 are independent, don't number them — the numbering implies false ordering.

### Principle 4: Instruction-Prompt Separation — "System prompt is the role; user message is the task"

**WHY**: This is the most architecturally consequential principle. In a delegation system, the system prompt and the user message serve fundamentally different purposes:

- **System prompt** = WHO you are + HOW you work (stable across invocations)
- **User message** = WHAT to do this time (unique per invocation)

When you mix task-specific details into the system prompt, you lose the ability to reuse the same system prompt across different invocations. When you mix role-defining instructions into the user message, the agent treats them as suggestions rather than constraints (user messages have weaker behavioral binding than system prompts in most LLMs).

**The Principle**: The system prompt should be **task-agnostic** — it defines the agent's role, capabilities, constraints, and workflow patterns. Everything specific to _this particular invocation_ belongs in the user message.

**Your Implementation — Scorecard**:

- ✅ `ApplyEdit`: Clean separation. System prompt defines the editor role; user message contains the specific instruction, files, and context. The `validate` param is a borderline case — it's in the system prompt but it's per-invocation. Consider moving it to the user message.
- ✅ `SearchProject`: Clean separation. System prompt defines analysis methodology; user message contains the specific query and scope.
- ✅ `ConsultExpert`: Mostly clean, but `domain` is injected into the system prompt identity. This is a **deliberate and defensible** choice — domain shapes the _role_, not just the task. However, `consultType` guidance is also in the system prompt, which means you're generating a unique system prompt per invocation. This defeats potential caching optimizations (see Principle 6).
- ⚠️ `BuildTool`: The system prompt is fully static (good!), but the `existingToolsInfo` is in the user message (correct placement). However, the system prompt contains very specific rules like "--help 参数" and "800x600" defaults — these are implementation standards that might change. Consider: are these truly part of the _role_, or are they _project conventions_ that should be injected as context?

**Architectural implication**: If your system prompt is fully static for a given sub-agent type, the LLM provider can cache it (prompt caching / KV cache reuse). Every dynamic injection into the system prompt creates a cache miss. This matters at scale.

### Principle 5: Failure Mode Design — "Design for the confused agent, not the ideal one"

**WHY**: Most prompt engineers design for the happy path — what should the agent do when everything goes well? But in a delegation architecture, the parent agent is _waiting_ for a result. A sub-agent that silently fails, loops endlessly, or produces garbage output is worse than one that explicitly says "I can't do this." The cost of a confused sub-agent is not just its own wasted tokens — it's the parent agent's inability to recover.

**The Principle**: Every sub-agent prompt must define **what to do when confused** — the explicit escape hatch. This should be the simplest possible action: report what's missing and stop.

**Failure modes to design for**:

1. **Ambiguous instructions**: The task message is unclear or contradictory
2. **Insufficient context**: The agent needs information it doesn't have
3. **Scope creep temptation**: The agent discovers something that "should" be fixed but wasn't asked for
4. **Tool failure**: An underlying tool (file read, LSP, etc.) fails
5. **Impossible task**: The requested change contradicts existing code structure

**Your Implementation — Scorecard**:

- ✅ `ApplyEdit`: "如果指令不清晰或信息不足，直接通过 attempt_completion 说明缺失内容，不要猜测" — This is the gold standard. Clear escape hatch, specific mechanism (attempt_completion), explicit anti-pattern (don't guess).
- ❌ `SearchProject`: No failure mode guidance. What should the agent do if the query is too vague? If the codebase is too large to investigate within token limits? If the relevant code is in a binary or generated file?
- ❌ `BuildTool`: No failure mode guidance. What if the requirement is contradictory? What if the needed dependency isn't available? What if an existing tool already does this?
- ⚠️ `ConsultExpert`: "坦诚边界" is mentioned but vague. "如果某个方面超出你的专业范围" — how does the agent know its own expertise boundaries? Better: "如果你需要查看具体代码才能回答，说明需要哪些信息，不要基于假设推理。"

**Design pattern**: The escape hatch should always specify: (1) the **trigger condition** (when to bail), (2) the **mechanism** (how to bail — usually attempt_completion), and (3) the **content** (what to report — usually what's missing).

### Principle 6: Token Budget Awareness — "Every token in the system prompt competes with context window"

**WHY**: In a delegation architecture, the sub-agent's context window is a fixed resource shared between: (1) system prompt, (2) user message, (3) tool call results (file contents, search results), and (4) the agent's own reasoning. A bloated system prompt directly reduces the agent's capacity to read files and reason about code. This is especially critical for code editing and search agents that need to ingest large amounts of source code.

**The Principle**: Measure your system prompt in tokens, not lines. Set a budget per sub-agent type based on its typical context window usage pattern. Ruthlessly cut anything that doesn't change behavior.

**Budget heuristics** (for a typical 128K context window):

- **Code editing agent**: System prompt should be < 500 tokens. It needs maximum space for file contents.
- **Search/analysis agent**: System prompt should be < 800 tokens. It needs space for multiple file reads and search results.
- **Expert consultation agent**: System prompt can be 800-1500 tokens. Its output is the primary content, not tool results.
- **Tool building agent**: System prompt should be < 1000 tokens. It needs space for writing and testing code.

**Your Implementation — Observations**:

- ⚠️ `ConsultExpert`: The "交付规范" section contains operational instructions about file writing chunk sizes ("每一次修改不要超过500字"). This is a **tool-use workaround**, not a role definition. It appears in ALL FOUR of your system prompts, consuming tokens in each. Consider: is this a platform-level constraint that should be in the base mode's instructions rather than repeated in every sub-agent prompt?
- ⚠️ `BuildTool`: The most verbose system prompt. The "输出限制" section with specific pixel dimensions (800x600) and character limits (2000) is detailed but static. Could this be a reference document the agent reads on demand rather than always in the system prompt?
- ✅ `ApplyEdit`: Relatively lean. Good token discipline.
- ✅ `SearchProject`: The leanest prompt. Appropriate for a tool-heavy agent that needs context space.

**The DRY trap**: You have the "写入文件时...每一次修改不要超过500字" instruction duplicated across all four prompts. This is ~50 tokens × 4 = 200 tokens wasted. If this is a universal constraint, it belongs in the tool definitions or the base system prompt that all modes inherit, not in each sub-agent's override.

---

## Part 2: Critique of Your Implementation

### What's Working Well

**1. The architectural decision itself is sound.** Moving from "shared system prompt + todo list" to "dedicated system prompt per sub-agent" is the right direction. The todo list approach has a fundamental flaw: todos are instructions in the _user message_ space, which LLMs treat as lower-priority than system-level instructions. By moving behavioral constraints into the system prompt, you've increased their binding strength.

**2. The separation between `buildSystemPrompt()` and `buildTaskMessage()` is clean.** This is good software design that mirrors the conceptual separation (Principle 4). It makes it easy to evolve each independently.

**3. ConsultExpert's `consultType` parameterization is elegant.** The `CONSULT_TYPE_GUIDANCE` map is a smart way to vary the _methodology_ while keeping the _identity_ and _constraints_ stable. This is a pattern worth replicating — consider whether other tools could benefit from similar parameterized sections.

**4. SearchProject's tool-preference hierarchy is valuable.** "优先使用 LSP 导航" followed by "辅助搜索" gives the agent a clear decision framework for tool selection. This is better than just listing available tools.

### What Needs Improvement

**1. Inconsistent structural patterns across the four prompts.** Each prompt has a different section structure:

- ApplyEdit: 身份 → 工作流程 → 编辑规范 → 边界
- ConsultExpert: 身份 → 场景 → 方法论指导 → 交付规范 → 反模式
- BuildTool: 身份 → 工具构建规范 → 工作流程 → 编辑规范
- SearchProject: 身份 → 约束 → 分析方法 → 交付

This inconsistency isn't just aesthetic — it means you're making ad-hoc decisions about what sections each agent needs. **Recommendation**: Define a canonical template with optional sections:

```
# 身份 (required — who you are, one sentence)
# 约束 (required — what you must NOT do)
# 工作流程 (required — phases and exit criteria)
# [Domain-specific section] (optional — methodology, standards, etc.)
# 交付 (required — what "done" looks like)
# 失败处理 (required — what to do when confused)
```

**2. The "邮件场景" framing in ConsultExpert is a double-edged sword.** It's creative — the email metaphor encourages structured, thoughtful responses. But it also introduces a persona layer that may conflict with the agent's actual operating context (it's not actually replying to an email; it's a sub-agent in a tool chain). If the LLM takes the metaphor too literally, it might add email-style pleasantries or refuse to use tools because "email replies don't use tools." Monitor this for behavioral drift.

**3. Language mismatch risk.** All four system prompts are in Chinese, but the codebase and tool names are in English. When the sub-agent needs to write code, read English error messages, or interact with English-language tools, the Chinese system prompt creates a subtle cognitive load — the agent must constantly context-switch between languages. **This is not a recommendation to switch to English** — it's a tradeoff to be aware of. If you observe the agent producing Chinese variable names or Chinese comments in English codebases, this is the cause.

**4. Missing "contract with parent" section.** None of your sub-agent prompts explicitly state: "You are a sub-agent. Your output will be consumed by a parent agent, not a human. Optimize for machine-parseable results." This matters because LLMs default to human-friendly output (verbose explanations, markdown formatting). If the parent agent needs to parse the sub-agent's result programmatically, the sub-agent needs to know this.

---

## Part 3: Tradeoff Matrix

The six principles above are not always compatible. Here are the key tensions:

### Tension 1: Identity Compression vs. Boundary Explicitness

- **Compression** wants fewer words: "你是一个精确的代码编辑器" should be enough.
- **Boundary Explicitness** wants more words: list every thing the agent shouldn't do.
- **Resolution**: Compress the identity, expand the boundaries. A one-sentence identity + a detailed boundary list is better than a paragraph-long identity that tries to encode boundaries implicitly. The identity is the _anchor_; the boundaries are the _guardrails_.

### Tension 2: Workflow Scaffold vs. Token Budget

- **Scaffold** wants to define phases, exit criteria, and decision points — this takes tokens.
- **Token Budget** wants the system prompt to be as lean as possible.
- **Resolution**: This depends on the agent's **autonomy level**. High-autonomy agents (BuildTool, ConsultExpert) benefit more from scaffolds because they make more decisions. Low-autonomy agents (ApplyEdit) need minimal scaffolds because their task is narrow. Budget your scaffold tokens proportionally to the agent's decision space.

### Tension 3: Instruction-Prompt Separation vs. Behavioral Binding Strength

- **Separation** says task-specific details belong in the user message.
- **Binding Strength** says critical constraints in the user message may be ignored under pressure (long context, complex reasoning).
- **Resolution**: Use the **"would ignoring this cause harm?" test**. If ignoring a constraint would cause the agent to break things (e.g., "read-only, no edits"), it belongs in the system prompt regardless of whether it's task-specific. If ignoring it would just produce suboptimal output (e.g., "prefer JSON output"), the user message is fine.

### Tension 4: Failure Mode Design vs. Agent Confidence

- **Failure Mode Design** wants the agent to bail early when uncertain.
- But **too many escape hatches** create a timid agent that gives up at the first ambiguity instead of using reasonable judgment.
- **Resolution**: Define escape hatches for **structural** problems (missing files, contradictory instructions, impossible constraints) but NOT for **judgment** problems (which approach is better, how to name a variable). The agent should bail when it _can't_ proceed, not when it's _unsure_ how to proceed.

### Tension 5: Static System Prompt (Cacheable) vs. Dynamic Parameterization

- **Static prompts** enable KV cache reuse across invocations — significant latency and cost savings.
- **Dynamic parameterization** (like ConsultExpert's `domain` injection) produces more tailored behavior.
- **Resolution**: Measure the actual behavioral difference. If injecting `domain` into the identity produces measurably better results than putting it in the user message, the cache miss is worth it. If not, prefer static prompts. In practice, for strong models (Claude 3.5+, GPT-4+), putting the domain in the user message with a static system prompt often works just as well — the model is good enough to infer the role from context.

### Quick Reference Table

| Situation                          | Prioritize            | Over                     | Reason                          |
| ---------------------------------- | --------------------- | ------------------------ | ------------------------------- |
| Agent has narrow scope (ApplyEdit) | Token Budget          | Scaffold                 | Few decisions to make           |
| Agent has wide scope (BuildTool)   | Boundary Explicitness | Token Budget             | More ways to go wrong           |
| Constraint violation causes harm   | Binding Strength      | Separation               | Safety over elegance            |
| High invocation frequency          | Static Prompt (cache) | Dynamic Parameterization | Cost/latency at scale           |
| Parent needs structured output     | Failure Mode Design   | Agent Confidence         | Bad output worse than no output |

---

## Part 4: Decision Framework

When designing or reviewing a sub-agent system prompt, run through this checklist:

### Step 1: Define the Agent's Decision Space

Before writing any prompt, answer: **How many degrees of freedom does this agent have?**

- **Low freedom** (ApplyEdit): Input is specific, output is specific, method is constrained. → Lean prompt, strong boundaries, minimal scaffold.
- **Medium freedom** (SearchProject): Input is specific, output is specific, but method is flexible. → Medium prompt, tool-preference hierarchy, phase-based scaffold.
- **High freedom** (BuildTool, ConsultExpert): Input is abstract, output format is flexible, method is open. → Richer prompt, detailed boundaries, methodology scaffold.

### Step 2: Write the Identity (Principle 1)

Write one sentence. Test it: cover everything else and ask "can I predict this agent's refusal behavior?" If not, sharpen it.

### Step 3: Derive Boundaries from Failure Modes (Principles 2 + 5)

For each agent, enumerate the top 3 "eager junior engineer" mistakes:

| Agent         | Mistake 1                  | Mistake 2                                 | Mistake 3                                 |
| ------------- | -------------------------- | ----------------------------------------- | ----------------------------------------- |
| ApplyEdit     | Refactors unrelated code   | Adds unrequested comments                 | Guesses when instructions are unclear     |
| SearchProject | Edits files it finds       | Investigates endlessly without concluding | Returns raw tool output without synthesis |
| BuildTool     | Over-engineers             | Adds unnecessary dependencies             | Builds a framework instead of a tool      |
| ConsultExpert | Writes implementation code | Agrees with flawed premises               | Gives vague "it depends" non-answers      |

Each mistake becomes a boundary statement. Each boundary should specify: what NOT to do + what to do INSTEAD.

### Step 4: Design the Workflow Scaffold (Principle 3)

Define 2-4 phases. For each phase, specify:

- **Purpose**: Why this phase exists
- **Exit criterion**: How the agent knows it's done with this phase
- **Failure escape**: What to do if this phase can't be completed

### Step 5: Separate Static from Dynamic (Principles 4 + 6)

Draw a line through your prompt. Everything above the line is **static** (same for every invocation of this agent type). Everything below is **dynamic** (varies per invocation).

- Static content → system prompt
- Dynamic content → user message
- Exception: dynamic content that is **safety-critical** → system prompt (accept the cache miss)

### Step 6: Token Audit

Count tokens. Compare against the budget heuristics from Principle 6. If over budget:

1. First cut: duplicated instructions that exist in the base mode or tool definitions
2. Second cut: examples (they're expensive; use them only if behavior is wrong without them)
3. Third cut: merge similar boundary statements
4. Last resort: move detailed methodology to a reference file the agent can read on demand

### The "One-Shot Review" Test

After writing a sub-agent prompt, do this test:

1. Show the system prompt + a sample user message to a colleague (or yourself after a break)
2. Ask: "What will this agent do? What will it refuse to do? What will it do when confused?"
3. If the answers are clear and correct → the prompt is good
4. If there's ambiguity → the prompt needs sharpening at exactly the point of ambiguity

---

_Generated by ConsultExpert sub-agent, 2026-02-27_
