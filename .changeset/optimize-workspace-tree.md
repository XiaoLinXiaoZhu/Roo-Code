---
"roo-cline": patch
---

优化 environment_details 文件列表展示

- 文件列表改为分层目录树格式，优先展示目录层级架构
- 同目录下相似文件名（≥5个）自动折叠为摘要（如 `<files pattern="*-release.png" count="60"/>`）
- listFiles 默认不受 .gitignore 过滤，让本地重要目录（.report/、.roo/ 等）出现在文件列表中
- 首次初始化时若无 .rooignore，自动从 .gitignore 复制一份作为模板
- 可通过 .env 中 ROO_RESPECT_GITIGNORE=1 恢复 gitignore 过滤
