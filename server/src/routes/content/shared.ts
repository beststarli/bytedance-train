import { Request, Response } from 'express'
import { verifyToken } from '../../utils/jwt'

// 认证中间件
export function auth(req: Request, res: Response) {
	const header = req.headers.authorization
	if (!header?.startsWith('Bearer ')) {
		res.status(401).json({ error: '未登录' })
		return null
	}
	try {
		return verifyToken(header.slice(7)).userId
	} catch {
		res.status(401).json({ error: 'token 已过期或无效' })
		return null
	}
}

export function optionalUserId(req: Request) {
	const header = req.headers.authorization
	if (!header?.startsWith('Bearer ')) return null
	try {
		return verifyToken(header.slice(7)).userId
	} catch {
		return null
	}
}

export function imageExtension(contentType: string) {
	if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'jpg'
	if (contentType === 'image/webp') return 'webp'
	if (contentType === 'image/gif') return 'gif'
	return 'png'
}

export async function downloadImage(url: string) {
	const parsedUrl = new URL(url)
	if (parsedUrl.protocol !== 'https:') throw new Error('生成图片地址不是安全的 HTTPS 地址')

	const response = await fetch(url)
	if (!response.ok) throw new Error(`下载生成图片失败：${response.status}`)
	const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || ''
	if (!contentType.startsWith('image/')) throw new Error('生成结果不是有效图片')

	const buffer = Buffer.from(await response.arrayBuffer())
	if (buffer.length > 20 * 1024 * 1024) throw new Error('生成图片超过 20MB，无法持久化')
	return { buffer, contentType }
}