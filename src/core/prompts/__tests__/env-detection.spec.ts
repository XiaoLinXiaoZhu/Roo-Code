import {
	detectEnv,
	getCachedEnv,
	getAvailableByGroup,
	formatRuntimesForPrompt,
	_resetCache,
} from "../sections/env-detection"
import type { EnvSnapshot } from "../sections/env-detection"

describe("env-detection", () => {
	beforeEach(() => {
		_resetCache()
	})

	describe("detectEnv", () => {
		it("returns an EnvSnapshot with os, defaultShell, and runtimes", async () => {
			const env = await detectEnv()

			expect(env).toHaveProperty("os")
			expect(env).toHaveProperty("defaultShell")
			expect(env).toHaveProperty("runtimes")
			expect(Array.isArray(env.runtimes)).toBe(true)
			expect(env.runtimes.length).toBeGreaterThan(0)
		})

		it("detects at least one shell runtime", async () => {
			const env = await detectEnv()
			const shells = env.runtimes.filter((r) => r.group === "shell" && r.available)
			expect(shells.length).toBeGreaterThan(0)
		})

		it("detects node as available (test environment has node)", async () => {
			const env = await detectEnv()
			const node = env.runtimes.find((r) => r.name === "node")
			expect(node).toBeDefined()
			expect(node!.available).toBe(true)
			expect(node!.version).toBeTruthy()
		})

		it("caches results on subsequent calls", async () => {
			const env1 = await detectEnv()
			const env2 = await detectEnv()
			expect(env1).toBe(env2) // Same reference
		})
	})

	describe("getCachedEnv", () => {
		it("returns null before detectEnv is called", () => {
			expect(getCachedEnv()).toBeNull()
		})

		it("returns the snapshot after detectEnv is called", async () => {
			await detectEnv()
			const cached = getCachedEnv()
			expect(cached).not.toBeNull()
			expect(cached).toHaveProperty("os")
		})
	})

	describe("getAvailableByGroup", () => {
		it("returns available runtimes sorted by priority", () => {
			const snapshot: EnvSnapshot = {
				os: "linux",
				defaultShell: "sh",
				runtimes: [
					{ name: "node", group: "js", available: true, version: "20.0.0", priority: 2 },
					{ name: "bun", group: "js", available: true, version: "1.0.0", priority: 1 },
					{ name: "deno", group: "js", available: false, version: null, priority: 3 },
					{ name: "sh", group: "shell", available: true, version: null, priority: 1 },
				],
			}

			const jsRuntimes = getAvailableByGroup(snapshot, "js")
			expect(jsRuntimes).toHaveLength(2)
			expect(jsRuntimes[0].name).toBe("bun")
			expect(jsRuntimes[1].name).toBe("node")
		})

		it("returns empty array when no runtimes available in group", () => {
			const snapshot: EnvSnapshot = {
				os: "linux",
				defaultShell: "sh",
				runtimes: [{ name: "sh", group: "shell", available: true, version: null, priority: 1 }],
			}

			expect(getAvailableByGroup(snapshot, "python")).toHaveLength(0)
		})
	})

	describe("formatRuntimesForPrompt", () => {
		it("formats available runtimes into prompt text", () => {
			const snapshot: EnvSnapshot = {
				os: "linux",
				defaultShell: "sh",
				runtimes: [
					{ name: "sh", group: "shell", available: true, version: null, priority: 1 },
					{ name: "bash", group: "shell", available: true, version: "5.1.0", priority: 2 },
					{ name: "node", group: "js", available: true, version: "20.0.0", priority: 2 },
					{ name: "bun", group: "js", available: true, version: "1.0.0", priority: 1 },
					{ name: "python", group: "python", available: false, version: null, priority: 1 },
				],
			}

			const result = formatRuntimesForPrompt(snapshot)
			expect(result).toContain("Shell: sh, bash 5.1.0")
			expect(result).toContain("JS/TS: bun 1.0.0, node 20.0.0")
			expect(result).not.toContain("Python")
		})

		it("returns empty string when no runtimes available", () => {
			const snapshot: EnvSnapshot = {
				os: "linux",
				defaultShell: "sh",
				runtimes: [],
			}

			expect(formatRuntimesForPrompt(snapshot)).toBe("")
		})
	})
})
