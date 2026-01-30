/**
 * HeadHandler 和 TailHandler 单元测试
 */

import * as path from "path"
import * as fs from "fs/promises"
import * as os from "os"

import { HeadHandler } from "../../handlers/HeadHandler"
import { TailHandler } from "../../handlers/TailHandler"
import { CommandContext } from "../../types"

describe("HeadHandler", () => {
	let handler: HeadHandler
	let tempDir: string
	let context: CommandContext

	beforeEach(async () => {
		handler = new HeadHandler()
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "head-test-"))
		context = { cwd: tempDir }
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	describe("canHandle", () => {
		it("should handle basic head command", () => {
			expect(handler.canHandle(["-10", "file.txt"])).toBe(true)
		})

		it("should handle -n option", () => {
			expect(handler.canHandle(["-n", "20", "file.txt"])).toBe(true)
		})
	})

	describe("execute", () => {
		it("should return first 10 lines by default", async () => {
			const content = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n")
			await fs.writeFile(path.join(tempDir, "test.txt"), content)

			const result = await handler.execute(["test.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout.split("\n")).toHaveLength(10)
			expect(result.stdout).toContain("line 1")
			expect(result.stdout).toContain("line 10")
			expect(result.stdout).not.toContain("line 11")
		})

		it("should return specified number of lines", async () => {
			const content = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n")
			await fs.writeFile(path.join(tempDir, "test.txt"), content)

			const result = await handler.execute(["-n", "5", "test.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout.split("\n")).toHaveLength(5)
			expect(result.stdout).toContain("line 5")
			expect(result.stdout).not.toContain("line 6")
		})

		it("should process stdin", async () => {
			const stdin = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n")

			const result = await handler.execute(["-n", "3"], { ...context, stdin })

			expect(result.exitCode).toBe(0)
			expect(result.stdout.split("\n")).toHaveLength(3)
		})

		it("should handle non-existent file", async () => {
			const result = await handler.execute(["nonexistent.txt"], context)

			expect(result.exitCode).toBe(1)
			expect(result.stderr).toContain("nonexistent.txt")
		})
	})
})

describe("TailHandler", () => {
	let handler: TailHandler
	let tempDir: string
	let context: CommandContext

	beforeEach(async () => {
		handler = new TailHandler()
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tail-test-"))
		context = { cwd: tempDir }
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	describe("canHandle", () => {
		it("should handle basic tail command", () => {
			expect(handler.canHandle(["-10", "file.txt"])).toBe(true)
		})

		it("should not handle -f flag", () => {
			expect(handler.canHandle(["-f", "file.txt"])).toBe(false)
		})

		it("should not handle --follow flag", () => {
			expect(handler.canHandle(["--follow", "file.txt"])).toBe(false)
		})
	})

	describe("execute", () => {
		it("should return last 10 lines by default", async () => {
			const content = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n")
			await fs.writeFile(path.join(tempDir, "test.txt"), content)

			const result = await handler.execute(["test.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("line 11")
			expect(result.stdout).toContain("line 20")
			expect(result.stdout).not.toContain("line 10")
		})

		it("should return specified number of lines", async () => {
			const content = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n")
			await fs.writeFile(path.join(tempDir, "test.txt"), content)

			const result = await handler.execute(["-n", "5", "test.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("line 16")
			expect(result.stdout).toContain("line 20")
			expect(result.stdout).not.toContain("line 15")
		})

		it("should process stdin", async () => {
			const stdin = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n")

			const result = await handler.execute(["-n", "3"], { ...context, stdin })

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("line 18")
			expect(result.stdout).toContain("line 20")
		})
	})
})
