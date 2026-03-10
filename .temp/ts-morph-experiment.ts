/**
 * ts-morph 实验：验证作为代码智能工具的可行性
 *
 * 对比场景：
 * 1. 查找函数/类定义
 * 2. 查找所有引用
 * 3. 高级批量分析（LSP 工具做不到的）
 */

import { Project, SyntaxKind, Node } from "ts-morph"

const TSCONFIG = "src/tsconfig.json"

console.time("Project init")
const project = new Project({ tsConfigFilePath: TSCONFIG })
console.timeEnd("Project init")

const sourceFiles = project.getSourceFiles()
console.log(`\nLoaded ${sourceFiles.length} source files\n`)

// ============================================================
// 实验 1: 查找函数定义 (对比 find_definition)
// ============================================================
console.log("=".repeat(60))
console.log("实验 1: 查找 BaseTool 类的定义")
console.log("=".repeat(60))

console.time("Exp1")

for (const sf of sourceFiles) {
	for (const cls of sf.getClasses()) {
		if (cls.getName() === "BaseTool") {
			const filePath = sf.getFilePath().replace(/.*Roo-Code[\\/]/, "")
			console.log(`  Found: ${cls.getName()} at ${filePath}:${cls.getStartLineNumber()}`)
			// 获取类的方法签名
			for (const method of cls.getMethods()) {
				const params = method
					.getParameters()
					.map((p) => `${p.getName()}: ${p.getType().getText()}`)
					.join(", ")
				const returnType = method.getReturnType().getText()
				console.log(`    method: ${method.getName()}(${params}) => ${returnType}`)
			}
			// 获取泛型参数
			const typeParams = cls.getTypeParameters().map((tp) => tp.getText())
			if (typeParams.length) console.log(`    generics: <${typeParams.join(", ")}>`)
		}
	}
}

console.timeEnd("Exp1")

// ============================================================
// 实验 2: 查找所有引用 (对比 find_usages)
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("实验 2: 查找 AskApproval 类型的所有使用")
console.log("=".repeat(60))

console.time("Exp2")

for (const sf of sourceFiles) {
	for (const typeAlias of sf.getTypeAliases()) {
		if (typeAlias.getName() === "AskApproval") {
			const filePath = sf.getFilePath().replace(/.*Roo-Code[\\/]/, "")
			console.log(`  Definition: ${filePath}:${typeAlias.getStartLineNumber()}`)
			console.log(`  Type: ${typeAlias.getType().getText()}`)

			// 查找所有引用
			const refs = typeAlias.findReferencesAsNodes()
			console.log(`  References: ${refs.length} total`)
			const byFile = new Map<string, number[]>()
			for (const ref of refs) {
				const refFile = ref
					.getSourceFile()
					.getFilePath()
					.replace(/.*Roo-Code[\\/]/, "")
				if (!byFile.has(refFile)) byFile.set(refFile, [])
				byFile.get(refFile)!.push(ref.getStartLineNumber())
			}
			for (const [file, lines] of byFile) {
				console.log(`    ${file}: lines ${lines.join(", ")}`)
			}
			break
		}
	}
}

console.timeEnd("Exp2")

// ============================================================
// 实验 3: 高级批量分析 — LSP 工具做不到的
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("实验 3: 一次性分析所有 Tool 类的继承关系和方法签名")
console.log("=".repeat(60))

console.time("Exp3")

// 一次性找到所有继承 BaseTool 的类，分析它们的结构
const toolClasses: { name: string; file: string; line: number; methods: string[]; toolName: string }[] = []

for (const sf of sourceFiles) {
	for (const cls of sf.getClasses()) {
		const baseClass = cls.getBaseClass()
		if (baseClass && baseClass.getName() === "BaseTool") {
			const filePath = sf.getFilePath().replace(/.*Roo-Code[\\/]/, "")
			const methods = cls.getMethods().map((m) => {
				const params = m
					.getParameters()
					.map((p) => p.getName())
					.join(", ")
				return `${m.getName()}(${params})`
			})

			// 尝试获取 name 属性的值
			let toolName = "unknown"
			const nameProp = cls.getProperty("name")
			if (nameProp) {
				const init = nameProp.getInitializer()
				if (init) toolName = init.getText()
			}

			toolClasses.push({
				name: cls.getName() || "anonymous",
				file: filePath,
				line: cls.getStartLineNumber(),
				methods,
				toolName,
			})
		}
	}
}

console.log(`  Found ${toolClasses.length} Tool implementations:\n`)
for (const tc of toolClasses) {
	console.log(`  ${tc.name} (tool: ${tc.toolName})`)
	console.log(`    file: ${tc.file}:${tc.line}`)
	console.log(`    methods: ${tc.methods.join(", ")}`)
	console.log()
}

console.timeEnd("Exp3")
