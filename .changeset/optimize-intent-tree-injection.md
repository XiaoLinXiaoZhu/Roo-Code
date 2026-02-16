---
"roo-code": patch
---

优化 intent tree 在 environment details 中的注入策略：将 intentTreeUpdated 从 boolean 改为三级标记（structural/minor/false），只在结构性变化（restructure 操作）时注入完整树摘要，减少不必要的注意力偏移和 token 消耗。
