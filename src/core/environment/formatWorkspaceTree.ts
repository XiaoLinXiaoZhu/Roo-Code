import path from "path"

/**
 * 将扁平的文件路径列表转换为分层目录树 XML 格式。
 *
 * 设计目标：
 * 1. 优先展示目录层级架构，让 AI 快速理解项目骨架
 * 2. 折叠高度相似的文件（同目录下相似文件名 > threshold 时折叠）
 * 3. 标记 ignored / protected 属性
 *
 * @param files - 文件/目录的绝对路径列表（目录以 "/" 结尾）
 * @param cwd - 工作区根目录
 * @param options - 格式化选项
 * @returns XML 字符串
 */
export function formatWorkspaceTree(files: string[], cwd: string, options: FormatOptions = {}): string {
	const { foldThreshold = 5, checkIgnored = () => false, checkProtected = () => false } = options

	// 1. 构建树结构
	const root = buildTree(files, cwd)

	// 2. 生成 XML
	return renderNode(root, "", foldThreshold, checkIgnored, checkProtected, cwd)
}

export interface FormatOptions {
	/** 同目录下相似文件超过此数量时折叠，默认 5 */
	foldThreshold?: number
	/** 检查文件是否被 rooignore 忽略 */
	checkIgnored?: (relativePath: string) => boolean
	/** 检查文件是否被保护 */
	checkProtected?: (absolutePath: string) => boolean
}

// ============================================================================
// 树结构
// ============================================================================

interface TreeNode {
	name: string
	/** 是否为目录 */
	isDir: boolean
	/** 子节点（仅目录有） */
	children: Map<string, TreeNode>
	/** 该目录下的直接文件（仅目录有） */
	directFiles: string[]
	/** 绝对路径 */
	absolutePath: string
}

function createDirNode(name: string, absolutePath: string): TreeNode {
	return {
		name,
		isDir: true,
		children: new Map(),
		directFiles: [],
		absolutePath,
	}
}

/**
 * 将扁平路径列表构建为树结构
 */
function buildTree(files: string[], cwd: string): TreeNode {
	const root = createDirNode("", cwd)

	for (const filePath of files) {
		const isDir = filePath.endsWith("/") || filePath.endsWith("\\")
		const relativePath = path.relative(cwd, filePath).replace(/\\/g, "/").replace(/\/$/, "")

		if (!relativePath) continue

		const parts = relativePath.split("/")

		if (isDir) {
			// 确保目录节点存在
			ensureDirPath(root, parts, cwd)
		} else {
			// 文件：确保父目录存在，然后添加文件到父目录的 directFiles
			if (parts.length === 1) {
				root.directFiles.push(parts[0])
			} else {
				const dirParts = parts.slice(0, -1)
				const fileName = parts[parts.length - 1]
				const parentNode = ensureDirPath(root, dirParts, cwd)
				parentNode.directFiles.push(fileName)
			}
		}
	}

	return root
}

/**
 * 确保目录路径上的所有节点都存在，返回最深层的目录节点
 */
function ensureDirPath(root: TreeNode, parts: string[], cwd: string): TreeNode {
	let current = root
	let currentPath = cwd

	for (const part of parts) {
		currentPath = path.join(currentPath, part)
		if (!current.children.has(part)) {
			current.children.set(part, createDirNode(part, currentPath))
		}
		current = current.children.get(part)!
	}

	return current
}

// ============================================================================
// 相似文件检测与折叠
// ============================================================================

interface FileGroup {
	pattern: string
	files: string[]
}

/**
 * 将文件列表按相似模式分组。
 * 相似性判断：提取文件名中的"变化部分"，如果去掉变化部分后的模式相同，则归为一组。
 *
 * 例如：
 * - package.nls.ja.json, package.nls.ko.json → 模式 "package.nls.*.json"
 * - 3.26.0-release.png, 3.27.0-release.png → 模式 "*-release.png"
 */
function groupSimilarFiles(fileNames: string[]): { groups: FileGroup[]; ungrouped: string[] } {
	if (fileNames.length === 0) return { groups: [], ungrouped: [] }

	// 按扩展名分组
	const byExt = new Map<string, string[]>()
	for (const name of fileNames) {
		const ext = getExtension(name)
		if (!byExt.has(ext)) byExt.set(ext, [])
		byExt.get(ext)!.push(name)
	}

	const groups: FileGroup[] = []
	const ungrouped: string[] = []

	for (const [, extFiles] of byExt) {
		if (extFiles.length <= 1) {
			ungrouped.push(...extFiles)
			continue
		}

		// 尝试找到公共前缀和后缀
		const patternGroups = findPatternGroups(extFiles)
		for (const pg of patternGroups) {
			if (pg.files.length > 1) {
				groups.push(pg)
			} else {
				ungrouped.push(...pg.files)
			}
		}
	}

	return { groups, ungrouped }
}

/**
 * 获取文件扩展名（包含点号）。
 * 只取最后一个点号后的部分，避免 "3.26.0-release.png" 被误判为 ".26.0-release.png"。
 */
function getExtension(fileName: string): string {
	// 处理以 . 开头的隐藏文件（如 .gitignore）
	if (fileName.startsWith(".") && !fileName.includes(".", 1)) {
		return ""
	}
	const lastDotIndex = fileName.lastIndexOf(".")
	// 对于隐藏文件如 ".prettierrc.json"，确保不返回整个文件名
	if (lastDotIndex <= 0) return ""
	return fileName.substring(lastDotIndex)
}

/**
 * 在同扩展名的文件中，通过最长公共前缀/后缀找到模式分组
 */
function findPatternGroups(fileNames: string[]): FileGroup[] {
	// 简单策略：找最长公共前缀
	const prefix = longestCommonPrefix(fileNames)
	const suffix = longestCommonSuffix(fileNames)

	// 如果前缀和后缀合起来覆盖了文件名的大部分，说明它们是相似的。
	// 当 patternLen >= minLen 时，说明最短文件名完全被前缀+后缀覆盖（可能有重叠），
	// 这也是有效的相似模式（如 "package.nls.json" vs "package.nls.ja.json"）。
	const minLen = Math.min(...fileNames.map((f) => f.length))
	const patternLen = prefix.length + suffix.length

	if (patternLen > 0 && prefix.length > 0) {
		// 有有效的模式
		const pattern = prefix + "*" + suffix
		return [{ pattern, files: fileNames }]
	}

	// 没有明显的公共模式，每个文件单独
	return fileNames.map((f) => ({ pattern: f, files: [f] }))
}

function longestCommonPrefix(strs: string[]): string {
	if (strs.length === 0) return ""
	let prefix = strs[0]
	for (let i = 1; i < strs.length; i++) {
		while (!strs[i].startsWith(prefix)) {
			prefix = prefix.substring(0, prefix.length - 1)
			if (prefix === "") return ""
		}
	}
	return prefix
}

function longestCommonSuffix(strs: string[]): string {
	if (strs.length === 0) return ""
	const reversed = strs.map((s) => s.split("").reverse().join(""))
	const revPrefix = longestCommonPrefix(reversed)
	return revPrefix.split("").reverse().join("")
}

// ============================================================================
// XML 渲染
// ============================================================================

/**
 * 转义 XML 特殊字符
 */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

/**
 * 递归渲染树节点为 XML
 */
function renderNode(
	node: TreeNode,
	indent: string,
	foldThreshold: number,
	checkIgnored: (relativePath: string) => boolean,
	checkProtected: (absolutePath: string) => boolean,
	cwd: string,
): string {
	let xml = ""
	const childIndent = indent + "  "

	// 1. 先渲染子目录（目录优先）
	const sortedDirs = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name))

	for (const child of sortedDirs) {
		const relativePath = path.relative(cwd, child.absolutePath).replace(/\\/g, "/")
		const ignoredAttr = checkIgnored(relativePath) ? ' ignored="true"' : ""
		const protectedAttr = checkProtected(child.absolutePath) ? ' protected="true"' : ""

		// 检查子目录是否为空（没有子目录也没有文件）
		const hasContent = child.children.size > 0 || child.directFiles.length > 0
		const childContent = renderNode(child, childIndent, foldThreshold, checkIgnored, checkProtected, cwd)

		if (!hasContent) {
			xml += `\n${indent}<dir name="${escapeXml(child.name)}/"${ignoredAttr}${protectedAttr}/>`
		} else {
			xml += `\n${indent}<dir name="${escapeXml(child.name)}/"${ignoredAttr}${protectedAttr}>`
			xml += childContent
			xml += `\n${indent}</dir>`
		}
	}

	// 2. 渲染直接文件（带折叠逻辑）
	if (node.directFiles.length > 0) {
		const { groups, ungrouped } = groupSimilarFiles(node.directFiles)

		// 渲染需要折叠的组
		for (const group of groups) {
			if (group.files.length >= foldThreshold) {
				// 折叠：显示模式和数量
				xml += `\n${indent}<files pattern="${escapeXml(group.pattern)}" count="${group.files.length}"/>`
			} else {
				// 不够折叠阈值，逐个显示
				for (const fileName of group.files.sort()) {
					xml += renderFileEntry(fileName, node.absolutePath, indent, checkIgnored, checkProtected, cwd)
				}
			}
		}

		// 渲染未分组的文件
		for (const fileName of ungrouped.sort()) {
			xml += renderFileEntry(fileName, node.absolutePath, indent, checkIgnored, checkProtected, cwd)
		}
	}

	return xml
}

/**
 * 渲染单个文件条目
 */
function renderFileEntry(
	fileName: string,
	parentAbsolutePath: string,
	indent: string,
	checkIgnored: (relativePath: string) => boolean,
	checkProtected: (absolutePath: string) => boolean,
	cwd: string,
): string {
	const absolutePath = path.join(parentAbsolutePath, fileName)
	const relativePath = path.relative(cwd, absolutePath).replace(/\\/g, "/")
	const ignoredAttr = checkIgnored(relativePath) ? ' ignored="true"' : ""
	const protectedAttr = checkProtected(absolutePath) ? ' protected="true"' : ""
	return `\n${indent}<file${ignoredAttr}${protectedAttr}>${escapeXml(fileName)}</file>`
}
