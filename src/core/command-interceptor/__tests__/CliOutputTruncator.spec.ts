/**
 * CLI 输出截断处理器测试
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

import { truncateCliOutput, cleanupOldOutputs } from "../CliOutputTruncator"

describe("CliOutputTruncator", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-truncator-test-"))
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	describe("truncateCliOutput", () => {
		it("should not truncate small output", async () => {
			const output = "Hello, World!"
			const result = await truncateCliOutput(output, tempDir, "echo hello")

			expect(result.truncated).toBe(false)
			expect(result.output).toBe(output)
			expect(result.fullOutputPath).toBeUndefined()
			expect(result.truncationMessage).toBeUndefined()
		})

		it("should truncate large output and keep tail", async () => {
			// 创建 60KB 的输出
			const largeOutput = "x".repeat(60 * 1024)
			const result = await truncateCliOutput(largeOutput, tempDir, "cat large-file")

			expect(result.truncated).toBe(true)
			// 应该保留最后 40KB
			expect(result.output.length).toBe(40 * 1024)
			expect(result.output).toBe(largeOutput.slice(-40 * 1024))
		})

		it("should save full output to file when truncated", async () => {
			const largeOutput = "x".repeat(60 * 1024)
			const result = await truncateCliOutput(largeOutput, tempDir, "cat large-file")

			expect(result.fullOutputPath).toBeDefined()
			expect(result.fullOutputPath).toContain(".roo/cli-output")

			// 验证文件内容
			const savedContent = await fs.readFile(result.fullOutputPath!, "utf-8")
			expect(savedContent).toContain(largeOutput)
			expect(savedContent).toContain("# Command: cat large-file")
		})

		it("should include truncation message with helpful hints", async () => {
			const largeOutput = "x".repeat(60 * 1024)
			const result = await truncateCliOutput(largeOutput, tempDir, "cat large-file")

			expect(result.truncationMessage).toBeDefined()
			expect(result.truncationMessage).toContain("[Output truncated")
			expect(result.truncationMessage).toContain("grep -n")
			expect(result.truncationMessage).toContain("sed -n")
		})

		it("should sanitize command for filename", async () => {
			const largeOutput = "x".repeat(60 * 1024)
			const result = await truncateCliOutput(largeOutput, tempDir, 'grep "pattern" file.txt | head -10')

			expect(result.fullOutputPath).toBeDefined()
			// 文件名不应包含特殊字符
			const fileName = path.basename(result.fullOutputPath!)
			expect(fileName).not.toContain('"')
			expect(fileName).not.toContain("|")
			expect(fileName).not.toContain(" ")
			// 格式：时间戳_命令摘要.txt
			expect(fileName).toMatch(/^\d{4}-\d{2}-\d{2}T[\d-]+Z?_[\w_]+\.txt$/)
		})

		it("should respect custom max size", async () => {
			const output = "x".repeat(10 * 1024) // 10KB
			const result = await truncateCliOutput(output, tempDir, "echo", 5 * 1024) // 5KB limit

			expect(result.truncated).toBe(true)
		})
	})

	describe("cleanupOldOutputs", () => {
		it("should keep only recent files", async () => {
			const outputDir = path.join(tempDir, ".roo/cli-output")
			await fs.mkdir(outputDir, { recursive: true })

			// 创建 25 个文件
			for (let i = 0; i < 25; i++) {
				const fileName = `2026-01-${String(i + 1).padStart(2, "0")}_test.txt`
				await fs.writeFile(path.join(outputDir, fileName), "content")
			}

			// 清理，保留 20 个
			await cleanupOldOutputs(tempDir, 20)

			const files = await fs.readdir(outputDir)
			expect(files.length).toBe(20)

			// 应该保留最新的（按文件名排序）
			expect(files).toContain("2026-01-25_test.txt")
			expect(files).not.toContain("2026-01-01_test.txt")
		})

		it("should not fail if directory does not exist", async () => {
			// 不应该抛出错误
			await expect(cleanupOldOutputs(tempDir)).resolves.toBeUndefined()
		})
	})
})
