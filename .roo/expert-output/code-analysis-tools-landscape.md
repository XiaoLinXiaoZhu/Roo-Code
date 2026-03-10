# 各主流编程语言的程序化代码分析工具版图：面向 AI 编码助手的选型备忘录

## 1. 问题重述

你的核心决策不是“有没有 ts-morph 的跨语言等价物”，而是：

**当 AI 助手需要做定义查询、引用查找、重命名、符号理解时，应该把‘代码智能’能力建立在哪一层。**

通常有三层：

1. **语法层（parser / AST）**：只理解结构，不理解完整语义
2. **语义层（type checker / compiler API / indexer）**：理解绑定、类型、作用域、可解析引用
3. **协议/服务层（LSP / language server / code intelligence daemon）**：把语义能力以统一接口暴露出来

如果你打算让模型通过 `exec` 调用脚本，而不是内置 LSP 工具，真正要比较的不是“库 vs CLI”这么简单，而是：

- 你是否愿意自己维护**语言特定适配层**
- 你是否需要**跨语言统一能力模型**
- 你是否接受**不同语言分析精度严重不对称**
- 你是否要在**一次性脚本**和**常驻索引服务**之间做架构权衡

我的核心判断先给出来：

> **对于 AI 编码助手，最稳妥的架构通常不是“纯 AST 脚本方案”，也不是“完全依赖编辑器内 LSP”，而是“每种语言优先复用其官方/事实标准语义引擎，通过 CLI 或轻量 RPC 统一接入；AST 仅作为降级与补充”。**

原因很简单：

- “查找定义/引用/重命名”本质上是**语义问题**，不是 AST 问题
- AST 库擅长结构遍历、模式匹配、代码变换；但一旦涉及别名、导入解析、继承、宏、条件编译、工作区配置，纯 AST 很快失真
- 让模型调用 `exec` 并不等于必须放弃语言服务器；完全可以通过 `exec` 去调用语言专用 CLI、编译器 API 封装脚本、或你自建的守护进程

下面我按“方法论 + 工具版图 + 选型建议 + 反模式 + 检查清单”的方式展开。

---

## 2. 先从第一性原理看：你到底在求什么能力

### 2.1 不同任务对应不同分析层

很多团队把这些工具混为一谈，结果是用错层级。

| 任务                                | AST 足够吗 |         需要语义吗 | 典型工具层                   |
| ----------------------------------- | ---------: | -----------------: | ---------------------------- |
| 提取函数/类/导入结构                |   通常足够 |         通常不需要 | parser / AST                 |
| 按语法模式搜索（如所有 async 函数） |       足够 |             不需要 | AST / CST / query engine     |
| 格式化、简单 codemod                |   多数足够 |             视情况 | AST transform                |
| 查找定义                            |   常常不够 |               需要 | compiler API / LSP           |
| 查找引用                            |   常常不够 |               需要 | compiler API / indexer / LSP |
| 安全分析、调用图、跨文件依赖图      |   常常不够 |           通常需要 | semantic analyzer / indexer  |
| 安全重命名                          |   通常不够 |           强烈需要 | refactoring engine / LSP     |
| 跨语言符号跳转                      |   AST 不够 | 需要索引与协议桥接 | code intelligence platform   |

### 2.2 为什么“定义/引用/重命名”不是 AST 问题

因为它们依赖：

- 名称绑定（binding）
- 作用域（scope）
- 类型推导/解析（types）
- 模块系统（import/export、package、workspace）
- 预处理/宏/生成代码
- 构建配置（tsconfig、go.mod、Cargo.toml、pom.xml、compile_commands.json 等）

所以，**ts-morph 的“等价物”在很多语言里不是 AST 库，而是编译器 API、静态分析框架、或语言服务器本身**。

这是选型时最重要的心智模型。

---

## 3. 工具分类框架：不要只按“语言”看，要按“能力来源”看

我建议你把候选工具分成四类。

## 3.1 A 类：Parser / AST / CST 库

适合：

- 结构提取
- 语法模式搜索
- codemod
- 局部分析
- 在没有完整工程配置时做 best-effort 分析

优点：

- 启动快，依赖少
- 可控性高
- 容易脚本化
- 适合作为 AI 辅助工具的“第一跳”分析

缺点：

- 无法可靠解决语义问题
- 跨文件解析经常需要你自己补齐工程上下文
- 重命名/引用查找容易误报漏报

## 3.2 B 类：Compiler API / Semantic Analyzer

适合：

- 定义/引用/类型查询
- 安全重构
- 高可信 code intelligence
- 依赖图、调用图、诊断

优点：

- 精度高
- 与语言真实语义一致
- 通常最接近 IDE 能力来源

缺点：

- 学习曲线高
- 语言专有性强
- 初始化成本高，需要工程配置
- 接口稳定性有时不如成熟 CLI

## 3.3 C 类：Language Server / LSP CLI / Editor Backend

适合：

- 想统一接口
- 想复用现成 IDE 生态能力
- 想以协议方式组织多语言支持

优点：

- 跨语言抽象统一
- 能力覆盖定义、引用、hover、rename、diagnostics 等
- 与编辑器生态兼容

缺点：

- 各 server 质量差异巨大
- CLI 形态不统一，很多只提供 stdio JSON-RPC，不是现成“命令式 CLI”
- 环境准备复杂（工作区根、依赖安装、编译数据库）
- 某些 server 的稳定性、性能、缓存策略不适合短命进程

## 3.4 D 类：Code Search / Structural Search / Indexer 平台

例如：sourcegraph 风格索引器、semgrep、ast-grep、tree-sitter 生态、LSIF/scip 索引。

适合：

- 大规模仓库检索
- 批量模式匹配
- 离线索引
- 跨仓/跨服务跳转

优点：

- 对大仓库友好
- 很适合 agent 的“全局理解”前置步骤

缺点：

- 不一定能替代在线语义查询
- 更新滞后时会与工作区真实状态不一致

---

## 4. 一个现实可行的总体架构

如果我是你这个项目的顾问，我会建议采用：

## 4.1 “分层退化”架构，而不是单一工具信仰

### 第 1 层：轻量结构分析

用途：

- 读取文件骨架
- 提取顶级符号
- 判断语言/框架/构建系统
- 快速筛选候选位置

候选：tree-sitter、各语言 parser、ast-grep、语法级 query

### 第 2 层：语言原生语义查询

用途：

- go to definition
- find references
- type info
- rename preview
- diagnostics

候选：

- TypeScript: TypeScript compiler API / tsserver / ts-morph
- Python: Jedi、Pyright/Pylance backend、basedpyright、ruff 的部分语义能力
- Go: gopls / go/packages / guru（较老）
- Rust: rust-analyzer、cargo metadata + rustc 内部生态
- Java/Kotlin: JDT LS、IntelliJ backend、javac APIs、Spoon（偏 Java 分析/变换）
- C/C++: clangd / libclang / clang tooling
- C#: Roslyn
- PHP: PHPStan / Psalm / phpactor / Intelephense 类工具
- Ruby: Solargraph、Sorbet、Prism + 静态分析生态

### 第 3 层：统一协议适配层

你自己的系统只暴露统一动作：

- `document_symbols`
- `definitions`
- `references`
- `rename_preview`
- `diagnostics`
- `workspace_search`

但**底层不要强行统一实现**，而是按语言路由到最可靠的后端。

### 第 4 层：结果可信度标注

对 agent 非常关键。

每个结果都应带：

- 来源：AST / compiler / LSP / index
- 作用域：单文件 / 工作区 / 依赖闭包
- 置信度：high / medium / low
- 是否依赖完整构建成功
- 是否可能受生成代码/宏/动态加载影响

这会显著降低模型“拿不准还硬改”的风险。

---

## 5. 各主流语言的工具版图

下面不是穷举，而是按“工程上最有代表性、最值得优先评估”的工具给出地图。

## 5.1 TypeScript / JavaScript

这是最成熟、最接近你已知世界的一类。

### AST / 语法层

- **TypeScript Compiler API**：官方 AST + program/type checker 能力基础
- **ts-morph**：对 TS compiler API 的高层封装，适合脚本化分析与改写
- **Babel parser / traverse**：适合 JS/TS 语法级转换，但语义弱
- **recast / jscodeshift**：codemod 强
- **tree-sitter-javascript/typescript**：结构检索快
- **ast-grep**：适合基于 AST 的模式查找/替换

### 语义层

- **TypeScript Program / LanguageService**
- **tsserver**：VS Code/IDE 的事实标准后端

### CLI / 服务层

- `tsserver` 本身是 JSON 协议服务，不是传统易用 CLI
- `typescript-language-server`：把 tsserver 包装成 LSP
- 自建 Node 脚本直接调用 compiler API / ts-morph 往往最稳

### 建议

- **如果是 TS/JS，优先使用官方 compiler API 或 tsserver 生态，不要只靠 Babel AST 做定义/引用。**
- ts-morph 很适合作为脚本化入口，但在超大仓和复杂 workspace 下仍要关注性能与 program 生命周期管理。

### 常见陷阱

- 用 Babel AST 误以为能做可靠引用查找
- 忽略 `tsconfig`/project references
- 单文件 program 导致解析结果与真实工程不一致

---

## 5.2 Python

Python 的难点在于动态性，所以“等价于 ts-morph”的东西没有那么直接。

### AST / 语法层

- **内置 `ast`**：标准库，适合结构分析
- **LibCST**：保留格式和注释，适合安全改写
- **parso**：Jedi 使用的 parser
- **RedBaron / Baron**：CST 风格，适合变换
- **tree-sitter-python**
- **ast-grep**

### 语义层

- **Jedi**：历史悠久，做补全、定义跳转、引用等，脚本化相对友好
- **Pyright / basedpyright**：类型与语义分析很强，更接近现代大型工程需求
- **Pyre**：Meta 生态，偏类型/静态分析
- **rope**：重构工具，rename 等场景可关注
- **ruff**：主要是 lint/规则引擎，不是完整语言语义替代品，但在静态分析基础设施上越来越强

### CLI / 服务层

- **pyright CLI**：诊断很好，但不是完整“交互式代码智能 CLI”
- **python-lsp-server**：插件化 LSP，能力取决于插件
- **Jedi language server**（历史上有，但生态不如 Pyright 稳）
- 某些团队会自己写 Python 包装层调用 Jedi 或 Pyright internals

### 建议

- **结构改写选 LibCST，语义查询优先评估 Jedi 与 Pyright 系工具，不要企图用内置 ast 解决 rename/reference。**
- 对 Python，必须接受“静态分析精度有上限”；动态导入、猴子补丁、运行时属性注入会打破静态假设。

### 常见陷阱

- 把 LibCST 当语义工具
- 把 lint 结果当定义/引用引擎
- 忽略虚拟环境、stub、pyproject/poetry/monorepo 配置

---

## 5.3 Go

Go 是非常适合程序化分析的语言之一，因为官方工具链强，工程模型相对统一。

### AST / 语法层

- **`go/parser` + `go/ast`**：标准做法
- **`go/token`**：位置信息基础
- **`golang.org/x/tools/go/ast/astutil`**：辅助工具

### 语义层

- **`go/types`**：类型检查
- **`go/packages`**：按模块/构建标签加载包，现代入口
- **`golang.org/x/tools/go/ssa`**：SSA 分析、调用图等
- **guru**：老牌查询工具，概念上值得了解，但 today-first choice 通常是 gopls / x/tools

### CLI / 服务层

- **gopls**：Go 代码智能核心后端，定义/引用/重命名/诊断都很成熟
- `go list`, `go env`, `go/packages` 配合脚本很强

### 建议

- **Go 优先使用 `go/packages` + `go/types` 或直接走 gopls；不要只停留在 `go/ast`。**
- 如果要做深分析（调用图、数据流），Go 生态的 SSA 能力非常值得用。

### 常见陷阱

- 只 parse 文件，不按 package/module 加载
- 忽略 build tags、generated files、vendor/module mode
- 在 workspace 模式下没有还原真实 `go env`

---

## 5.4 Rust

Rust 的语义极强，宏系统复杂，因此“纯 AST 方案”风险很高。

### AST / 语法层

- **syn**：过程宏/源码分析常用 AST 库，适合 Rust 代码处理
- **rowan** / **rust-analyzer parser** 相关生态：绿树/增量语法树体系
- **tree-sitter-rust**

### 语义层

- **rust-analyzer**：事实标准代码智能后端
- rustc 内部 API 很强，但不适合作为稳定外部产品接口
- cargo metadata 提供项目结构信息，但不是语义引擎

### CLI / 服务层

- **rust-analyzer** 可作为 LSP server 使用
- `cargo check`/`cargo metadata` 是工程上下文的重要辅助

### 建议

- **对于 Rust，定义/引用/重命名优先 rust-analyzer；syn 更适合源码变换与宏相关开发，不适合作为完整语义替代。**
- 必须重视宏展开、feature flags、workspace、build script 对分析结果的影响。

### 常见陷阱

- 误把 syn 当“Rust ts-morph”
- 忽略宏展开后的语义世界
- 没有模拟正确 feature 集，导致结果偏差

---

## 5.5 Java

Java 的程序分析工具很多，但分层非常明显。

### AST / 语法层

- **JavaParser**：易用，适合 AST 操作
- **Spoon**：强大的 Java 程序分析/变换框架，比单纯 parser 更工程化
- **Eclipse JDT Core AST**
- **tree-sitter-java**

### 语义层

- **javac compiler APIs**：官方编译器能力
- **Eclipse JDT**：成熟的语义模型与 IDE 级功能
- **OpenRewrite**：偏大规模重构与 recipes，工程价值很高

### CLI / 服务层

- **Eclipse JDT Language Server (jdtls)**：Java LSP 主流选项
- Maven/Gradle tooling 提供工程模型支持

### 建议

- **JavaParser 很好用，但若要做可靠定义/引用/重构，优先评估 JDT/javac/OpenRewrite 这类语义或半语义框架。**
- 如果目标是大规模企业代码改写，OpenRewrite 的价值经常高于“自己搭 AST 工具”。

### 常见陷阱

- 用 JavaParser 承担全部语义责任
- 忽略 annotation processing、generated sources、classpath/modulepath
- 在 Maven/Gradle 多模块工程里只分析局部源码

---

## 5.6 Kotlin

Kotlin 的外部程序分析生态相对没那么统一，很多高质量能力依赖 JetBrains 体系。

### AST / 语法层

- Kotlin PSI（JetBrains 平台内部模型）
- tree-sitter-kotlin
- 部分社区 parser，但成熟度有限

### 语义层

- **Kotlin compiler / Analysis API**（但外部稳定性、版本适配要仔细评估）
- IntelliJ/JetBrains backend 相关能力

### CLI / 服务层

- **kotlin-language-server** 存在，但成熟度与官方深度不总是理想
- 在 JVM 工程中常与 jdtls/IDE backend 能力边界交织

### 建议

- **Kotlin 要特别小心“看起来有工具，实际上难以产品化”的问题。**
- 若 Kotlin 是重点语言，尽早做 PoC 验证：性能、版本兼容、工程加载、引用准确率。

### 常见陷阱

- 低估 JetBrains 内部 API 依赖带来的维护成本
- 把社区 language server 当成 IDE 级等价物

---

## 5.7 C / C++

C/C++ 不是缺工具，而是工程上下文极难还原。

### AST / 语法层

- **tree-sitter-c / cpp**
- 其他 parser 只能做有限结构分析

### 语义层

- **Clang AST / LibTooling / libclang**：核心能力来源
- **clang-query**：AST matcher 查询很好用
- **clang-tidy**：静态分析与自动修复规则

### CLI / 服务层

- **clangd**：最主流的 LSP 后端
- `compile_commands.json` 是生命线

### 建议

- **C/C++ 优先复用 Clang 生态；不要自己造 parser + name resolution。**
- 如果没有准确的 `compile_commands.json`，很多语义能力都不可信。

### 常见陷阱

- 忽略宏、include path、编译选项
- 在不完整编译数据库上做 rename/ref 查找
- 把 tree-sitter 当成 C++ 语义引擎

---

## 5.8 C# / .NET

这是少数“程序化语义分析极其舒适”的生态之一。

### AST / 语法层

- **Roslyn Syntax API**

### 语义层

- **Roslyn SemanticModel / Workspace APIs**

### CLI / 服务层

- **Roslyn-based tooling**
- **OmniSharp**（历史上重要，但现代 .NET 生态要看具体演进与官方路线）
- `dotnet` build/workspace tooling 提供项目上下文

### 建议

- **C# 几乎可以直接把 Roslyn 当“官方 ts-morph + compiler API + refactoring engine”看待。**
- 若你的目标包括可靠 rename、symbol graph、analyzers，Roslyn 是标杆级体验。

### 常见陷阱

- 只拿语法树，不创建 workspace / compilation
- 忽略 solution/project 层级信息

---

## 5.9 PHP

PHP 的静态语义分析近年主要由类型分析器推动。

### AST / 语法层

- **nikic/PHP-Parser**：事实标准 AST 库
- tree-sitter-php

### 语义层

- **PHPStan**：强大的静态分析器
- **Psalm**：静态分析与类型能力
- **phpactor**：IDE/refactoring 导向

### CLI / 服务层

- **phpactor language server**
- 各分析器 CLI 主要偏诊断，不一定直接暴露完整代码智能交互

### 建议

- **AST 选 nikic/PHP-Parser，语义选 PHPStan/Psalm/phpactor 路线组合评估。**
- PHP 的类型注解、框架魔术方法、动态特性会显著影响精度。

### 常见陷阱

- 用 parser 代替全量语义分析
- 忽略 composer autoload 与框架约定

---

## 5.10 Ruby

Ruby 和 Python 类似，动态性强，静态分析上限有限。

### AST / 语法层

- **Prism**：Ruby 新一代 parser 值得重点关注
- **Ripper**：标准库 parser
- tree-sitter-ruby

### 语义层

- **Sorbet**：如果项目采用类型体系，则语义能力大幅提升
- **Steep**：类型检查生态
- **ruby-lsp / Solargraph**：代码智能相关

### CLI / 服务层

- **ruby-lsp**
- **Solargraph**

### 建议

- **Ruby 的工具选择高度依赖项目是否采用 Sorbet/RBS 等类型体系。**
- 无类型的大型 Ruby 项目，rename/ref 查找的静态可信度通常有限。

### 常见陷阱

- 低估 metaprogramming 对静态分析的破坏
- 把 parser 能力当语义能力

---

## 5.11 Swift

### AST / 语法层

- **SwiftSyntax**：官方/半官方核心生态，源码处理非常重要
- tree-sitter-swift

### 语义层

- SourceKit / Swift compiler 相关能力

### CLI / 服务层

- **sourcekit-lsp**

### 建议

- **Swift 结构变换看 SwiftSyntax，语义查询看 SourceKit/sourcekit-lsp。**
- Apple 工具链版本耦合要重点验证。

---

## 5.12 Scala

### AST / 语法层

- **Scalameta**：语法与语义生态核心之一
- tree-sitter-scala

### 语义层

- **Metals** 后端能力
- SemanticDB / Scalafix 生态

### CLI / 服务层

- **Metals**
- SemanticDB 索引在批量分析中非常有价值

### 建议

- **Scala 是“离线语义索引”价值很高的语言，SemanticDB/Scalameta 值得重点看。**

---

## 5.13 Lua / Elixir / Dart 等

这些语言也各有生态，但成熟度、稳定性、可产品化程度差异更大。原则不变：

- 先找官方/事实标准语义后端
- 没有的话再退回 AST + lint + index 的组合方案
- 对语言服务器成熟度做实际 PoC，不要看 star 数做决策

---

## 6. 如果你坚持通过 exec 调脚本，而不是内置 LSP，应如何设计

这其实是完全可行的，但要避免把自己做成“半个 IDE”。

## 6.1 建议采用“统一命令适配协议”

例如你自己的 agent 只调用：

- `analyze symbols --file ...`
- `analyze definitions --file ... --line ... --character ...`
- `analyze references --symbol-id ...`
- `analyze rename-preview --symbol-id ... --new-name ...`
- `analyze diagnostics --scope workspace`

每个语言适配器内部再决定：

- 调本地脚本
- 调 compiler API
- 调 language server
- 调预建索引

**关键思想：对模型暴露统一动作，对系统内部保留异构实现。**

## 6.2 短命进程 vs 常驻服务

### 短命 `exec` 脚本

优点：

- 实现简单
- 故障隔离好
- 容易审计和沙箱化

缺点：

- 启动慢
- 无缓存
- 大工程上重复初始化成本高

适用：

- 小中型仓库
- 低频分析
- 首版产品

### 常驻守护进程 / LSP server / 自建 RPC 服务

优点：

- 可缓存工程状态
- 增量更新好
- 交互延迟低

缺点：

- 生命周期管理复杂
- 崩溃恢复、版本同步、资源隔离更麻烦

适用：

- 大仓库
- 高频智能查询
- 追求 IDE 级体验

### 实用建议

- **MVP 可以先 `exec`，但接口设计要为将来迁移到常驻服务留好空间。**
- 不要把“传输方式（exec vs RPC）”与“能力来源（AST vs 语义引擎）”绑死。

---

## 7. 选型最佳实践

下面是我认为最重要的实践清单。

## 7.1 最佳实践一：按任务分层，不按语言一刀切

**做法**：

- AST 负责结构理解和低成本扫描
- 语义引擎负责定义/引用/类型/重构
- 索引负责大规模检索和跨会话缓存

**为什么有效**：

因为不同任务的本质不同。把所有任务压给一种工具，最终要么精度差，要么成本高。

**适用边界**：

- 几乎对所有多语言系统成立
- 只有在非常单一语言、非常小仓库场景下，才可能简化为单引擎

## 7.2 最佳实践二：优先复用“官方或事实标准”语义后端

**做法**：

- TS 用 TS compiler/tsserver
- Go 用 gopls/go types
- C# 用 Roslyn
- C/C++ 用 Clang/clangd
- Rust 用 rust-analyzer

**为什么有效**：

这些工具最接近语言真实语义和 IDE 体验来源，边缘案例覆盖最好。

**适用边界**：

- 某些语言官方 API 不稳定或不易嵌入时，需要在 CLI/LSP 层集成

## 7.3 最佳实践三：把“工程加载”当成一等公民

**做法**：

- 明确 workspace root
- 恢复虚拟环境/SDK/toolchain
- 读取构建配置与依赖图
- 把加载失败当成显式状态返回

**为什么有效**：

大多数“语义工具不准”的根因不是算法差，而是工程上下文错了。

**适用边界**：

- 所有有构建系统/模块系统的语言

## 7.4 最佳实践四：结果必须附带 provenance 和 confidence

**做法**：

在每个分析结果中携带：

- 来源工具
- 版本
- 工作区是否完整加载
- 置信度
- 限制说明

**为什么有效**：

AI agent 会过度相信工具输出。你必须让系统级地表达“不确定”。

## 7.5 最佳实践五：先做“只读智能”，再做“自动改写”

**做法**：

- 第一阶段只做查询：符号、定义、引用、诊断
- 第二阶段做 rename preview
- 第三阶段才做自动应用修改

**为什么有效**：

改写风险远大于查询风险。先验证分析精度，再开放写操作，更稳健。

## 7.6 最佳实践六：为每种语言建立“黄金测试仓库”

**做法**：

针对每种语言准备包含以下特性的测试集：

- 多模块/多包
- 别名导入
- 继承/trait/interface
- 泛型/类型别名
- 生成代码
- 条件编译/feature flags
- 宏/装饰器/反射/动态加载

**为什么有效**：

没有回归样例，代码智能系统很容易在升级工具后静默退化。

---

## 8. 常见反模式与为什么它们危险

## 8.1 反模式：试图用统一 AST 框架解决所有语言的定义/引用问题

**看起来为什么合理**：

- 接口统一
- 部署简单
- 不依赖各语言复杂生态

**实际上为什么错**：

- 语义能力缺失
- 你最终会重造 binding/type/module resolution
- 复杂语言特性会逐步把你拖进编译器工程

**结论**：

AST 统一层可以有，但不能承担全部代码智能责任。

## 8.2 反模式：把 LSP 当成“天然可靠的统一标准”

**看起来为什么合理**：

- 协议统一
- 编辑器都在用

**实际上为什么错**：

- LSP 只统一协议，不统一语义质量
- 不同 server 的实现深度和稳定性差异巨大
- 很多 server 并不适合短命 CLI 场景

**结论**：

LSP 是接口标准，不是能力质量担保。

## 8.3 反模式：只做单文件分析

**为什么危险**：

定义、引用、类型几乎总会跨文件、跨模块，单文件视角会系统性误判。

## 8.4 反模式：把 lint 工具误当代码智能引擎

**为什么危险**：

lint 关注规则和诊断，不等于完整符号解析与重构能力。

## 8.5 反模式：忽略构建环境重建

**为什么危险**：

没有正确依赖和编译选项，很多语言的“语义分析”其实是在错误宇宙里运行。

## 8.6 反模式：把 rename 作为早期功能

**为什么危险**：

rename 是最容易产生大面积误伤的能力之一；如果定义/引用链条还不稳定，rename 只会放大错误。

---

## 9. 你真正应该怎么比较工具

不要只比较“有没有 AST 库”。要建立统一评估维度。

## 9.1 精度维度

- 定义跳转准确率
- 引用召回率/精确率
- rename 误伤率
- 类型信息完整度
- 对生成代码/宏/动态特性的鲁棒性

## 9.2 工程适配维度

- monorepo 支持
- 多模块/多包支持
- 构建配置恢复能力
- 增量更新能力
- 依赖安装/环境配置复杂度

## 9.3 集成维度

- 是否有稳定 CLI
- 是否有可嵌入库 API
- 是否支持 JSON 输出
- 错误处理是否机器友好
- 是否能在沙箱中运行

## 9.4 运维维度

- 冷启动延迟
- 内存占用
- 索引时间
- 大仓稳定性
- 版本升级兼容性

## 9.5 产品维度

- 对 agent 是否可解释
- 能否给出部分结果和限制说明
- 失败时是否能优雅降级到 AST/grep/index

---

## 10. 对你这个 AI 编码助手的具体策略建议

我会这样定优先级。

## 10.1 第一梯队：优先支持那些“原生语义后端成熟”的语言

最适合率先做高质量体验的通常是：

- TypeScript / JavaScript
- Go
- C#
- Rust
- C/C++（前提是 compile_commands 可靠）
- Java

原因：

- 有成熟语义引擎
- IDE 生态验证充分
- 定义/引用/rename 的可信度相对高

## 10.2 第二梯队：动态语言采用“分级承诺”

如 Python / Ruby / PHP：

- 对用户明确说明哪些结论是“best effort”
- 先做 definitions/references 查询，再决定是否开放 rename
- 鼓励接入类型系统或项目配置以提升精度

## 10.3 第三梯队：跨语言统一层只统一动作，不统一实现细节

这点我再强调一次，因为这是很多平台成败分水岭。

统一：

- 请求/响应 schema
- 错误模型
- 置信度模型
- 结果呈现方式

不要统一：

- 所有语言都必须走 AST
- 所有语言都必须走 LSP
- 所有语言都必须支持相同能力等级

---

## 11. 一个实用的“工具组合心智模型”

你可以把每种语言的支持实现成下面四件套中的若干组合：

1. **Parser**：拿结构
2. **Resolver**：拿语义绑定
3. **Indexer**：拿工作区/离线检索
4. **Rewriter**：安全生成修改

以 TS 为例：

- Parser: TypeScript AST
- Resolver: TypeChecker / tsserver
- Indexer: tsserver project / 你自己的缓存
- Rewriter: ts-morph / TS refactor API / codemod

以 Python 为例：

- Parser: LibCST / ast
- Resolver: Jedi / Pyright
- Indexer: 自建缓存或 LSP 状态
- Rewriter: LibCST / rope

以 Go 为例：

- Parser: go/ast
- Resolver: go/types / go/packages
- Indexer: gopls state
- Rewriter: go/ast + format + analysis tools

这个模型的好处是：**你不再寻找“单个等价物”，而是在寻找“每种语言最合适的能力拼装”。**

---

## 12. 最终建议：给你的决策结论

如果把问题收敛成一句话，我的建议是：

> **不要把“exec 调脚本”理解成“放弃语言服务器/语义引擎”；应该把它理解成“你自己控制代码智能接入层”，底层尽量复用各语言最成熟的语义能力，AST 只做补充。**

更具体地说：

### 推荐路线

1. **建立统一的 analysis adapter 协议**
2. **优先接入各语言的事实标准语义后端**
3. **把 AST 层作为快速扫描、结构理解、降级策略**
4. **把 rename 放到后期，并先提供 preview**
5. **为每种语言显式标注能力等级与限制**
6. **用黄金仓库持续评估定义/引用/rename 准确率**

### 不推荐路线

1. 试图寻找每种语言的“ts-morph 一对一替身”
2. 用 parser 库硬做 symbol resolution
3. 指望单次短命 CLI 在所有语言上都达到 IDE 级体验
4. 不恢复真实工程环境就宣称支持语义查询

---

## 13. 一个可执行的检查清单

在你为某门语言接入分析能力前，用下面清单自检。

### A. 能力定位

- [ ] 目标任务是结构分析，还是语义查询，还是自动重构？
- [ ] 是否区分“best effort”与“high confidence”结果？
- [ ] 是否明确这门语言的动态性/宏/生成代码限制？

### B. 工具选择

- [ ] 是否优先评估了官方或事实标准语义后端？
- [ ] AST 工具是否只承担它擅长的任务？
- [ ] 是否存在稳定 CLI 或可嵌入 API？
- [ ] 是否支持机器可读输出？

### C. 工程加载

- [ ] 能否正确识别 workspace root？
- [ ] 能否恢复依赖、SDK、虚拟环境、toolchain？
- [ ] 能否读取构建配置（如 tsconfig、go.mod、Cargo、Maven、compile_commands）？
- [ ] 对加载失败是否有显式错误，而不是静默降级？

### D. 质量验证

- [ ] 是否在多模块样例上验证了 definition 准确率？
- [ ] 是否在别名、继承、泛型、条件编译等场景验证了 references？
- [ ] 是否在真实仓库上测量了冷启动/热启动延迟？
- [ ] 是否验证过版本升级后的结果稳定性？

### E. Agent 安全性

- [ ] 结果是否附带来源与置信度？
- [ ] rename 是否先做 preview 而非直接应用？
- [ ] 失败时是否有降级策略（AST/grep/index）？
- [ ] 模型是否能理解“结果不完整”的机器信号？

---

## 14. 结语

你要构建的不是“一个能调用几种 parser 的脚本集合”，而是**一个多语言代码智能编排层**。

在这个问题上，真正稀缺的不是 AST 库清单，而是以下判断力：

- 什么任务必须使用语义引擎
- 什么场景可以接受 AST 近似
- 哪些语言适合做高承诺支持，哪些只能做 best effort
- 如何让 agent 知道什么时候该相信工具，什么时候该保守

如果你按这个思路推进，`exec` 完全可以是一条正确路线；但前提是你把它当成**接入方式**，而不是**能力来源**。
