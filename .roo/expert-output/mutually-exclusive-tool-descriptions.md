# How to Write Standalone Descriptions for Mutually Exclusive Tools

**Consultation Topic**: Tool description design when two tools with overlapping capability are never co-present  
**Date**: 2026-03-16  
**Context**: `edit` (exact search/replace) vs `apply_edit` (agent-based NL editing) in Roo-Code

---

## 1. The Core Problem: Phantom Reference Contamination

When a model sees a tool description, it builds a mental model of its **affordance space** — what it can do, when to use it, and what it _can't_ do. The problem you've identified is what I call **phantom reference contamination**: language in a description that implies the existence of tools the model cannot see, creating a "ghost" in the model's reasoning.

This manifests in three ways:

| Symptom                      | Example                                        | Effect                                                                             |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Explicit cross-reference** | "vs apply_edit"                                | Model searches for a tool that doesn't exist, may hallucinate it                   |
| **Implicit scope narrowing** | "Single precise text replacement"              | Model infers this tool is _only_ for simple cases, hesitates on complex edits      |
| **Capability gap signaling** | "without manually tracking exact code content" | Model infers there's a "better" tool for that scenario, may refuse or ask the user |

The fundamental insight: **a tool description is not documentation — it's a prompt fragment**. It's injected into the system/user message and shapes the model's behavior. Every word must be evaluated not for human readability, but for how it steers model behavior.

---

## 2. The Design Principle: Closed-World Completeness

Each description must operate under the **closed-world assumption**: the model should behave as if this tool is the _only_ way to modify files. This doesn't mean the description must be generic — it means it must be **complete within its own frame**.

### The Tension You're Experiencing

You described being stuck between:

- **Too narrow**: "This tool does exact search/replace" → model won't use it for complex refactors
- **Too generic**: "This tool edits files" → model loses guidance on _how_ to use it effectively

This is a false dilemma. The solution is to **separate the WHAT from the HOW**:

- **WHAT** (capability scope) → should be broad and complete: "This is THE tool for all file modifications"
- **HOW** (operational guidance) → should be specific and mechanical: "Here's exactly how to use it well"

The narrowness problem comes from conflating capability scope with operational mechanics. The genericness problem comes from stripping operational mechanics to broaden scope.

---

## 3. Rewrite Framework: The SCUM Pattern

For each mutually exclusive tool, structure the description using **SCUM**:

### S — Summary (one sentence)

What this tool IS, stated as a complete capability. No hedging, no scope-limiting adjectives.

### C — Coverage (scenario enumeration)

Explicitly enumerate the scenarios this tool handles. This is where you prevent the "too narrow" problem — by showing breadth through examples, not through vague language.

### U — Usage (mechanical how-to)

Concrete examples showing the tool's parameters in action. This is where you prevent the "too generic" problem — by being precise about mechanics.

### M — Mechanics (constraints and gotchas)

Hard rules the model must follow. These are tool-specific and don't change between variants.

---

## 4. Concrete Rewrites

### 4.1 `edit` — Standalone Version

```
Edit a file by replacing exact text matches. This is the primary tool for all code modifications — from single-line fixes to multi-location refactors. The file must already exist.

**When to Use**: Single-location change with known content.
- edit({ path: "src/config.ts", search: "const timeout = 5000;", replace: "const timeout = 10000;", expectedMatches: null })

**When to Use**: Renaming or replacing a pattern across an entire file.
- edit({ path: "src/utils.ts", search: "oldName", replace: "newName", expectedMatches: 3 })

**When to Use**: Multi-step refactor — call edit multiple times in sequence.
- First: edit({ path: "src/api.ts", search: "import { old } from './lib';", replace: "import { new } from './lib';", expectedMatches: null })
- Then: edit({ path: "src/api.ts", search: "old(", replace: "new(", expectedMatches: 4 })

**Constraints**: You must read the file before editing. search must match exactly including whitespace and indentation. expectedMatches defaults to 1 — mismatch returns an error.
```

**What changed and why:**

1. **First sentence expanded**: Added "This is the primary tool for all code modifications" — establishes closed-world completeness. The model now knows this is THE tool, not A tool.

2. **Added third scenario**: "Multi-step refactor — call edit multiple times in sequence" — this is critical. Without it, the model sees a tool that does one replacement at a time and may conclude it's inadequate for complex changes. By explicitly showing the composition pattern, you teach the model that complex = multiple simple calls.

3. **Removed implicit narrowing**: The original "Single precise text replacement" is gone. Instead, the first example is labeled "Single-location change with known content" — same specificity, no implication of limitation.

4. **No references to other tools**: Zero phantom references.

### 4.2 `apply_edit` — Standalone Version

```
Edit and modify code using natural language instructions. This is the primary tool for all code modifications — a sub-agent interprets your instruction and performs the changes with automatic validation.

**When to Use**: Targeted change in a known file.
- apply_edit({ instruction: "Change the timeout constant from 5000 to 10000 in src/config.ts", files: "src/config.ts", context: null, validate: "none" })

**When to Use**: Batch changes across multiple locations or files.
- apply_edit({ instruction: "Replace all console.log with logger.debug", files: "/workspace/src/utils/*.ts", context: null, validate: "npm run typecheck" })

**When to Use**: Complex refactor with validation.
- apply_edit({ instruction: "Extract the database connection logic from UserService into a new DatabasePool class. Update all imports.", files: "src/services/UserService.ts,src/services/*.ts", context: "The connection pool should be a singleton", validate: "npm run typecheck && npm test" })

**Tips**: Be specific in instructions — include function names, variable names, and line numbers when known. Use the validate parameter to catch regressions automatically.
```

**What changed and why:**

1. **Same "primary tool" framing**: Both tools claim to be THE tool. This is intentional — they're never co-present, so there's no conflict.

2. **Added complex refactor example**: Shows the tool can handle architectural changes, not just find-and-replace. This prevents the model from self-limiting.

3. **"Tips" instead of "Constraints"**: `apply_edit` has softer constraints (the sub-agent handles the mechanics), so guidance is framed as optimization tips rather than hard rules.

4. **No references to exact matching, search/replace, or manual tracking**: Zero phantom references to the `edit` paradigm.

---

## 5. Best Practices Checklist

Use this to self-audit any mutually exclusive tool description:

### ✅ Completeness Checks

- [ ] **Closed-world test**: Read the description pretending no other editing tools exist. Does the model have everything it needs to handle any file modification task?
- [ ] **Complexity coverage**: Does the description show at least 3 complexity levels (simple, medium, complex)? If only 1-2 are shown, the model will infer a ceiling.
- [ ] **Composition pattern**: If the tool handles complex tasks through multiple calls, is that pattern explicitly demonstrated?
- [ ] **No phantom references**: Search for any word that only makes sense if another tool exists. Common culprits: "precise", "simple", "quick", "without", "instead of", "vs", "unlike", "manual".

### ✅ Specificity Checks

- [ ] **Mechanical clarity**: Can the model construct a valid tool call from the description alone, without guessing parameter formats?
- [ ] **Constraint explicitness**: Are hard constraints (must read first, exact match required, etc.) stated as rules, not implications?
- [ ] **Example diversity**: Do examples cover different parameter combinations, not just the happy path?

### ✅ Behavioral Steering Checks

- [ ] **No hesitation triggers**: Remove language that might cause the model to doubt the tool's applicability ("only for", "best for", "primarily", "simple").
- [ ] **Affirmative framing**: State what the tool DOES, not what it doesn't do. "Handles all modifications" > "Not limited to simple changes".
- [ ] **Scope claim**: The first sentence should establish this tool as THE way to do its category of work.

---

## 6. Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Comparative Positioning

**Bad**: "Use edit for precise, known changes. Use apply_edit for complex refactors."  
**Why it fails**: Even if only one tool is visible, the comparative framing creates an implicit "other half" in the model's reasoning.  
**Fix**: Each tool describes its own full scope without comparison.

### ❌ Anti-Pattern 2: Capability Hedging

**Bad**: "Edit a file by replacing exact text matches."  
**Why it fails**: The model reads "exact text matches" as a limitation, not a mechanism. It may avoid the tool when it's unsure about exact content.  
**Better**: "Edit a file by replacing exact text matches. This is the primary tool for all code modifications..."  
**Why it works**: The mechanism is still stated (the model needs to know HOW), but the scope is explicitly broadened.

### ❌ Anti-Pattern 3: Implicit Complexity Ceiling

**Bad**: Only showing simple examples.  
**Why it fails**: LLMs use in-context examples as behavioral anchors. If all examples are simple, the model will only use the tool for simple tasks.  
**Fix**: Always include at least one complex/multi-step example.

### ❌ Anti-Pattern 4: Negative Space Definition

**Bad**: "For modifying existing files, use editing tools instead." (from your `write.ts`)  
**Why it's tricky**: This one is actually fine in `write.ts` because it's a _generic_ reference ("editing tools") that correctly steers away from write-for-edit. But if it said "use edit instead" or "use apply_edit instead", it would be a phantom reference.  
**Rule of thumb**: Generic category references ("editing tools", "other tools") are safe. Specific tool name references are not, unless that tool is guaranteed to be co-present.

### ❌ Anti-Pattern 5: The "Swiss Army Knife" Description

**Bad**: "A versatile tool for editing files in any way."  
**Why it fails**: Too generic = no behavioral guidance. The model doesn't know WHEN to reach for it or HOW to use it effectively. You get correct tool selection but poor tool usage.  
**Fix**: Broad scope claim + specific mechanical examples. "This is THE tool for all modifications" (scope) + "here are 3 concrete examples at different complexity levels" (mechanics).

---

## 7. The Deeper Design Principle: Description as Behavioral Contract

Think of a tool description as a **behavioral contract** with three clauses:

1. **Capability Clause** (WHAT): "I can handle X, Y, Z" — should be exhaustive for the tool's category
2. **Mechanical Clause** (HOW): "Here's how to invoke me correctly" — should be precise and example-driven
3. **Boundary Clause** (WHEN NOT): "Don't use me for W" — should only reference categories, never specific alternative tools

The mistake most people make is putting tool-selection logic in the description ("use me for A, use other-tool for B"). This works when tools are always co-present, but breaks catastrophically when they're mutually exclusive. Instead, make each description self-sufficient: the model should never need to compare tools to decide — it should see one tool and know it's the right one.

---

## 8. Edge Case: What About `write.ts`?

Your `write.ts` says: "For modifying existing files, use editing tools instead."

This is a **co-present boundary reference** — `write` is always available alongside whichever editing tool is active. The generic phrasing "editing tools" is correct because:

- It doesn't name a specific tool
- It steers the model toward whatever editing tool IS present
- It works regardless of whether `edit` or `apply_edit` is the active editor

This is actually a good pattern. If you ever need cross-tool steering, use **category references** ("use the editing tool", "use the file creation tool") rather than **name references** ("use edit", "use apply_edit").

---

## 9. Testing Your Descriptions

After rewriting, validate with these tests:

1. **Solo reading test**: Show the description to a colleague (or yourself after a break) with NO context about other tools. Ask: "What can this tool do? What can't it do?" If they infer a limitation that doesn't exist, the description is leaking phantom references.

2. **Scenario coverage test**: List 10 real editing tasks from your project history (ranging from trivial to complex). For each, ask: "Would the model confidently reach for this tool?" If any scenario feels uncovered, add an example at that complexity level.

3. **A/B behavioral test**: Run the same 20 coding tasks with each description variant. Measure:

    - Tool selection accuracy (did the model use the right tool?)
    - Tool usage quality (did it construct good parameters?)
    - Hesitation rate (did it ask the user instead of acting?)

4. **Phantom reference grep**: Literally search the description for words that only make sense in a multi-tool context: "precise", "simple", "quick", "manual", "exact" (when used as a scope limiter vs. a mechanical requirement), "vs", "instead", "unlike", "alternative".

---

## 10. Summary of Key Takeaways

1. **Separate scope from mechanics**: Broad capability claim + specific usage examples. Never let mechanical specificity narrow perceived scope.

2. **Closed-world assumption**: Each description must work as if it's the only editing tool in existence.

3. **Three complexity levels minimum**: Simple, medium, complex examples. The model anchors on example complexity.

4. **Show composition patterns**: If complex tasks require multiple calls, demonstrate that explicitly.

5. **Category references only**: When steering away from a tool, reference categories ("editing tools") not names ("edit").

6. **Descriptions are prompts**: Every word shapes model behavior. Audit for behavioral impact, not just human readability.
