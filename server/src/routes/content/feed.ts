import { Router, Request, Response } from 'express'
import { pool } from '../../utils/db'
import { auth, optionalUserId } from './shared'

const router: Router = Router()

// ==================== Public Feed ====================

router.get('/feed', async (req: Request, res: Response) => {
	const userId = optionalUserId(req)
	const allowedSorts = new Set(['hot', 'new', 'likes', 'quality'])
	const requestedSort = (req.query.sort as string) || 'hot'
	const sort = allowedSorts.has(requestedSort) ? requestedSort : 'hot'
	const parsedLimit = Number.parseInt(req.query.limit as string, 10)
	const parsedOffset = Number.parseInt(req.query.offset as string, 10)
	const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 20, 1), 50)
	const offset = Math.max(Number.isFinite(parsedOffset) ? parsedOffset : 0, 0)

	let orderBy = 'hot_score DESC, created_at DESC'
	if (sort === 'new') orderBy = 'created_at DESC'
	else if (sort === 'likes') orderBy = 'like_count DESC, created_at DESC'
	else if (sort === 'quality') orderBy = 'quality_score DESC NULLS LAST, view_count DESC'

	const { rows } = await pool.query(
		`WITH feed_items AS (
			SELECT w.id, w.title, w.content, w.quality_score, w.view_count, w.created_at,
				u.nickname, u.avatar_url,
				COUNT(*) FILTER (WHERE r.type = 'like')::int AS like_count,
				COUNT(*) FILTER (WHERE r.type = 'favorite')::int AS favorite_count,
				COALESCE(BOOL_OR(r.user_id = $3 AND r.type = 'like'), false) AS liked,
				COALESCE(BOOL_OR(r.user_id = $3 AND r.type = 'favorite'), false) AS favorited
			FROM works w
			JOIN users u ON w.user_id = u.id
			LEFT JOIN work_reactions r ON r.work_id = w.id
			WHERE w.status = 'published'
			GROUP BY w.id, u.id
		), scored_items AS (
			SELECT feed_items.*,
				CASE WHEN COALESCE(quality_score, 0) < 60 THEN 0
				ELSE (
					(
						(
							LN(1 + GREATEST(view_count, 0)) * 0.2
							+ LN(1 + GREATEST(like_count, 0) * 10) * 0.3
							+ LN(1 + GREATEST(favorite_count, 0) * 20) * 0.5
						) * 0.7
						+ (
							((like_count + 2.0) / (GREATEST(view_count, 0) + 100)) * 0.4
							+ ((favorite_count + 1.0) / (GREATEST(view_count, 0) + 100)) * 0.6
						) * 10 * 0.3
					)
					* (1 + ((LEAST(100, GREATEST(60, quality_score)) - 75) / 25) * 0.2)
					* EXP(-GREATEST(0, EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600) / 72)
				) + CASE
					WHEN NOW() - created_at <= INTERVAL '24 hours' THEN (quality_score / 100) * 0.5
					ELSE 0
				END END AS hot_score
			FROM feed_items
		)
		 SELECT *
		 FROM scored_items
		 WHERE ($4::text <> 'hot' OR COALESCE(quality_score, 0) >= 60)
		 ORDER BY ${orderBy}
		 LIMIT $1 OFFSET $2`,
		[limit, offset, userId, sort]
	)

	const { rows: countRows } = await pool.query(
		`SELECT COUNT(*) AS total
		 FROM works
		 WHERE status = 'published'
		   AND ($1::text <> 'hot' OR COALESCE(quality_score, 0) >= 60)`,
		[sort],
	)

	res.json({ works: rows, total: parseInt(countRows[0].total), has_more: offset + limit < parseInt(countRows[0].total) })
})

router.get('/feed/:id', async (req: Request, res: Response) => {
	const userId = optionalUserId(req)
	const { rows } = await pool.query(
		`UPDATE works SET view_count = view_count + 1
		 WHERE id = $1 AND status = 'published'
		 RETURNING id`,
		[req.params.id],
	)
	if (!rows[0]) {
		res.status(404).json({ error: '文章不存在' })
		return
	}
	await pool.query('INSERT INTO work_view_events (work_id) VALUES ($1)', [req.params.id])
	const { rows: articles } = await pool.query(
		`SELECT w.id, w.title, w.content, w.quality_score, w.view_count, w.created_at,
				u.nickname, u.avatar_url,
				COUNT(*) FILTER (WHERE r.type = 'like')::int AS like_count,
				COUNT(*) FILTER (WHERE r.type = 'favorite')::int AS favorite_count,
				COALESCE(BOOL_OR(r.user_id = $2 AND r.type = 'like'), false) AS liked,
				COALESCE(BOOL_OR(r.user_id = $2 AND r.type = 'favorite'), false) AS favorited
		 FROM works w JOIN users u ON w.user_id = u.id
		 LEFT JOIN work_reactions r ON r.work_id = w.id
		 WHERE w.id = $1
		 GROUP BY w.id, u.id`,
		[req.params.id, userId],
	)
	res.json({ work: articles[0] })
})

router.post('/feed/:id/reactions', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return
	const { type } = req.body
	if (!['like', 'favorite'].includes(type)) {
		res.status(400).json({ error: '不支持的互动类型' })
		return
	}
	const deleted = await pool.query(
		'DELETE FROM work_reactions WHERE user_id = $1 AND work_id = $2 AND type = $3 RETURNING type',
		[userId, req.params.id, type],
	)
	let active = false
	if (!deleted.rows[0]) {
		await pool.query(
			'INSERT INTO work_reactions (user_id, work_id, type) VALUES ($1, $2, $3)',
			[userId, req.params.id, type],
		)
		active = true
	}
	res.json({ active })
})

router.get('/notifications', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { rows } = await pool.query(
		`SELECT CONCAT(wr.user_id, ':', wr.work_id, ':', wr.type) AS id,
				wr.type, wr.created_at, w.id AS work_id, w.title AS work_title,
				COALESCE(actor.nickname, '创作者') AS actor_name, actor.avatar_url
		 FROM work_reactions wr
		 JOIN works w ON w.id = wr.work_id
		 JOIN users actor ON actor.id = wr.user_id
		 WHERE w.user_id = $1 AND wr.user_id <> $1
		 ORDER BY wr.created_at DESC
		 LIMIT 12`,
		[userId],
	)
	res.json({ notifications: rows })
})

router.get('/creator-dashboard', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return
	const { rows: stats } = await pool.query(
		`SELECT COUNT(*)::int AS works,
				COALESCE(SUM(view_count), 0)::int AS views,
				COUNT(*) FILTER (WHERE status = 'published')::int AS published,
				COALESCE(ROUND(AVG(quality_score), 1), 0) AS quality,
				(SELECT COUNT(*)::int FROM work_reactions wr JOIN works owned ON owned.id = wr.work_id
				 WHERE owned.user_id = $1 AND wr.type = 'like') AS likes,
				(SELECT COUNT(*)::int FROM work_reactions wr JOIN works owned ON owned.id = wr.work_id
				 WHERE owned.user_id = $1 AND wr.type = 'favorite') AS favorites
		 FROM works WHERE user_id = $1`,
		[userId],
	)
	const { rows: latestWorks } = await pool.query(
		`SELECT w.id, w.title, w.content, w.created_at, w.view_count,
				COUNT(*) FILTER (WHERE wr.type = 'like')::int AS like_count,
				COUNT(*) FILTER (WHERE wr.type = 'favorite')::int AS favorite_count
		 FROM works w
		 LEFT JOIN work_reactions wr ON wr.work_id = w.id
		 WHERE w.user_id = $1 AND w.status = 'published'
		 GROUP BY w.id
		 ORDER BY w.created_at DESC
		 LIMIT 30`,
		[userId],
	)
	const { rows: reactions } = await pool.query(
		`SELECT w.id, w.title, w.content, w.view_count, wr.type, wr.created_at
		 FROM work_reactions wr JOIN works w ON w.id = wr.work_id
		 WHERE wr.user_id = $1 ORDER BY wr.created_at DESC LIMIT 12`,
		[userId],
	)
	res.json({ stats: stats[0], latestWorks, reactions })
})

router.get('/creator-dashboard/latest-performance', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return
	const requestedDays = Number.parseInt(String(req.query.days || '7'), 10)
	const days = requestedDays === 30 ? 30 : 7
	const { rows: works } = await pool.query(
		`SELECT w.id, w.title, w.content, w.created_at, w.view_count,
				COUNT(*) FILTER (WHERE wr.type = 'like')::int AS like_count,
				COUNT(*) FILTER (WHERE wr.type = 'favorite')::int AS favorite_count
		 FROM works w
		 LEFT JOIN work_reactions wr ON wr.work_id = w.id
		 WHERE w.user_id = $1 AND w.status = 'published'
		 GROUP BY w.id
		 ORDER BY w.created_at DESC
		 LIMIT 1`,
		[userId],
	)
	const work = works[0]
	if (!work) {
		res.json({ work: null, points: [] })
		return
	}

	const { rows: viewRows } = await pool.query(
		`SELECT viewed_at FROM work_view_events WHERE work_id = $1 ORDER BY viewed_at ASC`,
		[work.id],
	)
	const { rows: reactionRows } = await pool.query(
		`SELECT type, created_at FROM work_reactions WHERE work_id = $1 ORDER BY created_at ASC`,
		[work.id],
	)
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const start = new Date(today)
	start.setDate(start.getDate() - days + 1)
	const legacyViews = Math.max(0, Number(work.view_count || 0) - viewRows.length)
	const publishedAt = new Date(work.created_at)

	const points = Array.from({ length: days }, (_, index) => {
		const date = new Date(start)
		date.setDate(start.getDate() + index)
		const end = new Date(date)
		end.setDate(end.getDate() + 1)
		const dateLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
		return {
			date: dateLabel,
			views: end <= publishedAt ? 0 : legacyViews + viewRows.filter((event) => new Date(event.viewed_at) < end).length,
			likes: reactionRows.filter((event) => event.type === 'like' && new Date(event.created_at) < end).length,
			favorites: reactionRows.filter((event) => event.type === 'favorite' && new Date(event.created_at) < end).length,
		}
	})
	res.json({ work, points })
})

router.get('/hot-news', async (_req: Request, res: Response) => {
	res.setHeader('Cache-Control', 'no-store')
	const apiKey = process.env.GNEWS_API_KEY
	if (!apiKey) {
		res.json({ articles: [], configured: false })
		return
	}
	const url = new URL('https://gnews.io/api/v4/top-headlines')
	url.searchParams.set('category', 'general')
	url.searchParams.set('lang', 'zh')
	url.searchParams.set('country', 'cn')
	url.searchParams.set('max', '8')
	url.searchParams.set('apikey', apiKey)
	const response = await fetch(url)
	if (!response.ok) throw new Error(`热点新闻服务响应异常：${response.status}`)
	const data = await response.json() as { articles?: unknown[] }
	res.json({ articles: data.articles || [], configured: true })
})

export default router
