/**
 * WcHandler 单元测试
 */

import * as path from "path"
import * as fs from "fs/promises"
import * as os from "os"

import { WcHandler } from "../../handlers/WcHandler"
import { CommandContext } from "../../types"

describe("WcHandler", () => {
	let handler: WcHandler
	let tempDir: string
	let context: CommandContext

	beforeEach(async () => {
		handler = new WcHandler()
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wc-test-"))
		context = { cwd: tempDir }
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	describe("canHandle", () => {
		it("should handle basic wc command", () => {
			expect(handler.canHandle(["file.txt"])).toBe(true)
		})

		it("should handle -l option", () => {
			expect(handler.canHandle(["-l", "file.txt"])).toBe(true)
		})

		it("should handle -w option", () => {
			expect(handler.canHandle(["-w", "file.txt"])).toBe(true)
		})

		it("should handle -c option", () => {
			expect(handler.canHandle(["-c", "file.txt"])).toBe(true)
		})

		it("should handle combined options", () => {
			expect(handler.canHandle(["-lwc", "file.txt"])).toBe(true)
		})
	})

	describe("execute", () => {
		it("should count lines, words, and chars by default", async () => {
			const content = "hello world\nfoo bar baz\n"
			await fs.writeFile(path.join(tempDir, "test.txt"), content)

			const result = await handler.execute(["test.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("2") // 2 lines
			expect(result.stdout).toContain("5") // 5 words
			expect(result.stdout).toContain("test.txt")
		})

		it("should count only lines with -l", async () => {
			const content = "line 1\nline 2\nline 3\n"
			await fs.writeFile(path.join(tempDir, "test.txt"), content)

			const result = await handler.execute(["-l", "test.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("3")
			expect(result.stdout).toContain("test.txt")
		})

		it("should count only words with -w", async () => {
			const content = "one two three four five"
			await fs.writeFile(path.join(tempDir, "test.txt"), content)

			const result = await handler.execute(["-w", "test.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("5")
		})

		it("should count only chars with -c", async () => {
			const content = "hello"
			await fs.writeFile(path.join(tempDir, "test.txt"), content)

			const result = await handler.execute(["-c", "test.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("5")
		})

		it("should handle multiple files", async () => {
			await fs.writeFile(path.join(tempDir, "file1.txt"), "one two\n")
			await fs.writeFile(path.join(tempDir, "file2.txt"), "three four five\n")

			const result = await handler.execute(["-w", "file1.txt", "file2.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("file1.txt")
			expect(result.stdout).toContain("file2.txt")
			expect(result.stdout).toContain("total")
		})

		it("should process stdin", async () => {
			const stdin = "hello world\nfoo bar\n"

			const result = await handler.execute([], { ...context, stdin })

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("2") // 2 lines
			expect(result.stdout).toContain("4") // 4 words
		})

		it("should handle non-existent file", async () => {
			const result = await handler.execute(["nonexistent.txt"], context)

			expect(result.exitCode).toBe(1)
			expect(result.stderr).toContain("nonexistent.txt")
		})

		it("should handle empty file", async () => {
			await fs.writeFile(path.join(tempDir, "empty.txt"), "")

			const result = await handler.execute(["-l", "empty.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("0")
		})

		it("should return error when no input provided", async () => {
			const result = await handler.execute([], context)

			expect(result.exitCode).toBe(1)
			expect(result.stderr).toContain("no input")
		})
	})
})
