import { Router, Request, Response } from 'express'
import path from 'path'
import { randomUUID } from 'crypto'
import { pool } from '../../utils/db'
import { deleteUpload, getUpload, objectStorageErrorMessage, saveUpload } from '../../utils/objectStorage'
import { auth, downloadImage, imageExtension } from './shared'

const router: Router = Router()

// ==================== Materials ====================

router.get('/assets/:scope/:filename', async (req: Request, res: Response) => {
	const scope = String(req.params.scope || '')
	const filename = String(req.params.filename || '')
	if (!['materials', 'avatars', 'generated'].includes(scope) || filename !== path.basename(filename)) {
		res.status(400).json({ error: '资源路径无效' })
		return
	}
	try {
		let asset
		try {
			asset = await getUpload(`${scope}/${filename}`)
		} catch (error) {
			// 兼容旧启动迁移错误生成的 materials/ai-generated-* URL。
			// 实际对象一直保存在 generated/，并未丢失。
			if (scope !== 'materials' || !filename.startsWith('ai-generated-')) throw error
			asset = await getUpload(`generated/${filename}`)
		}
		res.setHeader('Content-Type', asset.contentType)
		res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
		if (asset.etag) res.setHeader('ETag', asset.etag)
		res.send(asset.body)
	} catch (error) {
		console.error('读取 RustFS 资源失败:', error)
		res.status(404).json({ error: '资源不存在或暂时不可用' })
	}
})

router.get('/materials', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { rows } = await pool.query(
		"SELECT id, filename, url, type, size, source_url, created_at FROM materials WHERE user_id = $1 AND type = 'image' ORDER BY created_at DESC",
		[userId]
	)
	res.json({ materials: rows })
})

router.post('/messages/:id/import-image', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const requestedUrl = String(req.body?.url || '').trim()
	const { rows } = await pool.query(
		`SELECT m.content
		 FROM messages m JOIN chats c ON c.id = m.chat_id
		 WHERE m.id = $1 AND m.role = 'assistant' AND c.user_id = $2`,
		[req.params.id, userId],
	)
	const messageContent = String(rows[0]?.content || '')
	const imageUrls = [
		...Array.from(messageContent.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g), (match) => match[1]),
		...messageContent.split('\n').map((line) => line.trim()).filter((line) =>
			/^(https?:\/\/|\/)\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(line),
		),
	]
	if (!rows[0] || !requestedUrl || !imageUrls.includes(requestedUrl)) {
		res.status(400).json({ error: '图片不属于当前用户的 AI 对话' })
		return
	}

	try {
		const existing = await pool.query(
			'SELECT id, filename, url, type, size, source_url, created_at FROM materials WHERE user_id = $1 AND source_url = $2 LIMIT 1',
			[userId, requestedUrl],
		)
		if (existing.rows[0]) {
			res.json({ material: existing.rows[0], already_exists: true })
			return
		}

		const isPersistedGeneratedImage =
			requestedUrl.startsWith('/api/content/assets/generated/ai-generated-')
			|| requestedUrl.startsWith('/uploads/ai-generated-')

		let filename: string
		let url: string
		let size: number | null
		if (isPersistedGeneratedImage) {
			filename = path.basename(requestedUrl)
			url = requestedUrl
			size = null
		} else {
			const { buffer, contentType } = await downloadImage(requestedUrl)
			filename = `ai-${Date.now()}-${randomUUID().slice(0, 8)}.${imageExtension(contentType)}`
			url = await saveUpload(`materials/${filename}`, buffer, contentType)
			size = buffer.length
		}

		const inserted = await pool.query(
			`INSERT INTO materials (user_id, filename, url, type, size, source_url)
			 VALUES ($1, $2, $3, 'image', $4, $5)
			 ON CONFLICT (user_id, source_url) WHERE source_url IS NOT NULL
			 DO UPDATE SET source_url = EXCLUDED.source_url
			 RETURNING id, filename, url, type, size, source_url, created_at`,
			[userId, filename, url, size, requestedUrl],
		)
		res.json({ material: inserted.rows[0], already_exists: false })
	} catch (error) {
		console.error('[Image] 添加 AI 图片到素材库失败：', error)
		res.status(400).json({ error: error instanceof Error ? error.message : '添加素材失败' })
	}
})

router.post('/materials', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { filename, data } = req.body
	if (!data) {
		res.status(400).json({ error: '文件数据不能为空' })
		return
	}

	try {
		const matches = data.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/i)
		if (!matches) {
			res.status(400).json({ error: '素材库仅支持 PNG、JPG、WEBP 或 GIF 图片' })
			return
		}

		const mime = matches[1].toLowerCase()
		const buffer = Buffer.from(matches[2], 'base64')
		if (buffer.length > 10 * 1024 * 1024) {
			res.status(400).json({ error: '图片不能超过 10MB' })
			return
		}
		const ext = imageExtension(mime)
		const savedName = `mat_${userId}_${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`
		const url = await saveUpload(`materials/${savedName}`, buffer, mime)
		const { rows } = await pool.query(
			'INSERT INTO materials (user_id, filename, url, type, size) VALUES ($1, $2, $3, $4, $5) RETURNING *',
			[userId, filename || savedName, url, 'image', buffer.length]
		)

		res.json({ material: rows[0] })
	} catch (err) {
		console.error('上传素材失败:', err)
		res.status(502).json({ error: objectStorageErrorMessage(err) })
	}
})

router.delete('/materials/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	try {
		const { rows } = await pool.query('SELECT url FROM materials WHERE id = $1 AND user_id = $2', [req.params.id, userId])
		if (!rows[0]) {
			res.status(404).json({ error: '素材不存在或已删除' })
			return
		}
		const isGeneratedImage =
			rows[0].url.startsWith('/api/content/assets/generated/')
			|| rows[0].url.startsWith('/uploads/ai-generated-')
		if (!isGeneratedImage) await deleteUpload(rows[0].url)
		await pool.query('DELETE FROM materials WHERE id = $1 AND user_id = $2', [req.params.id, userId])
		res.json({ message: '已删除' })
	} catch (error) {
		console.error('删除素材失败:', error)
		res.status(502).json({ error: objectStorageErrorMessage(error) })
	}
})

export default router
