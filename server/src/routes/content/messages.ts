import { Router, Request, Response } from 'express'
import { pool } from '../../utils/db'
import { auth } from './shared'

const router: Router = Router()

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
	// 兼容旧版本：部分 AI 消息已保存火山临时链接，但图片后来已导入 RustFS。
	// 即使尚未执行启动迁移，读取历史消息时也优先返回持久化地址。
	const { rows: imageMappings } = await pool.query(
		`SELECT source_url, url
		 FROM materials
		 WHERE user_id = $1 AND type = 'image' AND source_url IS NOT NULL`,
		[userId],
	)
	const messages = rows.map((message) => ({
		...message,
		content: imageMappings.reduce(
			(content, mapping) => content.replaceAll(String(mapping.source_url), String(mapping.url)),
			String(message.content || ''),
		),
	}))
	res.json({ messages })
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

	const { rows: chatRows } = await pool.query(
		'SELECT id FROM chats WHERE id = $1 AND user_id = $2',
		[req.params.id, userId]
	)
	if (!chatRows[0]) {
		res.status(404).json({ error: '聊天不存在' })
		return
	}

	const { rows: msgRows } = await pool.query(
		'INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at',
		[req.params.id, 'user', content]
	)

	await pool.query('UPDATE chats SET updated_at = NOW() WHERE id = $1', [req.params.id])

	res.json({ message: msgRows[0] })
})

export default router