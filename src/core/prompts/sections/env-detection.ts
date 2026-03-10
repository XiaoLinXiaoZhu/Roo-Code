/**
 * Runtime Environment Detection
 *
 * 探测当前系统可用的 runtime（bun/node/python 等），
 * 结果缓存在进程生命周期内，供系统提示词使用。
 *
 * 改编自 docs/better-tools/env.ts，适配 VS Code 扩展环境。
 */

import { execFile } from "child_process"

// PLACEHOLDER_TYPES
// PLACEHOLDER_DEFS
// PLACEHOLDER_PROBE
// PLACEHOLDER_CACHE
// PLACEHOLDER_API

/** 单个 runtime 的探测结果 */
export interface RuntimeProbe {
	name: string
	group: "shell" | "js" | "python"
	available: boolean
	version: string | null
	priority: number
}

/** 完整的环境信息快照 */
export interface EnvSnapshot {
	os: "windows" | "macos" | "linux" | string
	defaultShell: string
	runtimes: RuntimeProbe[]
}

interface RuntimeDef {
	name: string
	group: "shell" | "js" | "python"
	cmd: string
	versionArgs: string[]
	versionPattern: RegExp
	priority: number
	platforms: NodeJS.Platform[] | null
	versionOptional?: boolean
}

const IS_WINDOWS = process.platform === "win32"

const RUNTIME_DEFS: RuntimeDef[] = [
	// Shell
	{
		name: "cmd",
		group: "shell",
		cmd: "cmd",
		versionArgs: ["/c", "ver"],
		versionPattern: /(\d+\.\d+[\w.]*)/,
		priority: 1,
		platforms: ["win32"],
		versionOptional: true,
	},
	{
		name: "sh",
		group: "shell",
		cmd: "sh",
		versionArgs: ["-c", "exit 0"],
		versionPattern: /^$/,
		priority: 1,
		platforms: ["darwin", "linux"],
		versionOptional: true,
	},
	{
		name: "bash",
		group: "shell",
		cmd: "bash",
		versionArgs: ["--version"],
		versionPattern: /(\d+\.\d+[\w.]*)/,
		priority: 2,
		platforms: null,
		versionOptional: true,
	},
	{
		name: "pwsh",
		group: "shell",
		cmd: "pwsh",
		versionArgs: ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"],
		versionPattern: /(\d+\.\d+[\w.]*)/,
		priority: 3,
		platforms: null,
		versionOptional: true,
	},
	// JS/TS
	{
		name: "bun",
		group: "js",
		cmd: "bun",
		versionArgs: ["--version"],
		versionPattern: /(\d+\.\d+[\w.]*)/,
		priority: 1,
		platforms: null,
	},
	{
		name: "node",
		group: "js",
		cmd: "node",
		versionArgs: ["--version"],
		versionPattern: /v?(\d+\.\d+[\w.]*)/,
		priority: 2,
		platforms: null,
	},
	{
		name: "deno",
		group: "js",
		cmd: "deno",
		versionArgs: ["--version"],
		versionPattern: /deno\s+(\d+\.\d+[\w.]*)/,
		priority: 3,
		platforms: null,
	},
	// Python
	{
		name: "python",
		group: "python",
		cmd: "python",
		versionArgs: ["--version"],
		versionPattern: /Python\s+(\d+\.\d+[\w.]*)/,
		priority: 1,
		platforms: null,
	},
	{
		name: "python3",
		group: "python",
		cmd: "python3",
		versionArgs: ["--version"],
		versionPattern: /Python\s+(\d+\.\d+[\w.]*)/,
		priority: 2,
		platforms: null,
	},
	{
		name: "uv",
		group: "python",
		cmd: "uv",
		versionArgs: ["--version"],
		versionPattern: /uv\s+(\d+\.\d+[\w.]*)/,
		priority: 3,
		platforms: null,
	},
]

function probeRuntime(def: RuntimeDef): Promise<RuntimeProbe> {
	const base: RuntimeProbe = {
		name: def.name,
		group: def.group,
		available: false,
		version: null,
		priority: def.priority,
	}

	if (def.platforms && !def.platforms.includes(process.platform)) {
		return Promise.resolve(base)
	}

	return new Promise((resolve) => {
		try {
			const child = execFile(def.cmd, def.versionArgs, { timeout: 5000 }, (error, stdout, stderr) => {
				if (error) {
					resolve(base)
					return
				}
				const output = (stdout || "") + (stderr || "")
				const match = output.match(def.versionPattern)
				const version = match?.[1] ?? null

				if (!version && !def.versionOptional) {
					resolve(base)
					return
				}

				resolve({ ...base, available: true, version })
			})

			child.on("error", () => resolve(base))
		} catch {
			resolve(base)
		}
	})
}

let cachedSnapshot: EnvSnapshot | null = null

/**
 * 探测系统环境，结果缓存（进程生命周期内只探测一次）。
 * 首次调用并发探测所有 runtime，耗时约 1-2 秒。
 */
export async function detectEnv(): Promise<EnvSnapshot> {
	if (cachedSnapshot) return cachedSnapshot

	const probes = await Promise.all(RUNTIME_DEFS.map(probeRuntime))

	cachedSnapshot = {
		os: IS_WINDOWS ? "windows" : process.platform === "darwin" ? "macos" : "linux",
		defaultShell: IS_WINDOWS ? "cmd" : "sh",
		runtimes: probes,
	}

	return cachedSnapshot
}

/** 同步获取已缓存的环境快照 */
export function getCachedEnv(): EnvSnapshot | null {
	return cachedSnapshot
}

/** 获取某个分组中可用的 runtime，按优先级排序 */
export function getAvailableByGroup(snapshot: EnvSnapshot, group: "shell" | "js" | "python"): RuntimeProbe[] {
	return snapshot.runtimes.filter((r) => r.group === group && r.available).sort((a, b) => a.priority - b.priority)
}

/** 格式化 runtime 信息为提示词片段 */
export function formatRuntimesForPrompt(snapshot: EnvSnapshot): string {
	const groups: { label: string; key: "shell" | "js" | "python" }[] = [
		{ label: "Shell", key: "shell" },
		{ label: "JS/TS", key: "js" },
		{ label: "Python", key: "python" },
	]

	const lines: string[] = []
	for (const { label, key } of groups) {
		const available = getAvailableByGroup(snapshot, key)
		if (available.length > 0) {
			const rts = available.map((r) => (r.version ? `${r.name} ${r.version}` : r.name)).join(", ")
			lines.push(`- ${label}: ${rts}`)
		}
	}

	return lines.length > 0 ? `- Available Runtimes:\n${lines.map((l) => "  " + l).join("\n")}` : ""
}

/** 重置缓存（仅用于测试） */
export function _resetCache(): void {
	cachedSnapshot = null
}
