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

	describe("stdin context lines (-A, -B, -C)", () => {
		const createContext = (stdin?: string): CommandContext => ({
			cwd: "/tmp",
			stdin,
			env: {},
		})

		const sampleInput = [
			"line1 header",
			"line2 start",
			"line3 match-target",
			"line4 after1",
			"line5 after2",
			"line6 after3",
			"line7 after4",
			"line8 after5",
			"line9 footer",
		].join("\n")

		it("should support -A (after context) from stdin", async () => {
			const context = createContext(sampleInput)
			const result = await handler.execute(["-A", "2", "match-target"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("line3 match-target")
			expect(result.stdout).toContain("line4 after1")
			expect(result.stdout).toContain("line5 after2")
			expect(result.stdout).not.toContain("line6 after3")
			expect(result.stdout).not.toContain("line2 start")
		})

		it("should support -B (before context) from stdin", async () => {
			const context = createContext(sampleInput)
			const result = await handler.execute(["-B", "2", "match-target"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("line1 header")
			expect(result.stdout).toContain("line2 start")
			expect(result.stdout).toContain("line3 match-target")
			expect(result.stdout).not.toContain("line4 after1")
		})

		it("should support -C (both context) from stdin", async () => {
			const context = createContext(sampleInput)
			const result = await handler.execute(["-C", "1", "match-target"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("line2 start")
			expect(result.stdout).toContain("line3 match-target")
			expect(result.stdout).toContain("line4 after1")
			expect(result.stdout).not.toContain("line1 header")
			expect(result.stdout).not.toContain("line5 after2")
		})

		it("should support -A 5 like cat file | grep -A 5 pattern", async () => {
			const context = createContext(sampleInput)
			const result = await handler.execute(["-A", "5", "match-target"], context)

			expect(result.exitCode).toBe(0)
			const lines = result.stdout.split("\n")
			// Should contain match + 5 after lines
			expect(lines).toContain("line3 match-target")
			expect(lines).toContain("line4 after1")
			expect(lines).toContain("line5 after2")
			expect(lines).toContain("line6 after3")
			expect(lines).toContain("line7 after4")
			expect(lines).toContain("line8 after5")
			expect(result.stdout).not.toContain("line2 start")
		})

		it("should show line numbers with correct separators when -n is used with context", async () => {
			const context = createContext(sampleInput)
			const result = await handler.execute(["-n", "-A", "1", "match-target"], context)

			expect(result.exitCode).toBe(0)
			// Match line uses ":", context line uses "-"
			expect(result.stdout).toContain("3:line3 match-target")
			expect(result.stdout).toContain("4-line4 after1")
		})

		it("should insert -- separator between non-contiguous context groups", async () => {
			const input = "aaa\nbbb\nccc\nddd\neee\nfff\nggg"
			const context = createContext(input)
			// Match "aaa" and "ggg" with -A 0 — two separate groups
			const result = await handler.execute(["-A", "1", "aaa\\|fff"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("--")
		})

		it("should not add context when no -A/-B/-C flags", async () => {
			const context = createContext(sampleInput)
			const result = await handler.execute(["match-target"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toBe("line3 match-target")
		})

		it("should handle -A at end of input (fewer lines available than requested)", async () => {
			const context = createContext(sampleInput)
			const result = await handler.execute(["-A", "5", "after5"], context)

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain("line8 after5")
			expect(result.stdout).toContain("line9 footer")
		})
	})
})
