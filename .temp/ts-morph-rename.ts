/**
 * ts-morph 实验 4: 批量重命名
 *
 * 将 BaseTool.resetPartialState() 重命名为 clearPartialState()
 * 自动更新所有引用点。
 */

import { Project } from "ts-morph"

const project = new Project({ tsConfigFilePath: "src/tsconfig.json" })

console.time("Total")

// 找到 BaseTool 类的 resetPartialState 方法
const baseToolFile = project.getSourceFileOrThrow("src/core/tools/BaseTool.ts")
const baseTool = baseToolFile.getClassOrThrow("BaseTool")
const method = baseTool.getMethodOrThrow("resetPartialState")

// 查找所有引用（重命名前）
const refs = method.findReferencesAsNodes()
console.log(`Found ${refs.length} references to resetPartialState:`)
for (const ref of refs) {
	const file = ref
		.getSourceFile()
		.getFilePath()
		.replace(/.*Roo-Code[\\/]/, "")
	console.log(`  ${file}:${ref.getStartLineNumber()}`)
}

// 执行重命名
console.log("\nRenaming resetPartialState -> clearPartialState...")
method.rename("clearPartialState")

// 验证重命名结果
const refsAfter = method.findReferencesAsNodes()
console.log(`\nAfter rename, ${refsAfter.length} references to clearPartialState:`)
for (const ref of refsAfter) {
	const file = ref
		.getSourceFile()
		.getFilePath()
		.replace(/.*Roo-Code[\\/]/, "")
	const line = ref.getStartLineNumber()
	// 显示该行的内容
	const lineText = ref.getSourceFile().getFullText().split("\n")[line - 1]?.trim()
	console.log(`  ${file}:${line}  ${lineText}`)
}

// 保存所有修改的文件
const modifiedFiles = project.getSourceFiles().filter((sf) => !sf.isSaved())
console.log(`\nModified ${modifiedFiles.length} files:`)
for (const sf of modifiedFiles) {
	console.log(`  ${sf.getFilePath().replace(/.*Roo-Code[\\/]/, "")}`)
}

// 实际写入磁盘
project.saveSync()
console.log("\nAll changes saved to disk.")

console.timeEnd("Total")
