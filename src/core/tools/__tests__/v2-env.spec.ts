/**
 * Tests for v2/env.ts — environment detection
 */

import { detectEnv, resetEnvCache, getAvailableByGroup, getPreferredRuntime } from "../v2/env"
import type { EnvSnapshot } from "../v2/env"

describe("v2/env", () => {
	beforeEach(() => {
		resetEnvCache()
	})

	describe("detectEnv", () => {
		test("returns a valid EnvSnapshot", async () => {
			const env = await detectEnv()

			expect(env.os).toBeDefined()
			expect(["windows", "macos", "linux"]).toContain(env.os)
			expect(env.platform).toBe(process.platform)
			expect(env.defaultShell).toBeDefined()
			expect(Array.isArray(env.runtimes)).toBe(true)
			expect(env.runtimes.length).toBeGreaterThan(0)
		})

		test("caches result on second call", async () => {
			const env1 = await detectEnv()
			const env2 = await detectEnv()
			expect(env1).toBe(env2) // same reference
		})

		test("detects node as available", async () => {
			const env = await detectEnv()
			const node = env.runtimes.find((r) => r.name === "node")
			expect(node).toBeDefined()
			expect(node!.available).toBe(true)
			expect(node!.version).toBeTruthy()
		})
	})

	describe("getAvailableByGroup", () => {
		test("returns available runtimes sorted by priority", async () => {
			const env = await detectEnv()
			const jsRuntimes = getAvailableByGroup(env, "js")

			// node should always be available in test environment
			expect(jsRuntimes.length).toBeGreaterThan(0)
			expect(jsRuntimes.every((r) => r.available)).toBe(true)

			// Check sorted by priority
			for (let i = 1; i < jsRuntimes.length; i++) {
				expect(jsRuntimes[i].priority).toBeGreaterThanOrEqual(jsRuntimes[i - 1].priority)
			}
		})
	})

	describe("getPreferredRuntime", () => {
		test("returns highest priority available runtime", async () => {
			const env = await detectEnv()
			const preferred = getPreferredRuntime(env, "js")

			expect(preferred).toBeDefined()
			expect(preferred!.available).toBe(true)
		})

		test("returns null for group with no available runtimes", () => {
			const emptyEnv: EnvSnapshot = {
				os: "linux",
				platform: "linux",
				defaultShell: "sh",
				runtimes: [],
			}
			expect(getPreferredRuntime(emptyEnv, "python")).toBeNull()
		})
	})
})
