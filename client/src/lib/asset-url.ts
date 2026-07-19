export function resolveAssetUrl(url?: string | null) {
	if (!url) return ""
	if (url.startsWith("/api/content/assets/") || url.startsWith("/uploads/")) return url
	try {
		const parsed = new URL(url)
		if (["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.port === "9000") {
			const match = parsed.pathname.match(/\/(?:[^/]+)\/(avatars|materials)\/(.+)$/)
			if (match) return `/api/content/assets/${match[1]}/${match[2]}`
		}
	} catch {
		// 非标准 URL 保持原样，由图片自身的降级样式处理。
	}
	return url
}
