# 从旧架构的迁移计划

## 1. 迁移总览

### 1.1 迁移目标

```
┌─────────────────────────────────────────────────────────────┐
│                       迁移路线图                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  阶段一 (Week 1-2)     阶段二 (Week 3)      阶段三 (Week 4)   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ 新工具实现    │ →  │ 兼容层建设    │ →  │ 旧工具移除    │  │
│  │              │    │              │    │              │  │
│  │ • searchProj │    │ • 特性开关    │    │ • new_task   │  │
│  │ • applyEdit  │    │ • A/B测试     │    │ • switch_mod │  │
│  │ • consultExp │    │ • 渐进迁移    │    │   e          │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心原则

| 原则         | 描述                       |
| ------------ | -------------------------- |
| **渐进式**   | 不做大爆炸式切换，逐步迁移 |
| **可回滚**   | 每个阶段都可以安全回退     |
| **可观测**   | 迁移过程有充分的监控和日志 |
| **向后兼容** | 过渡期内新旧架构并存       |

### 1.3 影响范围分析

```typescript
// 需要修改的文件清单
const AFFECTED_FILES = {
	// 核心修改
	"src/core/tools/": [
		"index.ts", // 添加新工具导出
		"SearchProjectTool.ts", // 新增
		"ApplyEditTool.ts", // 新增
		"ConsultExpertTool.ts", // 新增
	],

	// 配置修改
	"src/shared/modes.ts": "添加新工具到工具组",
	"src/shared/tool-groups.ts": "定义新工具组",

	// 提示词修改
	"src/core/prompts/system.ts": "更新工具描述",

	// 可能的轻微修改
	"src/core/task/Task.ts": "工具上下文传递",
	"src/extension/providers/ClineProvider.ts": "特性开关",
}
```

## 2. 阶段一：新工具实现

<!-- PLACEHOLDER: phase1-implementation -->

## 3. 阶段二：兼容层建设

<!-- PLACEHOLDER: phase2-compatibility -->

## 4. 阶段三：旧工具移除

<!-- PLACEHOLDER: phase3-removal -->

## 5. 风险评估与回滚计划

<!-- PLACEHOLDER: risk-assessment -->

## 6. 验收标准

<!-- PLACEHOLDER: acceptance-criteria -->

---

下一篇：[04-prompts.md](./04-prompts.md) - 系统提示词设计
