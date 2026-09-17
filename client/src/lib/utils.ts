import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 生成仅用于客户端临时状态的唯一 ID。
 * randomUUID 在非安全上下文（线上 HTTP）和部分旧浏览器中不可用，
 * 因此优先使用它，再降级到 getRandomValues，最后使用时间戳随机串。
 */
export function createClientId() {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID()

  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6]! & 0x0f) | 0x40
    bytes[8] = (bytes[8]! & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`
  }

  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

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

/**
 * 将本地 File 异步读取为 base64 Data URL（可用于图片预览或上传）。
 */
export function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

// 计算素材库中素材文件的大小，返回格式化后的字符串。
export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}
