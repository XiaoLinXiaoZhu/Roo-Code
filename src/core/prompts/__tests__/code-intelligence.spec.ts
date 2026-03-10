import { getCodeIntelligenceSection } from "../sections/code-intelligence"

describe("getCodeIntelligenceSection", () => {
	it("returns a non-empty string", () => {
		const result = getCodeIntelligenceSection()
		expect(result).toBeTruthy()
		expect(typeof result).toBe("string")
	})

	it("contains the section header", () => {
		const result = getCodeIntelligenceSection()
		expect(result).toContain("CODE INTELLIGENCE")
	})

	it("contains methodology guidance", () => {
		const result = getCodeIntelligenceSection()
		expect(result).toContain("方法论")
		expect(result).toContain("AST")
		expect(result).toContain("grep")
	})

	it("contains language-specific best practices", () => {
		const result = getCodeIntelligenceSection()
		expect(result).toContain("TypeScript")
		expect(result).toContain("ts-morph")
		expect(result).toContain("Python")
		expect(result).toContain("jedi")
		expect(result).toContain("Go")
		expect(result).toContain("tree-sitter")
	})

	it("contains workflow guidance", () => {
		const result = getCodeIntelligenceSection()
		expect(result).toContain("工作流")
		expect(result).toContain("检查依赖")
	})
})
