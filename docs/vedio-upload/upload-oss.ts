#!/usr/bin/env bun
import { readdir } from "fs/promises"
import { join } from "path"
import { parseArgs } from "util"
import { OSS } from "@opencode-ai/util/oss"

type UpdateChannel = "stable" | "edge"

const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		channel: {
			type: "string",
			short: "c",
			default: "stable",
		},
	},
})

const channel = (values.channel === "edge" ? "edge" : "stable") as UpdateChannel
const CHANNEL_LABELS: Record<UpdateChannel, string> = {
	stable: "Stable",
	edge: "Edge",
}

const FEISHU_WEBHOOK_URL = "https://open.feishu.cn/open-apis/bot/v2/hook/0b59b58b-c2f2-4ff6-bffb-e04e0d7a0307"
const OSS_BASE_URL = "https://ai-42-test.oss-cn-shanghai.aliyuncs.com"

const PKG_PATH = new URL("../package.json", import.meta.url).pathname
const BUNDLE_DIR = new URL("../src-tauri/target/release/bundle", import.meta.url).pathname

const DMG_DIR = join(BUNDLE_DIR, "dmg")
const MACOS_DIR = join(BUNDLE_DIR, "macos")

interface UpdatePlatform {
	signature: string
	url: string
}

interface LatestJson {
	version: string
	notes: string
	pub_date: string
	platforms: {
		"darwin-aarch64"?: UpdatePlatform
		"darwin-x86_64"?: UpdatePlatform
		"linux-x86_64"?: UpdatePlatform
		"windows-x86_64"?: UpdatePlatform
	}
}

async function findLatestFile(dir: string, extension: string): Promise<string | null> {
	try {
		const files = await readdir(dir)
		const matchedFiles = files.filter((f) => f.endsWith(extension) && !f.startsWith(".") && !f.startsWith("rw."))

		if (matchedFiles.length === 0) {
			return null
		}

		const stats = await Promise.all(
			matchedFiles.map(async (f) => {
				const file = Bun.file(join(dir, f))
				return { name: f, mtime: (await file.stat()).mtime }
			}),
		)

		stats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
		return stats[0].name
	} catch {
		return null
	}
}

async function uploadFile(localPath: string, ossPath: string): Promise<string> {
	console.log(`📤 上传: ${ossPath}`)
	const result = await OSS.client.uploadFile(localPath, { path: ossPath })
	if (!result.success) {
		throw new Error(result.error)
	}
	console.log(`   文件上传成功`)
	return result.url!
}

async function readSignature(sigPath: string): Promise<string> {
	const file = Bun.file(sigPath)
	return await file.text()
}

async function getVersion(): Promise<string> {
	const pkg = await Bun.file(PKG_PATH).json()
	return pkg.version
}

async function sendFeishuNotification(version: string, dmgUrl: string, releaseChannel: UpdateChannel): Promise<void> {
	const channelLabel = CHANNEL_LABELS[releaseChannel]
	const title = `Pie Desktop v${version} (${channelLabel}) 发布成功`
	const content = `✅ macOS 桌面客户端构建完成\n\n**版本号**: ${version}\n**渠道**: ${channelLabel}\n**平台**: macOS (Apple Silicon)`

	const payload = {
		msg_type: "interactive",
		card: {
			schema: "2.0",
			config: {
				update_multi: true,
			},
			header: {
				title: {
					tag: "plain_text",
					content: title,
				},
				template: "green",
				padding: "12px 12px 12px 12px",
			},
			body: {
				direction: "vertical",
				padding: "12px 12px 12px 12px",
				elements: [
					{
						tag: "markdown",
						content: content,
						text_align: "left",
						text_size: "normal",
						margin: "0px 0px 0px 0px",
					},
					{
						tag: "button",
						text: {
							tag: "plain_text",
							content: "下载 DMG",
						},
						type: "primary",
						width: "default",
						size: "medium",
						behaviors: [
							{
								type: "open_url",
								default_url: dmgUrl,
							},
						],
						margin: "12px 0px 0px 0px",
					},
				],
			},
		},
	}

	try {
		const response = await fetch(FEISHU_WEBHOOK_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		})
		const result = await response.json()
		if (result.code === 0) {
			console.log("✓ 飞书通知发送成功")
		} else {
			console.error("⚠ 飞书通知发送失败:", result)
		}
	} catch (err) {
		console.error("⚠ 飞书通知发送异常:", err)
	}
}

async function main() {
	console.log(`✓ 发布渠道: ${CHANNEL_LABELS[channel]} (${channel})`)

	const version = await getVersion()
	console.log(`✓ 版本号: ${version}`)

	const tarGzFile = await findLatestFile(MACOS_DIR, ".app.tar.gz")
	const sigFile = await findLatestFile(MACOS_DIR, ".app.tar.gz.sig")
	const dmgFile = await findLatestFile(DMG_DIR, ".dmg")

	if (!tarGzFile || !sigFile) {
		console.error("❌ 未找到更新文件 (.app.tar.gz 或 .sig)")
		console.error("   请确保使用签名密钥构建: TAURI_SIGNING_PRIVATE_KEY")
		process.exit(1)
	}

	console.log(`✓ 找到更新包: ${tarGzFile}`)
	console.log(`✓ 找到签名文件: ${sigFile}`)
	if (dmgFile) {
		console.log(`✓ 找到 DMG: ${dmgFile}`)
	}

	const versionedTarGz = `Pie_${version}_aarch64.app.tar.gz`
	const versionedSig = `Pie_${version}_aarch64.app.tar.gz.sig`
	const manifestFileName = channel === "stable" ? "pie_desktop_latest.json" : "pie_desktop_edge_latest.json"

	try {
		const tarGzUrl = await uploadFile(join(MACOS_DIR, tarGzFile), `releases/${versionedTarGz}`)
		await uploadFile(join(MACOS_DIR, sigFile), `releases/${versionedSig}`)

		if (dmgFile) {
			await uploadFile(join(DMG_DIR, dmgFile), `releases/${dmgFile}`)
		}

		const signature = await readSignature(join(MACOS_DIR, sigFile))

		const latestJson: LatestJson = {
			version,
			notes: `Release ${version} (${channel})`,
			pub_date: new Date().toISOString(),
			platforms: {
				"darwin-aarch64": {
					signature: signature.trim(),
					url: tarGzUrl,
				},
			},
		}

		const latestJsonPath = `/tmp/${manifestFileName}`
		await Bun.write(latestJsonPath, JSON.stringify(latestJson, null, 2))
		await uploadFile(latestJsonPath, `releases/${manifestFileName}`)

		console.log(`\n✅ 上传完成! (${CHANNEL_LABELS[channel]})`)
		console.log(`   更新清单: ${OSS_BASE_URL}/releases/${manifestFileName}`)
		console.log(`   更新包: ${tarGzUrl}`)
		if (dmgFile) {
			const encodedDmgFile = encodeURIComponent(dmgFile)
			const dmgUrl = `${OSS_BASE_URL}/releases/${encodedDmgFile}`
			console.log(`   DMG 下载: ${dmgUrl}`)
			await sendFeishuNotification(version, dmgUrl, channel)
		}
	} catch (err) {
		console.error("❌ 上传失败:", err)
		process.exit(1)
	}
}

main()
