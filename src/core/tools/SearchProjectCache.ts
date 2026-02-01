import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"

/**
 * SearchProjectCache - 搜索项目缓存管理
 *
 * 管理 .roo/cache/search 目录下的搜索结果缓存，支持：
 * - 索引文件 index.json 的读写
 * - 缓存文件的创建和读取
 * - 基于 git state 的缓存有效性判断
 */

export interface CacheEntry {
	/** 缓存 ID（文件名，不含扩展名） */
	id: string
	/** 原始查询 */
	query: string
	/** 语义标签，用于模糊匹配 */
	tags: string[]
	/** 搜索范围 */
	scope?: {
		directories?: string
		filePatterns?: string
		excludes?: string
	}
	/** 创建时间 ISO 格式 */
	createdAt: string
	/** Git commit hash（用于判断缓存有效性） */
	gitCommit?: string
	/** 缓存生存时间（小时） */
	ttlHours: number
	/** 结果 schema（如果有） */
	schema?: string
}

export interface CacheIndex {
	version: string
	caches: CacheEntry[]
}

const CACHE_DIR = ".roo/cache/search"
const INDEX_FILE = "index.json"
const DEFAULT_TTL_HOURS = 168 // 7 天

export class SearchProjectCache {
	private workspacePath: string

	constructor(workspacePath: string) {
		this.workspacePath = workspacePath
	}

	/**
	 * 获取缓存目录路径
	 */
	private getCacheDir(): string {
		return path.join(this.workspacePath, CACHE_DIR)
	}

	/**
	 * 获取索引文件路径
	 */
	private getIndexPath(): string {
		return path.join(this.getCacheDir(), INDEX_FILE)
	}

	/**
	 * 确保缓存目录存在
	 */
	private async ensureCacheDir(): Promise<void> {
		const cacheDir = this.getCacheDir()
		try {
			await fs.mkdir(cacheDir, { recursive: true })
		} catch (err) {
			// 目录已存在，忽略
		}
	}

	/**
	 * 读取缓存索引
	 */
	async readIndex(): Promise<CacheIndex> {
		try {
			const indexPath = this.getIndexPath()
			const content = await fs.readFile(indexPath, "utf-8")
			return JSON.parse(content) as CacheIndex
		} catch {
			// 索引不存在或解析失败，返回空索引
			return { version: "1.0", caches: [] }
		}
	}

	/**
	 * 写入缓存索引
	 */
	async writeIndex(index: CacheIndex): Promise<void> {
		await this.ensureCacheDir()
		const indexPath = this.getIndexPath()
		await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8")
	}

	/**
	 * 获取当前 git commit hash
	 */
	async getCurrentGitCommit(): Promise<string | undefined> {
		try {
			const { exec } = await import("child_process")
			const { promisify } = await import("util")
			const execAsync = promisify(exec)
			const { stdout } = await execAsync("git rev-parse HEAD", { cwd: this.workspacePath })
			return stdout.trim()
		} catch {
			return undefined
		}
	}

	/**
	 * 生成新的缓存 ID
	 */
	private generateCacheId(existingIds: string[]): string {
		let maxId = 0
		for (const id of existingIds) {
			const num = parseInt(id, 10)
			if (!isNaN(num) && num > maxId) {
				maxId = num
			}
		}
		return String(maxId + 1)
	}

	/**
	 * 从查询中提取语义标签
	 */
	extractTags(query: string): string[] {
		// 简单的关键词提取，可以后续优化
		const keywords = query
			.toLowerCase()
			.replace(/[^\w\s\u4e00-\u9fa5]/g, " ") // 保留中英文和数字
			.split(/\s+/)
			.filter((word) => word.length > 1)

		// 去重
		return [...new Set(keywords)]
	}

	/**
	 * 添加新的缓存条目
	 */
	async addCache(params: {
		query: string
		scope?: CacheEntry["scope"]
		schema?: string
		result: string
	}): Promise<CacheEntry> {
		const { query, scope, schema, result } = params

		const index = await this.readIndex()
		const existingIds = index.caches.map((c) => c.id)
		const id = this.generateCacheId(existingIds)
		const gitCommit = await this.getCurrentGitCommit()

		const entry: CacheEntry = {
			id,
			query,
			tags: this.extractTags(query),
			scope,
			createdAt: new Date().toISOString(),
			gitCommit,
			ttlHours: DEFAULT_TTL_HOURS,
			schema,
		}

		// 写入缓存文件
		await this.ensureCacheDir()
		const cacheFilePath = path.join(this.getCacheDir(), `${id}.md`)
		const cacheContent = this.buildCacheFileContent(entry, result)
		await fs.writeFile(cacheFilePath, cacheContent, "utf-8")

		// 更新索引
		index.caches.push(entry)
		await this.writeIndex(index)

		return entry
	}

	/**
	 * 构建缓存文件内容
	 */
	private buildCacheFileContent(entry: CacheEntry, result: string): string {
		let content = `## CACHE METADATA
- ID: ${entry.id}
- Created: ${entry.createdAt}
- Git Commit: ${entry.gitCommit || "unknown"}
- TTL: ${entry.ttlHours} hours

## QUERY
${entry.query}

`

		if (entry.scope) {
			content += `## SCOPE
`
			if (entry.scope.directories) {
				content += `- Directories: ${entry.scope.directories}\n`
			}
			if (entry.scope.filePatterns) {
				content += `- File Patterns: ${entry.scope.filePatterns}\n`
			}
			if (entry.scope.excludes) {
				content += `- Excludes: ${entry.scope.excludes}\n`
			}
			content += "\n"
		}

		if (entry.schema) {
			content += `## SCHEMA
\`\`\`json
${entry.schema}
\`\`\`

`
		}

		content += `## RESULT
${result}
`

		return content
	}

	/**
	 * 检查缓存是否过期
	 */
	isCacheExpired(entry: CacheEntry): boolean {
		const createdAt = new Date(entry.createdAt)
		const now = new Date()
		const ageHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
		return ageHours > entry.ttlHours
	}

	/**
	 * 计算缓存年龄（人类可读格式）
	 */
	getCacheAge(entry: CacheEntry): string {
		const createdAt = new Date(entry.createdAt)
		const now = new Date()
		const ageMs = now.getTime() - createdAt.getTime()

		const hours = Math.floor(ageMs / (1000 * 60 * 60))
		if (hours < 1) {
			const minutes = Math.floor(ageMs / (1000 * 60))
			return `${minutes}m`
		}
		if (hours < 24) {
			return `${hours}h`
		}
		const days = Math.floor(hours / 24)
		return `${days}d`
	}

	/**
	 * 生成缓存提示信息（用于注入到子任务提示词中）
	 */
	async generateCacheHint(): Promise<string | null> {
		const index = await this.readIndex()

		// 过滤掉过期的缓存
		const validCaches = index.caches.filter((c) => !this.isCacheExpired(c))

		if (validCaches.length === 0) {
			return null
		}

		let hint = `## 可用缓存（来自 ${CACHE_DIR}）

以下是之前的搜索结果缓存。如果你的查询与某个缓存高度相关，可以直接使用 read_file 读取缓存文件，跳过重复调研。

| ID | Query | Tags | Age | Git Commit |
|----|-------|------|-----|------------|
`

		for (const cache of validCaches.slice(0, 10)) {
			// 最多显示 10 条
			const age = this.getCacheAge(cache)
			const tags = cache.tags.slice(0, 5).join(", ") // 最多显示 5 个标签
			const shortQuery = cache.query.length > 40 ? cache.query.substring(0, 40) + "..." : cache.query
			const shortCommit = cache.gitCommit ? cache.gitCommit.substring(0, 7) : "unknown"

			hint += `| ${cache.id} | ${shortQuery} | ${tags} | ${age} | ${shortCommit} |\n`
		}

		hint += `
**使用方法**：
1. 如果查询与某个缓存相关，先 \`read_file("${CACHE_DIR}/{id}.md")\` 查看缓存内容
2. 检查 Git Commit 是否与当前一致（可用 \`git rev-parse HEAD\` 验证）
3. 如果缓存有效且满足需求，可直接使用缓存结果
4. 如果缓存过期或不完整，进行新的调研

**注意**：缓存仅供参考，如果项目代码已变更，请重新调研。
`

		return hint
	}

	/**
	 * 清理过期缓存
	 */
	async cleanExpiredCaches(): Promise<number> {
		const index = await this.readIndex()
		const validCaches: CacheEntry[] = []
		let removedCount = 0

		for (const cache of index.caches) {
			if (this.isCacheExpired(cache)) {
				// 删除缓存文件
				try {
					const cacheFilePath = path.join(this.getCacheDir(), `${cache.id}.md`)
					await fs.unlink(cacheFilePath)
				} catch {
					// 文件可能已不存在，忽略
				}
				removedCount++
			} else {
				validCaches.push(cache)
			}
		}

		if (removedCount > 0) {
			index.caches = validCaches
			await this.writeIndex(index)
		}

		return removedCount
	}
}

/**
 * 获取工作区的缓存管理器实例
 */
export function getSearchProjectCache(): SearchProjectCache | null {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return null
	}
	return new SearchProjectCache(workspaceFolders[0].uri.fsPath)
}
