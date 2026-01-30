/**
 * CommandInterceptor 单元测试
 */

import { CommandInterceptor } from "../CommandInterceptor"

describe("CommandInterceptor", () => {
	let interceptor: CommandInterceptor

	beforeEach(() => {
		interceptor = new CommandInterceptor()
	})

	describe("canIntercept", () => {
		it("should return true for grep command", () => {
			expect(interceptor.canIntercept("grep pattern file.txt")).toBe(true)
		})

		it("should return true for cat command", () => {
			expect(interceptor.canIntercept("cat file.txt")).toBe(true)
		})

		it("should return true for head command", () => {
			expect(interceptor.canIntercept("head -10 file.txt")).toBe(true)
		})

		it("should return true for tail command", () => {
			expect(interceptor.canIntercept("tail -20 file.txt")).toBe(true)
		})

		it("should return true for pipe with supported commands", () => {
			expect(interceptor.canIntercept("grep pattern | head -10")).toBe(true)
		})

		it("should return false for unsupported command", () => {
			expect(interceptor.canIntercept("npm install")).toBe(false)
		})

		it("should return false for command substitution", () => {
			expect(interceptor.canIntercept("echo $(date)")).toBe(false)
		})

		it("should return false for grep with unsupported flags", () => {
			expect(interceptor.canIntercept("grep -P pattern file.txt")).toBe(false)
		})

		it("should return false for tail with -f flag", () => {
			expect(interceptor.canIntercept("tail -f file.txt")).toBe(false)
		})
	})

	describe("getRegisteredCommands", () => {
		it("should return all registered commands", () => {
			const commands = interceptor.getRegisteredCommands()

			expect(commands).toContain("grep")
			expect(commands).toContain("cat")
			expect(commands).toContain("head")
			expect(commands).toContain("tail")
		})

		it("should include aliases", () => {
			const commands = interceptor.getRegisteredCommands()

			expect(commands).toContain("egrep")
			expect(commands).toContain("fgrep")
		})
	})
})
