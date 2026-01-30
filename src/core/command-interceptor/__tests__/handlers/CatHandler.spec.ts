/**
 * CatHandler 单元测试
 */

import * as path from "path"
import * as fs from "fs/promises"
import * as os from "os"

import { CatHandler } from "../../handlers/CatHandler"
import { CommandContext } from "../../types"

describe("CatHandler", () => {
	let handler: CatHandler
	let tempDir: string
	let context: CommandContext

	beforeEach(async () => {
		handler = new CatHandler()
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cat-test-"))
		context = { cwd: tempDir }
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	describe("canHandle", () => {
		it("should handle basic cat command", () => {
			expect(handler.canHandle(["file.txt"])).toBe(true)
		})

		it("should handle -n option", () => {
			expect(handler.canHandle(["-n", "file.txt"])).toBe(true)
		})

		it("should not handle -v option", () => {
			expect(handler.canHandle(["-v", "file.txt"])).toBe(false)
		})

		it("should not handle -A option", () => {
			expect(handler.canHandle(["-A", "file.txt"])).toBe(false)
		})
	})

	describe("execute", () => {
		it("should read file content", async () => {
			const content = "Hello, World!\nThis is a test."
			await fs.writeFile(path.join(tempDir, "test.txt"), content)

			const result = await handler.execute(["test.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("Hello, World!")
			expect(result.stdout).toContain("This is a test.")
		})

		it("should show line numbers with -n flag", async () => {
			const content = "line 1\nline 2\nline 3"
			await fs.writeFile(path.join(tempDir, "test.txt"), content)

			const result = await handler.execute(["-n", "test.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toMatch(/\s*1\s+line 1/)
			expect(result.stdout).toMatch(/\s*2\s+line 2/)
			expect(result.stdout).toMatch(/\s*3\s+line 3/)
		})

		it("should read multiple files", async () => {
			await fs.writeFile(path.join(tempDir, "file1.txt"), "content 1")
			await fs.writeFile(path.join(tempDir, "file2.txt"), "content 2")

			const result = await handler.execute(["file1.txt", "file2.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("content 1")
			expect(result.stdout).toContain("content 2")
			expect(result.stdout).toContain("# file1.txt")
			expect(result.stdout).toContain("# file2.txt")
		})

		it("should process stdin", async () => {
			const stdin = "stdin content"

			const result = await handler.execute([], { ...context, stdin })

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toBe("stdin content")
		})

		it("should handle non-existent file", async () => {
			const result = await handler.execute(["nonexistent.txt"], context)

			expect(result.exitCode).toBe(1)
			expect(result.stderr).toContain("nonexistent.txt")
		})

		it("should truncate long lines", async () => {
			const longLine = "x".repeat(600)
			await fs.writeFile(path.join(tempDir, "test.txt"), longLine)

			const result = await handler.execute(["test.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("[truncated...]")
			expect(result.stdout.length).toBeLessThan(600)
		})
	})
})
