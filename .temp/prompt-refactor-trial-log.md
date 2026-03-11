# 提示词重构试错归档 (2026-03-10)

## 目标

按 `prompt-design-principles.md` 的评分场景模式重构系统提示词体系。

## 尝试了什么

### 第一版：精简评分场景（失败）

- 将 spirit.ts 的 few-shot 示例删除，替换为干巴巴的评分规则条目
- 砍掉了所有正反例对比、因果解释、实际场景实践
- 用户评价："困惑度极其高，语言措辞混杂，逻辑狗屁不通，损失了大量信息"

### 第二版：任务说明格式（失败）

- 将 roleDefinition 从"你是一个 debugger"改为"对齐目标+期望产物+评估重点"
- 将 customInstructions 改为"额外评分指标（加分/扣分项）"
- 问题：仍然只有抽象规则，没有具体示范；没有 long-CoT 示例

### 第三版：加回正反例（部分改善但仍不达标）

- 加回了 ❌/✅ 评分应用示例、3.25 vs 3.75 调试记录对比、提交类型评分表
- 仍然缺失：
    - `<hint>` 用户输入包装机制
    - Programmatic Tool Calling 正反例
    - "期望行为→评分细则→心理机制"映射总表
    - `<example>` XML tag 包裹示例
    - long-CoT 思考路径示例（反思、探索、振荡结构）
    - `toolname({"param": "value"})` 统一格式
    - 五段式结构（Background → Tools → Constraints → Specification → Examples）

## 核心教训

1. **设计原则文档不是摘要来源，是实现规格** — 每个正反例、每个因果表格都有其存在的理由（心理机制），不能"精简"
2. **删除旧模式 ≠ 删除教学** — spirit.ts 的 long-CoT 示例应该被重写为评分场景格式，而不是直接删除
3. **过早声称完成是最大的浪费** — 两次 attempt_completion 都被打回，每次都浪费了用户的审查时间
4. **快照脚本必须与 system.ts 同步** — 否则审查的不是实际提示词
5. **stage-1 反思中的格式要求是硬约束** — `<example>` XML tag、`toolname({"param": "value"})` 格式、long-CoT 模式

## 未完成的工作

- [ ] exec.ts 工具描述精简（从未检查过）
- [ ] system-info.ts 是否实际调用 detectEnv()（从未验证）
- [ ] spirit.ts 物理文件删除
- [ ] generate-snapshots.ts 与 system.ts 同步

## 保留的文件

- `.temp/prompt-refactor-attempt-2026-03-10.diff` — 完整的 git diff
- 本文件 — 试错记录
