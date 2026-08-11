import { Router, Request, Response } from 'express'
import { pool } from '../../utils/db'
import { auth } from './shared'

const router: Router = Router()

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

	const title = String(req.body?.title || '').trim()
	if (!title) {
		res.status(400).json({ error: '会话名称不能为空' })
		return
	}
	const { rows } = await pool.query(
		'UPDATE chats SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING id, title, created_at, updated_at',
		[title.slice(0, 80), req.params.id, userId]
	)
	if (!rows[0]) {
		res.status(404).json({ error: '会话不存在' })
		return
	}
	res.json({ chat: rows[0] })
})

export default router
