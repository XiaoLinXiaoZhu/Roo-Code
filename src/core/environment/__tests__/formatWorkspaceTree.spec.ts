import path from "path"
import { formatWorkspaceTree } from "../formatWorkspaceTree"

// Use a consistent cwd for all tests
const cwd = process.platform === "win32" ? "C:\\project" : "/project"

function abs(...parts: string[]): string {
	return path.join(cwd, ...parts)
}

function dir(...parts: string[]): string {
	return abs(...parts) + "/"
}

describe("formatWorkspaceTree", () => {
	describe("directory-first hierarchy", () => {
		it("should render directories before files", () => {
			const files = [abs("README.md"), abs("package.json"), dir("src"), dir("docs")]

			const result = formatWorkspaceTree(files, cwd)

			// Directories should come before files
			const docsIdx = result.indexOf('<dir name="docs/"')
			const srcIdx = result.indexOf('<dir name="src/"')
			const readmeIdx = result.indexOf("README.md")
			const pkgIdx = result.indexOf("package.json")

			expect(docsIdx).toBeGreaterThan(-1)
			expect(srcIdx).toBeGreaterThan(-1)
			expect(readmeIdx).toBeGreaterThan(-1)
			expect(pkgIdx).toBeGreaterThan(-1)

			// Directories before files
			expect(docsIdx).toBeLessThan(readmeIdx)
			expect(srcIdx).toBeLessThan(readmeIdx)
		})

		it("should nest files under their parent directories", () => {
			const files = [dir("src"), abs("src", "index.ts"), abs("src", "utils.ts")]

			const result = formatWorkspaceTree(files, cwd)

			expect(result).toContain('<dir name="src/">')
			expect(result).toContain("index.ts")
			expect(result).toContain("utils.ts")
			// Files should be inside the dir tag (indented more)
			expect(result).toContain("  <file>index.ts</file>")
		})

		it("should handle nested directory structures", () => {
			const files = [
				dir("src"),
				dir("src", "core"),
				dir("src", "core", "tools"),
				abs("src", "core", "tools", "ReadFileTool.ts"),
			]

			const result = formatWorkspaceTree(files, cwd)

			expect(result).toContain('<dir name="src/">')
			expect(result).toContain('<dir name="core/">')
			expect(result).toContain('<dir name="tools/">')
			expect(result).toContain("ReadFileTool.ts")
		})
	})

	describe("similar file folding", () => {
		it("should fold files with similar names when count >= threshold", () => {
			const files = [
				dir("releases"),
				abs("releases", "3.26.0-release.png"),
				abs("releases", "3.27.0-release.png"),
				abs("releases", "3.28.0-release.png"),
				abs("releases", "3.29.0-release.png"),
				abs("releases", "3.30.0-release.png"),
				abs("releases", "3.31.0-release.png"),
			]

			const result = formatWorkspaceTree(files, cwd, { foldThreshold: 5 })

			// Should show a folded pattern instead of individual files
			expect(result).toContain("pattern=")
			expect(result).toContain('count="6"')
			// Should NOT show individual file names
			expect(result).not.toContain("3.26.0-release.png</file>")
		})

		it("should NOT fold files when count < threshold", () => {
			const files = [dir("docs"), abs("docs", "a.md"), abs("docs", "b.md"), abs("docs", "c.md")]

			const result = formatWorkspaceTree(files, cwd, { foldThreshold: 5 })

			// Should show individual files
			expect(result).toContain("a.md")
			expect(result).toContain("b.md")
			expect(result).toContain("c.md")
			expect(result).not.toContain("pattern=")
		})

		it("should fold package.nls.*.json files", () => {
			const files = [
				abs("package.nls.json"),
				abs("package.nls.ja.json"),
				abs("package.nls.ko.json"),
				abs("package.nls.zh-CN.json"),
				abs("package.nls.fr.json"),
				abs("package.nls.de.json"),
			]

			const result = formatWorkspaceTree(files, cwd, { foldThreshold: 5 })

			expect(result).toContain("pattern=")
			expect(result).toContain('count="6"')
		})

		it("should not fold files with different extensions", () => {
			const files = [
				dir("src"),
				abs("src", "index.ts"),
				abs("src", "index.css"),
				abs("src", "index.html"),
				abs("src", "index.test.ts"),
				abs("src", "index.spec.ts"),
				abs("src", "index.d.ts"),
			]

			const result = formatWorkspaceTree(files, cwd, { foldThreshold: 5 })

			// Different extensions should not be grouped together
			expect(result).toContain("index.ts")
			expect(result).toContain("index.css")
			expect(result).toContain("index.html")
		})
	})

	describe("ignored and protected attributes", () => {
		it("should mark ignored files", () => {
			const files = [abs(".env"), abs("package.json")]

			const result = formatWorkspaceTree(files, cwd, {
				checkIgnored: (relativePath) => relativePath === ".env",
			})

			expect(result).toContain('ignored="true">.env</file>')
			expect(result).not.toContain('ignored="true">package.json')
		})

		it("should mark protected files", () => {
			const files = [abs("AGENTS.md"), abs("README.md")]

			const result = formatWorkspaceTree(files, cwd, {
				checkProtected: (absolutePath) => absolutePath.endsWith("AGENTS.md"),
			})

			expect(result).toContain('protected="true">AGENTS.md</file>')
			expect(result).not.toContain('protected="true">README.md')
		})

		it("should mark ignored directories", () => {
			const files = [dir(".secret"), dir("src")]

			const result = formatWorkspaceTree(files, cwd, {
				checkIgnored: (relativePath) => relativePath === ".secret",
			})

			expect(result).toContain('ignored="true"/>')
			expect(result).toContain(".secret/")
		})
	})

	describe("empty directories", () => {
		it("should render empty directories as self-closing tags", () => {
			const files = [dir("empty-dir")]

			const result = formatWorkspaceTree(files, cwd)

			expect(result).toContain('<dir name="empty-dir/"/>')
		})
	})

	describe("root-level files", () => {
		it("should render root-level files directly", () => {
			const files = [abs("package.json"), abs("tsconfig.json"), abs("README.md")]

			const result = formatWorkspaceTree(files, cwd)

			expect(result).toContain("<file>README.md</file>")
			expect(result).toContain("<file>package.json</file>")
			expect(result).toContain("<file>tsconfig.json</file>")
		})
	})
})
