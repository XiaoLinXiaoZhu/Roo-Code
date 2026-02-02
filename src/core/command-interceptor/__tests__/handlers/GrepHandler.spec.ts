/**
 * GrepHandler 测试
 */

import { GrepHandler } from "../../handlers/GrepHandler"
import type { CommandContext } from "../../types"

describe("GrepHandler", () => {
	let handler: GrepHandler

	beforeEach(() => {
		handler = new GrepHandler()
	})

	describe("canHandle", () => {
		it("should handle basic grep command", () => {
			expect(handler.canHandle(["-n", "pattern", "file.txt"])).toBe(true)
		})

		it("should handle -i option", () => {
			expect(handler.canHandle(["-i", "pattern", "file.txt"])).toBe(true)
		})

		it("should handle -r option", () => {
			expect(handler.canHandle(["-r", "pattern", "dir/"])).toBe(true)
		})

		it("should not handle -P option (Perl regex)", () => {
			expect(handler.canHandle(["-P", "pattern", "file.txt"])).toBe(false)
		})

		it("should not handle -o option (only matching)", () => {
			expect(handler.canHandle(["-o", "pattern", "file.txt"])).toBe(false)
		})
	})

	describe("BRE to Rust regex conversion", () => {
		const createContext = (stdin?: string): CommandContext => ({
			cwd: "/tmp",
			stdin,
			env: {},
		})

		it("should convert BRE OR syntax (\\|) to Rust regex (|)", async () => {
			const context = createContext("test slug name builder")
			const result = await handler.execute(["slug\\|name"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("test slug name builder")
		})

		it("should convert BRE \\+ to Rust regex +", async () => {
			const context = createContext("aaa\nab\na")
			const result = await handler.execute(["a\\+"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("aaa")
			expect(result.stdout).toContain("ab")
			expect(result.stdout).toContain("a")
		})

		it("should convert BRE \\? to Rust regex ?", async () => {
			const context = createContext("color\ncolour")
			const result = await handler.execute(["colou\\?r"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("color")
			expect(result.stdout).toContain("colour")
		})

		it("should convert BRE grouping \\(\\) to Rust regex ()", async () => {
			const context = createContext("foobar\nfoobaz")
			const result = await handler.execute(["foo\\(bar\\|baz\\)"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("foobar")
			expect(result.stdout).toContain("foobaz")
		})

		it("should handle multiple BRE OR patterns", async () => {
			const context = createContext("apple\nbanana\ncherry\ndate")
			const result = await handler.execute(["-i", "apple\\|cherry\\|date"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("apple")
			expect(result.stdout).toContain("cherry")
			expect(result.stdout).toContain("date")
			expect(result.stdout).not.toContain("banana")
		})

		it("should not convert when -F (fixed strings) is used", async () => {
			const context = createContext("a|b\nab")
			const result = await handler.execute(["-F", "a|b"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("a|b")
			expect(result.stdout).not.toContain("ab")
		})
	})
})
