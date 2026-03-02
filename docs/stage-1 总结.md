# Stage 1 总结

> 本文档客观概述 `docs/stage-1/` 下每个文件夹的内容要点。评价部分待用户逐一审阅后填入。

---

## 1. sprite-polish/（系统提示词打磨）

**文件**：`alignment-record.md`（对齐记录）、`prompt-optimization-todos.md`（优化清单）、`raw.md`（原始讨论）

**内容概述**：

围绕 `spirit.ts` 系统提示词（精神内核）进行的多轮打磨工作。

- **精神内核对齐**：对 Roo 的三大精神内核进行了深度讨论和重新对齐，澄清核心原则的理解
- **Spirit v3.0 → v4.0 升级**：Identity 精简为行为锚点（~30 tokens）；12 个抽象 behavior tags 改为 10 个可执行 behaviors（含触发条件、步骤、违规示例）；解决了 `default_to_action` 与 `goal_discovery` 的冲突
- **roleDefinition 与 Spirit 职责边界清理**：Spirit 不再包含"你是谁"，只说"你怎么做事"；7 个 mode 的 roleDefinition 统一为"身份 + 能力范围"格式
- **工具描述优化**：`go_to_definition` / `find_references` 描述重写，添加反向引导；后续改名为 `find_definition` / `find_usages`
- **Hints 上下文感知**：实现 `HintContext` 接口和 `getContextualSpriteHint()` 函数，按主题索引 hints，根据上下文信号选择

---

## 2. environment/（环境信息优化）

**文件**：`优化environment-detail.md`

**内容概述**：

对 `getEnvironmentDetails` 输出的优化，以及 Hints 系统的进一步讨论。

- **已完成的优化**：文件列表仅在对话开始时提示；environment 内容改为 XML 格式增强可读性；文件列表改为分层目录树展示；相似文件自动折叠（≥5 个时折叠为 `<files pattern="..." count="N"/>`）；文件列表不再受 .gitignore 过滤，仅受 .rooignore 控制
- **文件列表的核心认知**：文件列表的真正价值不是"让 AI 知道有哪些文件"，而是给 AI 提供"察觉联动"的可能性（Unknown Unknowns → Known Unknowns）
- **未来方向**：上下文感知的联动文件推荐（基于 import 依赖分析、约定规则、git co-change 分析、TypeScript 类型联动等）
- **Hints 优化讨论**：发现 `getSpriteHintByType()` 是死代码；评估了 4 个新信号（采纳 `lastToolName`，暂缓 `isDebuggingLoop`，不需要 `currentMode` 和 `recentFileExtensions`）；确定了 4 个优化方向的优先级：通用实操 hints > 对齐 v4.0 > 加 lastToolName 信号 > 去重衰减（暂缓）

---

## 3. better-tools/（下一代工具设计）

**文件**：`00-overview.md`（白皮书）、`实现时的patch/`（8 个实现补丁文档）

**内容概述**：

对 Roo Code 工具系统的全面重新设计讨论，涵盖 4 个主要方向。

- **长文本工具 Markdown 格式优化**：让 `write_to_file` 等工具支持 Markdown 格式输入，改善长文本编辑体验
- **CLI 代理层设计**：在 `execute_command` 内部实现进程内命令拦截（而非命令重写），对 grep/cat/head 等常用命令进行输出优化、安全边界控制和管道支持；最终目标是模型只需学习 `execute_command` 一个工具
- **AST 代码智能（LSP 集成）**：通过调用 VSCode LSP API 实现 `go_to_definition` 和 `find_references` 工具，替代基于搜索+猜测的代码理解方式；方案对比后选择 VSCode LSP API（1-2 周）而非自建 tree-sitter 符号索引（2-3 月）
- **实现路线图**：Phase 1 Markdown 格式支持 → Phase 2 CLI 代理层基础 → Phase 3 管道支持 → Phase 4 专用工具迁移 → Phase 5 高级特性
- **实现补丁**：包含工具描述优化、构建工具用的工具、管道语义与元信息分离、提示词系统打磨、长文本工具优化、AST 分析支持、CLI 代理层透明性设计等 8 个具体实现讨论

---

## 4. xy-promlem/（XY 问题与 Intent Tree）

**文件**：`现状.md`（问题分析）、`intent-tree-设计.md`（核心设计）、`intent-tree-ui-设计.md`（前端 UI 设计）

**内容概述**：

从 XY 问题的根因分析出发，设计了 Intent Tree 功能。

- **问题诊断（现状.md）**：多轮对话中信息在传递中被"注水"——助手把已有实现误当约束，在约束的实现上再次实现，只能以 patch 形式修改，导致淤塞积累。根本原因是用户的原始意图（Y）没有被保护和传递，每一步实现都不知道最初的意图
- **期望工作模式**：助手应主动追溯用户的真实目标（Y），将 goal（约束）和 impl（实现）分离；当新需求到来时能关联历史需求找到共性，而非在已有实现上堆叠 patch
- **Intent Tree 核心设计**：4 层节点类型 goal → objective → approach → impl，上层为约束（稳定的 What），下层为实现（可替换的 How）；与 git commit 绑定；支持 add/update/prune/commit/restructure 5 个工具
- **发现的问题与改进**：goal 发现的渐进性 vs 树结构的静态性；shortId 复用问题（改用递增计数器）；类型调整的静默修正（改为显式通知）；缺乏重构能力（新增 restructure_intent 工具支持 reparent/promote/extract_common_parent）
- **命名演化 GSPI → GOAI**：subgoal → objective（暗示可验证的结果状态）、path → approach（避免与 file path 歧义，暗示方法论）；借鉴 Theory of Change 增加 assumption 字段
- **前端 UI 设计**：基于 ToolUseBlock 组件体系的树状可视化方案，包含节点类型图标/颜色、状态样式、5 个工具各自的结果展示组件、交互设计和数据流

---

## 5. deep-thinking/（深度推理模式探索）

**文件**：`SPIRIT-v5-重度推理实验记录.md`（实验记录）、`CoT与FewShot设计指南.md`（理论指南）

**内容概述**：

基于论文《The Molecular Structure of Thought》的理论，探索将系统提示词从声明式改为推理式。

- **理论基础（CoT 指南）**：有效的 Long CoT 不是线性链，而是类似分子的折叠结构；三种"化学键"——Deep Reasoning（逻辑主干 ~40-50%）、Self-Reflection（逻辑折叠 ~15-25%）、Self-Exploration（搜索空间拓展 ~10-20%）；关键词不重要，行为结构才重要
- **SPIRIT v5.1 实验**：将 v4.0 的 3 个 Value 声明式起点改为 6 个 Fact（公理级观察），通过 9 条推理链（每条 14+ 步，含元认知振荡）自然导出 10 条行为准则 + Intent Tree 用法 + 优先级规则
- **专家审查修复**：C3（验证优于提问）vs C5/C6（积极沟通）的张力——区分 ask 的信息获取型和沟通型两种用途；反思比例过高（36% vs 建议 15-25%）——将冗余反思转为 Normal Operation；Normal Operation 几乎为零——增加事实陈述和直接总结；Intent Tree 格式的诚实性——承认 XML 格式是设计决策而非推理涌现
- **已知局限**：元认知内容天然偏向反思的分布悖论；无法严格量化对齐度；效果未经 A/B 测试；token 成本增加约 16%
- **可迁移技巧**：Facts → Reasoning → Conclusions 模式；区分"可推导"和"外部约束"；用专家审查校验行为分布；工具角色的精确区分；框架+占位符的写入策略

---

## 6. context-archive/（上下文归档）

**文件**：`上下文归档.md`（问题与方案）、`讨论记录-2026-02-09.md`（深入讨论）

**内容概述**：

围绕多轮对话中上下文丢失问题的分析和解决方案设计。

- **现有问题**：总结式归档可能产生偏差且需额外上下文空间（~20%）；截断式归档丢失早期重要决策信息
- **核心洞察**：对话中信息重要性不平等（任务目标 ★★★★★ vs 对话噪声 ★☆☆☆☆），现有方案一视同仁；源头结构化优于事后提取；应记录 Y（为什么）而不是 X（做了什么），因为"做了什么"可从 git 恢复，"为什么"只存在于上下文中
- **认知锚点概念**：将"上下文归档"重新定义为"认知锚点"——在关键认知节点创建可恢复的思维快照；与 Checkpoint（代码快照）正交互补
- **文档结构设计**：项目级 `.task/` 目录，包含 `BRIEF.md`（任务简报，强制 Y-first）、`PROGRESS.md`（执行进度）、`DECISIONS.md`（决策日志）
- **分层触发机制**：Layer 1 规则内化（System Prompt）→ Layer 2 被动检查（Completion Guard）→ Layer 3 主动提醒（Hints，基于 git 变更量）
- **最终实施决策**：融入现有精神而非打补丁——在 Spirit Kernel 中新增任务原子化原则，在 Hints 中新增记录 Y 的提醒

---

## 7. agent-as-tools/（Agent as Tools 架构）

**文件**：`README.md`（架构白皮书）、`polish-1.md`（系统提示词优化）、`design-legacy/`（6 个设计文档 + 1 个实现文档）

**内容概述**：

将子智能体从"代理协作"模式重构为"工具调用"模式的架构设计与实现。

- **核心理念**：将 agent 拉到 tool 层面，纯化为工具，放弃"代理"、"协作"的概念；主模型只关心返回结果，不关心内部实现（认知减负、模块解耦、自然交互、结果导向）
- **新旧架构对比**：旧架构（Subagent）需要父任务理解委派、管理状态转换、理解模式适用场景；新架构（Agent as Tools）工具化封装，自然语言接口，主模型无需理解内部实现
- **4 个工具**：`consultExpert`（咨询专家）、`applyEdit`（代码编辑）、`buildTool`（工具构建）、`searchProject`（项目搜索）
- **系统提示词优化（polish-1）**：发现 4 个工具共用同一 system-prompt 导致注意力分散；改为每个工具配置专有系统提示词，通过 `systemPromptOverride` 覆盖模式提示词；移除 todo+instruction 控制方式，只将具体问题作为指令传入
- **设计文档**：包含架构概述、工具接口设计规范、边界处理与模糊定义、迁移计划、系统提示词设计、代码实现计划

---

## 8. vedio-upload/（视频上传工具）

**文件**：`sample.md`（API 调用示例）、`upload-oss.ts`（OSS 上传脚本）

**内容概述**：

与主项目关联较弱的辅助工具代码。

- **视频上传 API 示例**：Moonshot (Kimi) API 的视频上传调用示例，使用 base64 编码视频通过 `video_url` 类型发送给模型进行视频内容描述
- **OSS 上传脚本**：Tauri 桌面客户端（Pie Desktop）的发布脚本，功能包括：构建产物上传到阿里云 OSS、生成更新清单 JSON（支持 stable/edge 双渠道）、发送飞书 Webhook 通知；与 Roo Code 的提示词/工具优化主线无直接关联
