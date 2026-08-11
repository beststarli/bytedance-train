import { Router, Request, Response } from 'express'
import { pool } from '../../utils/db'
import { getAgentSteps } from '../../agents/core/agent-store'
import {
	applyRewriteProposal,
	generateRewriteProposals,
	rejectRewriteProposal,
	submitWorkForReview,
} from '../../agents/review-service'
import { auth } from './shared'

const router: Router = Router()

// ==================== Works ====================

router.get('/works', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { rows } = await pool.query(
		`SELECT w.id,
			 CASE WHEN w.review_status IN ('pending_review', 'needs_revision', 'blocked', 'failed', 'draft_changes')
				THEN COALESCE(lv.title, w.title) ELSE w.title END AS title,
			 CASE WHEN w.review_status IN ('pending_review', 'needs_revision', 'blocked', 'failed', 'draft_changes')
				THEN COALESCE(lv.content, w.content) ELSE w.content END AS content,
			 w.status, w.review_status, w.quality_score, w.view_count, w.created_at, w.updated_at,
			 COUNT(*) FILTER (WHERE r.type = 'like')::int AS like_count,
			 COUNT(*) FILTER (WHERE r.type = 'favorite')::int AS favorite_count
		 FROM works w
		 LEFT JOIN work_versions lv ON lv.id = w.latest_version_id
		 LEFT JOIN work_reactions r ON r.work_id = w.id
		 WHERE w.user_id = $1
		 GROUP BY w.id, lv.id
		 ORDER BY w.updated_at DESC`,
		[userId]
	)
	res.json({ works: rows })
})

router.post('/works', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { title, content, status } = req.body
	if (status === 'published') {
		try {
			const submitted = await submitWorkForReview({
				userId,
				title: String(title || '未命名作品'),
				content: String(content || ''),
			})
			res.status(202).json({
				work: { id: submitted.workId, title, content, status: 'draft', review_status: 'pending_review' },
				reviewJob: submitted.reviewJob,
			})
		} catch (error) {
			res.status(400).json({ error: error instanceof Error ? error.message : '提交审核失败' })
		}
		return
	}
	const { rows } = await pool.query(
		'INSERT INTO works (user_id, title, content, status) VALUES ($1, $2, $3, $4) RETURNING *',
		[userId, title || '未命名作品', content || '', 'draft']
	)
	res.json({ work: rows[0] })
})

router.put('/works/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { title, content, status } = req.body
	if (status === 'published') {
		try {
			const submitted = await submitWorkForReview({
				userId,
				workId: String(req.params.id),
				title: String(title || '未命名作品'),
				content: String(content || ''),
			})
			res.status(202).json({
				work: { id: submitted.workId, title, content, status: 'draft', review_status: 'pending_review' },
				reviewJob: submitted.reviewJob,
			})
		} catch (error) {
			res.status(400).json({ error: error instanceof Error ? error.message : '提交审核失败' })
		}
		return
	}
	const { rows: currentRows } = await pool.query(
		'SELECT * FROM works WHERE id = $1 AND user_id = $2',
		[req.params.id, userId],
	)
	const current = currentRows[0]
	if (!current) {
		res.status(404).json({ error: '作品不存在' })
		return
	}
	if (current.status === 'published') {
		const client = await pool.connect()
		try {
			await client.query('BEGIN')
			const { rows: numbers } = await client.query(
				`SELECT COALESCE(MAX(version_number), 0)::int + 1 AS next_version
				 FROM work_versions WHERE work_id = $1`,
				[req.params.id],
			)
			const { rows: versions } = await client.query(
				`INSERT INTO work_versions
				 (work_id, parent_version_id, version_number, title, content, source, status)
				 VALUES ($1, $2, $3, $4, $5, 'user', 'draft') RETURNING *`,
				[
					req.params.id, current.latest_version_id, numbers[0].next_version,
					title ?? current.title, content ?? current.content,
				],
			)
			await client.query(
				`UPDATE works SET latest_version_id = $1, review_status = 'draft_changes', updated_at = NOW()
				 WHERE id = $2`,
				[versions[0].id, req.params.id],
			)
			await client.query('COMMIT')
			res.json({
				work: {
					...current,
					title: versions[0].title,
					content: versions[0].content,
					review_status: 'draft_changes',
					updated_at: new Date().toISOString(),
				},
			})
		} catch (error) {
			await client.query('ROLLBACK')
			throw error
		} finally {
			client.release()
		}
		return
	}
	const { rows } = await pool.query(
		`UPDATE works
		 SET title = COALESCE($1, title),
			 content = COALESCE($2, content),
			 status = COALESCE($3, status),
			 updated_at = NOW(),
			 created_at = CASE WHEN $3 = 'published' THEN NOW() ELSE created_at END
		 WHERE id = $4 AND user_id = $5
		 RETURNING *`,
		[title, content, status, req.params.id, userId]
	)
	res.json({ work: rows[0] || null })
})

router.get('/reviews', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return
	const { rows } = await pool.query(
		`SELECT w.id AS work_id, w.status AS publication_status, w.review_status,
			 w.quality_score, w.updated_at, w.latest_version_id,
			 COALESCE(v.title, w.title) AS title, COALESCE(v.content, w.content) AS content,
			 j.id AS review_job_id, j.status AS job_status, j.decision,
			 j.risk_score, j.quality_score AS review_quality_score, j.summary,
			 j.error, j.created_at AS submitted_at, j.completed_at
		 FROM works w
		 LEFT JOIN work_versions v ON v.id = w.latest_version_id
		 LEFT JOIN LATERAL (
			 SELECT * FROM review_jobs rj WHERE rj.work_id = w.id
			 ORDER BY rj.created_at DESC LIMIT 1
		 ) j ON true
		 WHERE w.user_id = $1
		 ORDER BY COALESCE(j.created_at, w.updated_at) DESC`,
		[userId],
	)
	res.json({ reviews: rows })
})

router.get('/reviews/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return
	const { rows } = await pool.query(
		`SELECT j.*, v.title, v.content, v.version_number, w.review_status, w.status AS publication_status
		 FROM review_jobs j
		 JOIN work_versions v ON v.id = j.work_version_id
		 JOIN works w ON w.id = j.work_id
		 WHERE j.id = $1 AND j.user_id = $2`,
		[req.params.id, userId],
	)
	if (!rows[0]) {
		res.status(404).json({ error: '审核记录不存在' })
		return
	}
	const [findings, proposals, steps] = await Promise.all([
		pool.query(`SELECT * FROM review_findings WHERE review_job_id = $1 ORDER BY created_at ASC`, [req.params.id]),
		pool.query(`SELECT * FROM rewrite_proposals WHERE review_job_id = $1 ORDER BY created_at DESC`, [req.params.id]),
		rows[0].agent_run_id ? getAgentSteps(rows[0].agent_run_id) : Promise.resolve([]),
	])
	res.json({
		review: rows[0], findings: findings.rows, proposals: proposals.rows,
		steps: steps.map((step) => ({
			step_name: step.stepName, status: step.status, error: step.error,
			started_at: step.startedAt, completed_at: step.completedAt,
		})),
	})
})

router.post('/works/:id/submit-review', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return
	try {
		let title = String(req.body?.title || '').trim()
		let content = String(req.body?.content || '').trim()
		if (!title || !content) {
			const { rows } = await pool.query(
				`SELECT COALESCE(v.title, w.title) AS title, COALESCE(v.content, w.content) AS content
				 FROM works w LEFT JOIN work_versions v ON v.id = w.latest_version_id
				 WHERE w.id = $1 AND w.user_id = $2`,
				[req.params.id, userId],
			)
			if (!rows[0]) throw new Error('作品不存在')
			title ||= rows[0].title
			content ||= rows[0].content
		}
		if (!title || !content) throw new Error('标题和正文不能为空')
		const submitted = await submitWorkForReview({
			userId, workId: String(req.params.id), title, content, source: req.body?.source === 'ai' ? 'ai' : 'user',
		})
		res.status(202).json({ reviewJob: submitted.reviewJob, workId: submitted.workId })
	} catch (error) {
		res.status(400).json({ error: error instanceof Error ? error.message : '提交审核失败' })
	}
})

router.post('/review-jobs/:id/rewrite', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return
	try {
		const proposals = await generateRewriteProposals(String(req.params.id), userId)
		res.json({ proposals })
	} catch (error) {
		res.status(400).json({ error: error instanceof Error ? error.message : '生成替代内容失败' })
	}
})

router.post('/rewrite-proposals/:id/apply', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return
	try {
		const result = await applyRewriteProposal(String(req.params.id), userId)
		res.json(result)
	} catch (error) {
		res.status(400).json({ error: error instanceof Error ? error.message : '采用替代内容失败' })
	}
})

router.post('/rewrite-proposals/:id/reject', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return
	try {
		const result = await rejectRewriteProposal(String(req.params.id), userId)
		res.json(result)
	} catch (error) {
		res.status(400).json({ error: error instanceof Error ? error.message : '保留原内容失败' })
	}
})

router.delete('/works/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	await pool.query('DELETE FROM works WHERE id = $1 AND user_id = $2', [req.params.id, userId])
	res.json({ message: '已删除' })
})

export default router
