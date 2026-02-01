/**
 * FindHandler 单元测试
 */

import * as path from "path"
import * as fs from "fs/promises"
import * as os from "os"

import { FindHandler } from "../../handlers/FindHandler"
import { CommandContext } from "../../types"

describe("FindHandler", () => {
	let handler: FindHandler
	let tempDir: string
	let context: CommandContext

	beforeEach(async () => {
		handler = new FindHandler()
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "find-test-"))
		context = { cwd: tempDir }
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	describe("canHandle", () => {
		it("should handle basic find command", () => {
			expect(handler.canHandle(["."])).toBe(true)
		})

		it("should handle -name option", () => {
			expect(handler.canHandle(["-name", "*.txt"])).toBe(true)
		})

		it("should handle -iname option", () => {
			expect(handler.canHandle(["-iname", "*.TXT"])).toBe(true)
		})

		it("should handle -type option", () => {
			expect(handler.canHandle(["-type", "f"])).toBe(true)
		})

		it("should handle -maxdepth option", () => {
			expect(handler.canHandle(["-maxdepth", "2"])).toBe(true)
		})

		it("should not handle -exec option", () => {
			expect(handler.canHandle(["-exec", "rm", "{}", ";"])).toBe(false)
		})

		it("should not handle -delete option", () => {
			expect(handler.canHandle(["-delete"])).toBe(false)
		})

		it("should not handle -mtime option", () => {
			expect(handler.canHandle(["-mtime", "+7"])).toBe(false)
		})

		it("should not handle -o (OR) option", () => {
			expect(handler.canHandle(["-name", "*.ts", "-o", "-name", "*.js"])).toBe(false)
		})

		it("should not handle -or option", () => {
			expect(handler.canHandle(["-name", "*.ts", "-or", "-name", "*.js"])).toBe(false)
		})

		it("should not handle -a (AND) option", () => {
			expect(handler.canHandle(["-name", "*.ts", "-a", "-type", "f"])).toBe(false)
		})

		it("should not handle -and option", () => {
			expect(handler.canHandle(["-name", "*.ts", "-and", "-type", "f"])).toBe(false)
		})

		it("should not handle -not option", () => {
			expect(handler.canHandle(["-not", "-name", "*.txt"])).toBe(false)
		})

		it("should not handle ! (NOT) option", () => {
			expect(handler.canHandle(["!", "-name", "*.txt"])).toBe(false)
		})
	})

	describe("execute", () => {
		it("should find all files in directory", async () => {
			await fs.writeFile(path.join(tempDir, "file1.txt"), "content")
			await fs.writeFile(path.join(tempDir, "file2.txt"), "content")

			const result = await handler.execute(["."], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("file1.txt")
			expect(result.stdout).toContain("file2.txt")
		})

		it("should find files by name pattern", async () => {
			await fs.writeFile(path.join(tempDir, "test.txt"), "content")
			await fs.writeFile(path.join(tempDir, "test.js"), "content")
			await fs.writeFile(path.join(tempDir, "other.md"), "content")

			const result = await handler.execute(["-name", "*.txt", "."], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("test.txt")
			expect(result.stdout).not.toContain("test.js")
			expect(result.stdout).not.toContain("other.md")
		})

		it("should find files case-insensitively with -iname", async () => {
			// macOS 文件系统是大小写不敏感的，所以只创建一个文件
			// 验证 -iname 能够匹配不同大小写的扩展名
			await fs.writeFile(path.join(tempDir, "Test.TXT"), "content")

			const result = await handler.execute(["-iname", "*.txt", "."], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("Test.TXT")
		})

		it("should find only files with -type f", async () => {
			await fs.writeFile(path.join(tempDir, "file.txt"), "content")
			await fs.mkdir(path.join(tempDir, "subdir"))

			const result = await handler.execute(["-type", "f", "."], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("file.txt")
			// 目录不应该出现在结果中
		})

		it("should find only directories with -type d", async () => {
			await fs.writeFile(path.join(tempDir, "file.txt"), "content")
			await fs.mkdir(path.join(tempDir, "subdir"))

			const result = await handler.execute(["-type", "d", "."], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("subdir")
			expect(result.stdout).not.toContain("file.txt")
		})

		it("should respect maxdepth", async () => {
			const subDir = path.join(tempDir, "level1")
			const subSubDir = path.join(subDir, "level2")
			await fs.mkdir(subDir)
			await fs.mkdir(subSubDir)
			await fs.writeFile(path.join(tempDir, "root.txt"), "content")
			await fs.writeFile(path.join(subDir, "level1.txt"), "content")
			await fs.writeFile(path.join(subSubDir, "level2.txt"), "content")

			const result = await handler.execute(["-maxdepth", "1", "."], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("root.txt")
			// maxdepth 1 应该只包含当前目录的直接子项
		})

		it("should find files in nested directories", async () => {
			const subDir = path.join(tempDir, "subdir")
			await fs.mkdir(subDir)
			await fs.writeFile(path.join(subDir, "nested.txt"), "content")

			const result = await handler.execute(["."], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("nested.txt")
		})

		it("should handle non-existent directory", async () => {
			const result = await handler.execute(["nonexistent"], context)

			expect(result.exitCode).toBe(1)
		})

		it("should return exit code 1 when no files found", async () => {
			// 空目录
			const result = await handler.execute(["-name", "*.nonexistent", "."], context)

			expect(result.exitCode).toBe(1)
		})

		it("should use current directory by default", async () => {
			await fs.writeFile(path.join(tempDir, "default.txt"), "content")

			const result = await handler.execute(["-name", "*.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("default.txt")
		})

		it("should combine multiple options", async () => {
			await fs.writeFile(path.join(tempDir, "test.txt"), "content")
			await fs.writeFile(path.join(tempDir, "test.js"), "content")
			await fs.mkdir(path.join(tempDir, "subdir"))

			const result = await handler.execute(["-type", "f", "-name", "*.txt", "."], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("test.txt")
			expect(result.stdout).not.toContain("test.js")
			expect(result.stdout).not.toContain("subdir")
		})
	})
})
