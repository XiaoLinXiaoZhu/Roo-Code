/**
 * LsHandler 单元测试
 */

import * as path from "path"
import * as fs from "fs/promises"
import * as os from "os"

import { LsHandler } from "../../handlers/LsHandler"
import { CommandContext } from "../../types"

describe("LsHandler", () => {
	let handler: LsHandler
	let tempDir: string
	let context: CommandContext

	beforeEach(async () => {
		handler = new LsHandler()
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ls-test-"))
		context = { cwd: tempDir }
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	describe("canHandle", () => {
		it("should handle basic ls command", () => {
			expect(handler.canHandle([])).toBe(true)
		})

		it("should handle -l option", () => {
			expect(handler.canHandle(["-l"])).toBe(true)
		})

		it("should handle -a option", () => {
			expect(handler.canHandle(["-a"])).toBe(true)
		})

		it("should handle -R option", () => {
			expect(handler.canHandle(["-R"])).toBe(true)
		})

		it("should handle combined options", () => {
			expect(handler.canHandle(["-laR"])).toBe(true)
		})

		it("should not handle --color option", () => {
			expect(handler.canHandle(["--color"])).toBe(false)
		})

		it("should not handle -S option", () => {
			expect(handler.canHandle(["-S"])).toBe(false)
		})

		it("should not handle -t option", () => {
			expect(handler.canHandle(["-t"])).toBe(false)
		})
	})

	describe("execute", () => {
		it("should list directory contents", async () => {
			await fs.writeFile(path.join(tempDir, "file1.txt"), "content")
			await fs.writeFile(path.join(tempDir, "file2.txt"), "content")

			const result = await handler.execute([], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("file1.txt")
			expect(result.stdout).toContain("file2.txt")
		})

		it("should list specific directory", async () => {
			const subDir = path.join(tempDir, "subdir")
			await fs.mkdir(subDir)
			await fs.writeFile(path.join(subDir, "nested.txt"), "content")

			const result = await handler.execute(["subdir"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("nested.txt")
		})

		it("should show long format with -l", async () => {
			await fs.writeFile(path.join(tempDir, "test.txt"), "hello world")

			const result = await handler.execute(["-l"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("test.txt")
			// 长格式应该包含大小信息
			expect(result.stdout).toMatch(/\d+/)
		})

		it("should show hidden files with -a", async () => {
			await fs.writeFile(path.join(tempDir, ".hidden"), "secret")
			await fs.writeFile(path.join(tempDir, "visible.txt"), "public")

			const result = await handler.execute(["-a"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain(".hidden")
			expect(result.stdout).toContain("visible.txt")
		})

		it("should hide hidden files by default", async () => {
			await fs.writeFile(path.join(tempDir, ".hidden"), "secret")
			await fs.writeFile(path.join(tempDir, "visible.txt"), "public")

			const result = await handler.execute([], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).not.toContain(".hidden")
			expect(result.stdout).toContain("visible.txt")
		})

		it("should show almost all with -A (exclude . and ..)", async () => {
			await fs.writeFile(path.join(tempDir, ".hidden"), "secret")

			const result = await handler.execute(["-A"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain(".hidden")
		})

		it("should list recursively with -R", async () => {
			const subDir = path.join(tempDir, "subdir")
			await fs.mkdir(subDir)
			await fs.writeFile(path.join(tempDir, "root.txt"), "root")
			await fs.writeFile(path.join(subDir, "nested.txt"), "nested")

			const result = await handler.execute(["-R"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("root.txt")
			expect(result.stdout).toContain("nested.txt")
			expect(result.stdout).toContain("subdir")
		})

		it("should handle non-existent directory", async () => {
			const result = await handler.execute(["nonexistent"], context)

			expect(result.exitCode).toBe(1)
			expect(result.stderr).toContain("nonexistent")
		})

		it("should list multiple directories", async () => {
			const dir1 = path.join(tempDir, "dir1")
			const dir2 = path.join(tempDir, "dir2")
			await fs.mkdir(dir1)
			await fs.mkdir(dir2)
			await fs.writeFile(path.join(dir1, "file1.txt"), "content")
			await fs.writeFile(path.join(dir2, "file2.txt"), "content")

			const result = await handler.execute(["dir1", "dir2"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("dir1:")
			expect(result.stdout).toContain("dir2:")
			expect(result.stdout).toContain("file1.txt")
			expect(result.stdout).toContain("file2.txt")
		})

		it("should handle empty directory", async () => {
			const emptyDir = path.join(tempDir, "empty")
			await fs.mkdir(emptyDir)

			const result = await handler.execute(["empty"], context)

			expect(result.exitCode).toBe(0)
		})

		it("should list single file", async () => {
			await fs.writeFile(path.join(tempDir, "single.txt"), "content")

			const result = await handler.execute(["single.txt"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("single.txt")
		})
	})
})
