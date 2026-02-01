/**
 * ShellParser 单元测试
 */

import { ShellParser } from "../ShellParser"

describe("ShellParser", () => {
	let parser: ShellParser

	beforeEach(() => {
		parser = new ShellParser()
	})

	describe("parsePipeline", () => {
		it("should parse simple command", () => {
			const stages = parser.parsePipeline("grep pattern file.txt")

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("grep")
			expect(stages[0].args).toEqual(["pattern", "file.txt"])
		})

		it("should parse command with quoted arguments", () => {
			const stages = parser.parsePipeline('grep "hello world" file.txt')

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("grep")
			expect(stages[0].args).toEqual(["hello world", "file.txt"])
		})

		it("should parse pipe command", () => {
			const stages = parser.parsePipeline("grep pattern | head -10")

			expect(stages).toHaveLength(2)
			expect(stages[0].command).toBe("grep")
			expect(stages[0].args).toEqual(["pattern"])
			expect(stages[1].command).toBe("head")
			expect(stages[1].args).toEqual(["-10"])
		})

		it("should parse multiple pipes", () => {
			const stages = parser.parsePipeline("cat file.txt | grep pattern | head -5 | tail -2")

			expect(stages).toHaveLength(4)
			expect(stages[0].command).toBe("cat")
			expect(stages[1].command).toBe("grep")
			expect(stages[2].command).toBe("head")
			expect(stages[3].command).toBe("tail")
		})

		it("should return passthrough stage for command substitution", () => {
			const stages = parser.parsePipeline("echo $(date)")

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("")
			expect(stages[0].handler).toBeNull()
		})

		it("should return passthrough stage for backtick substitution", () => {
			const stages = parser.parsePipeline("echo `date`")

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("")
		})

		it("should return passthrough stage for process substitution", () => {
			const stages = parser.parsePipeline("diff <(cat file1) <(cat file2)")

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("")
		})

		it("should return passthrough stage for here-doc", () => {
			const stages = parser.parsePipeline("cat <<EOF")

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("")
		})

		it("should return passthrough stage for here-doc with single quotes", () => {
			const stages = parser.parsePipeline("cat <<'EOF'")

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("")
		})

		it("should return passthrough stage for here-doc with double quotes", () => {
			const stages = parser.parsePipeline('cat <<"EOF"')

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("")
		})

		it("should return passthrough stage for here-doc with dash (strip tabs)", () => {
			const stages = parser.parsePipeline("cat <<-EOF")

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("")
		})

		it("should return passthrough stage for fd redirection", () => {
			const stages = parser.parsePipeline("command 2>&1")

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("")
		})

		it("should return passthrough stage for && operator", () => {
			const stages = parser.parsePipeline("cmd1 && cmd2")

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("")
		})

		it("should return passthrough stage for || operator", () => {
			const stages = parser.parsePipeline("cmd1 || cmd2")

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("")
		})

		it("should handle empty command", () => {
			const stages = parser.parsePipeline("")

			expect(stages).toHaveLength(1)
			expect(stages[0].command).toBe("")
		})
	})
})
