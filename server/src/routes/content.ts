import { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { pool } from '../utils/db'
import { verifyToken } from '../utils/jwt'
import { chatCompletion, chatCompletionStream, generateImage, generateVideo, detectModelType } from '../utils/ai'
import type { ModelType } from '../utils/ai'

const router: Router = Router()

// 认证中间件
function auth(req: Request, res: Response) {
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

// ==================== Chats ====================

// 获取用户的聊天列表
router.get('/chats', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { rows } = await pool.query(
		'SELECT id, title, created_at, updated_at FROM chats WHERE user_id = $1 ORDER BY updated_at DESC',
		[userId]
	)
	res.json({ chats: rows })
})

// 创建新聊天
router.post('/chats', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { title } = req.body
	const { rows } = await pool.query(
		'INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at, updated_at',
		[userId, title || '新对话']
	)
	res.json({ chat: rows[0] })
})

// 删除聊天
router.delete('/chats/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	await pool.query('DELETE FROM chats WHERE id = $1 AND user_id = $2', [req.params.id, userId])
	res.json({ message: '已删除' })
})

// 更新聊天标题
router.patch('/chats/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { title } = req.body
	const { rows } = await pool.query(
		'UPDATE chats SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING id, title, created_at, updated_at',
		[title, req.params.id, userId]
	)
	res.json({ chat: rows[0] })
})

// ==================== Messages ====================

// 获取聊天的消息列表
router.get('/chats/:id/messages', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { rows } = await pool.query(
		`SELECT m.id, m.role, m.content, m.created_at
		 FROM messages m JOIN chats c ON m.chat_id = c.id
		 WHERE m.chat_id = $1 AND c.user_id = $2
		 ORDER BY m.created_at ASC`,
		[req.params.id, userId]
	)
	res.json({ messages: rows })
})

// 发送消息
router.post('/chats/:id/messages', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { content } = req.body
	if (!content?.trim()) {
		res.status(400).json({ error: '消息不能为空' })
		return
	}

	// 验证聊天属于当前用户
	const { rows: chatRows } = await pool.query(
		'SELECT id FROM chats WHERE id = $1 AND user_id = $2',
		[req.params.id, userId]
	)
	if (!chatRows[0]) {
		res.status(404).json({ error: '聊天不存在' })
		return
	}

	// 存用户消息
	const { rows: msgRows } = await pool.query(
		'INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at',
		[req.params.id, 'user', content]
	)

	// 更新聊天 updated_at
	await pool.query('UPDATE chats SET updated_at = NOW() WHERE id = $1', [req.params.id])

	res.json({ message: msgRows[0] })
})

// 生成 AI 回复（支持文生文 / 文生图 / 文生视频）
router.post('/chats/:id/generate', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { content, model_type } = req.body
	if (!content?.trim()) {
		res.status(400).json({ error: '消息不能为空' })
		return
	}

	// 验证聊天属于当前用户
	const { rows: chatRows } = await pool.query(
		'SELECT id, title FROM chats WHERE id = $1 AND user_id = $2',
		[req.params.id, userId]
	)
	if (!chatRows[0]) {
		res.status(404).json({ error: '聊天不存在' })
		return
	}

	// 存用户消息
	const { rows: userMsg } = await pool.query(
		'INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at',
		[req.params.id, 'user', content]
	)

	// 确定模型类型：前端可指定，否则自动检测
	const modelType: ModelType = model_type && ['text', 'image', 'video'].includes(model_type)
		? model_type
		: detectModelType(content)

	let aiContent: string

	switch (modelType) {
		case 'image': {
			// 文生图
			const urls = await generateImage(content)
			aiContent = urls[0] || '图片生成失败'
			break
		}
		case 'video': {
			// 文生视频（异步任务）
			const { task_id } = await generateVideo(content)
			aiContent = `视频生成任务已提交，任务 ID: ${task_id}`
			break
		}
		default: {
			// 文生文：带历史上下文
			const { rows: history } = await pool.query(
				'SELECT role, content FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
				[req.params.id]
			)
			const messages = history.map((m: any) => ({
				role: m.role as 'user' | 'assistant',
				content: m.content,
			}))
			aiContent = await chatCompletion(messages)
		}
	}

	const { rows: aiMsg } = await pool.query(
		'INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at',
		[req.params.id, 'assistant', aiContent]
	)

	// 如果聊天还是默认标题，用第一条用户消息更新标题
	if (chatRows[0].title === '新对话') {
		const shortTitle = content.length > 30 ? content.slice(0, 30) + '…' : content
		await pool.query('UPDATE chats SET title = $1, updated_at = NOW() WHERE id = $2', [shortTitle, req.params.id])
	} else {
		await pool.query('UPDATE chats SET updated_at = NOW() WHERE id = $1', [req.params.id])
	}

	res.json({ user_message: userMsg[0], ai_message: aiMsg[0], model_type: modelType })
})

// ==================== Prompts CRUD ====================

// 获取 prompt 模板列表
router.get('/prompts', async (_req: Request, res: Response) => {
	const { rows } = await pool.query(
		'SELECT id, title, description, content, category, icon, sort_order, is_active, created_at FROM prompts ORDER BY sort_order ASC, created_at ASC'
	)
	res.json({ prompts: rows })
})

// 创建 prompt
router.post('/prompts', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { title, description, content, category, icon } = req.body
	if (!title || !content) {
		res.status(400).json({ error: '标题和内容不能为空' })
		return
	}

	const { rows } = await pool.query(
		'INSERT INTO prompts (title, description, content, category, icon) VALUES ($1, $2, $3, $4, $5) RETURNING *',
		[title, description || '', content, category || 'general', icon || 'FileText']
	)
	res.json({ prompt: rows[0] })
})

// 更新 prompt
router.put('/prompts/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { title, description, content, category, icon, sort_order, is_active } = req.body
	const { rows } = await pool.query(
		'UPDATE prompts SET title = COALESCE($1, title), description = COALESCE($2, description), content = COALESCE($3, content), category = COALESCE($4, category), icon = COALESCE($5, icon), sort_order = COALESCE($6, sort_order), is_active = COALESCE($7, is_active) WHERE id = $8 RETURNING *',
		[title, description, content, category, icon, sort_order, is_active, req.params.id]
	)
	res.json({ prompt: rows[0] || null })
})

// 删除 prompt
router.delete('/prompts/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	await pool.query('DELETE FROM prompts WHERE id = $1', [req.params.id])
	res.json({ message: '已删除' })
})

// ==================== Works ====================

// 获取用户的作品列表
router.get('/works', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { rows } = await pool.query(
		'SELECT id, title, content, status, quality_score, view_count, created_at, updated_at FROM works WHERE user_id = $1 ORDER BY updated_at DESC',
		[userId]
	)
	res.json({ works: rows })
})

// 创建作品
router.post('/works', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { title, content, status } = req.body
	const { rows } = await pool.query(
		'INSERT INTO works (user_id, title, content, status) VALUES ($1, $2, $3, $4) RETURNING *',
		[userId, title || '未命名作品', content || '', status || 'published']
	)
	res.json({ work: rows[0] })
})

// 更新作品
router.put('/works/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { title, content, status } = req.body
	const { rows } = await pool.query(
		'UPDATE works SET title = COALESCE($1, title), content = COALESCE($2, content), status = COALESCE($3, status), updated_at = NOW() WHERE id = $4 AND user_id = $5 RETURNING *',
		[title, content, status, req.params.id, userId]
	)
	res.json({ work: rows[0] || null })
})

// 删除作品
router.delete('/works/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	await pool.query('DELETE FROM works WHERE id = $1 AND user_id = $2', [req.params.id, userId])
	res.json({ message: '已删除' })
})

// ==================== Materials ====================

// 获取素材列表
router.get('/materials', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { rows } = await pool.query(
		'SELECT id, filename, url, type, size, created_at FROM materials WHERE user_id = $1 ORDER BY created_at DESC',
		[userId]
	)
	res.json({ materials: rows })
})

// 上传素材（base64）
router.post('/materials', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { filename, data, type } = req.body
	if (!data) {
		res.status(400).json({ error: '文件数据不能为空' })
		return
	}

	try {
		const matches = data.match(/^data:(image\/\w+|video\/\w+|audio\/\w+);base64,(.+)$/)
		if (!matches) {
			res.status(400).json({ error: '文件格式不正确' })
			return
		}

		const mime = matches[1]
		const buffer = Buffer.from(matches[2], 'base64')
		const ext = filename?.split('.').pop() || (mime.includes('image') ? 'png' : mime.includes('video') ? 'mp4' : 'mp3')
		const savedName = `mat_${userId}_${Date.now()}.${ext}`
		const uploadDir = path.join(__dirname, '../../uploads')

		if (!fs.existsSync(uploadDir)) {
			fs.mkdirSync(uploadDir, { recursive: true })
		}

		fs.writeFileSync(path.join(uploadDir, savedName), buffer)

		const url = `/uploads/${savedName}`
		const fileType = type || (mime.includes('image') ? 'image' : mime.includes('video') ? 'video' : 'other')

		const { rows } = await pool.query(
			'INSERT INTO materials (user_id, filename, url, type, size) VALUES ($1, $2, $3, $4, $5) RETURNING *',
			[userId, filename || savedName, url, fileType, buffer.length]
		)

		res.json({ material: rows[0] })
	} catch (err) {
		console.error('上传素材失败:', err)
		res.status(500).json({ error: '上传失败' })
	}
})

// 删除素材
router.delete('/materials/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { rows } = await pool.query('SELECT url FROM materials WHERE id = $1 AND user_id = $2', [req.params.id, userId])
	if (rows[0]?.url) {
		const filePath = path.join(__dirname, '../../uploads', path.basename(rows[0].url))
		if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
	}

	await pool.query('DELETE FROM materials WHERE id = $1 AND user_id = $2', [req.params.id, userId])
	res.json({ message: '已删除' })
})

// ==================== Public Feed ====================

// 公开作品列表（首页热点/爆文）
router.get('/feed', async (req: Request, res: Response) => {
	const sort = (req.query.sort as string) || 'hot'
	const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
	const offset = parseInt(req.query.offset as string) || 0

	let orderBy = 'w.view_count DESC, w.created_at DESC'
	if (sort === 'new') orderBy = 'w.created_at DESC'
	else if (sort === 'quality') orderBy = 'w.quality_score DESC NULLS LAST, w.view_count DESC'

	const { rows } = await pool.query(
		`SELECT w.id, w.title, w.content, w.quality_score, w.view_count, w.created_at,
				u.nickname, u.avatar_url
		 FROM works w JOIN users u ON w.user_id = u.id
		 WHERE w.status = 'published'
		 ORDER BY ${orderBy}
		 LIMIT $1 OFFSET $2`,
		[limit, offset]
	)

	const { rows: countRows } = await pool.query(
		"SELECT COUNT(*) as total FROM works WHERE status = 'published'"
	)

	res.json({ works: rows, total: parseInt(countRows[0].total), has_more: offset + limit < parseInt(countRows[0].total) })
})

export default router
