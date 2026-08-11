import { Router, Request, Response } from 'express'
import { pool } from '../../utils/db'
import { executeSkill } from '../../skills'
import type { GeneratedPromptTemplate, PromptTemplateCategory, PromptTemplateGeneratorInput } from '../../skills'
import { createAgentState } from '../../agents/core/run-store'
import { WorkflowRunner } from '../../agents/core/workflow'
import { auth, optionalUserId } from './shared'

const router: Router = Router()

// ==================== Prompts CRUD ====================

router.get('/prompts', async (_req: Request, res: Response) => {
	const { rows } = await pool.query(
		'SELECT id, title, description, content, category, icon, sort_order, is_active, created_at FROM prompts ORDER BY sort_order ASC, created_at ASC'
	)
	res.json({ prompts: rows })
})

router.get('/search', async (req: Request, res: Response) => {
	const query = String(req.query.q || '').trim()
	if (query.length < 2) {
		res.json({ works: [], materials: [], prompts: [] })
		return
	}

	const userId = optionalUserId(req)
	const keyword = `%${query.replace(/[%_]/g, '\\$&')}%`
	const [worksResult, promptsResult, materialsResult] = await Promise.all([
		pool.query(
			`SELECT id, title, 'work' AS type
			 FROM works
			 WHERE status = 'published' AND (title ILIKE $1 ESCAPE '\\' OR content ILIKE $1 ESCAPE '\\')
			 ORDER BY created_at DESC LIMIT 5`,
			[keyword],
		),
		pool.query(
			`SELECT id, title, category, 'prompt' AS type
			 FROM prompts
			 WHERE is_active = true AND (title ILIKE $1 ESCAPE '\\' OR description ILIKE $1 ESCAPE '\\' OR content ILIKE $1 ESCAPE '\\')
			 ORDER BY sort_order ASC LIMIT 5`,
			[keyword],
		),
		userId
			? pool.query(
				`SELECT id, filename AS title, type
				 FROM materials
			 WHERE user_id = $2 AND type = 'image' AND filename ILIKE $1 ESCAPE '\\'
				 ORDER BY created_at DESC LIMIT 5`,
				[keyword, userId],
			)
			: Promise.resolve({ rows: [] }),
	])

	res.json({ works: worksResult.rows, prompts: promptsResult.rows, materials: materialsResult.rows })
})

router.post('/prompts', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { title, description, content, category, icon } = req.body
	if (!title || !content) {
		res.status(400).json({ error: '标题和内容不能为空' })
		return
	}
	const normalizedCategory = category === 'video' ? 'image_edit' : category
	if (!['writing', 'image', 'image_edit', 'optimize', 'article', 'general'].includes(normalizedCategory || '')) {
		res.status(400).json({ error: '提示词模版类别无效' })
		return
	}

	const { rows } = await pool.query(
		'INSERT INTO prompts (title, description, content, category, icon) VALUES ($1, $2, $3, $4, $5) RETURNING *',
		[title, description || '', content, normalizedCategory || 'general', icon === 'Video' ? 'WandSparkles' : icon || 'FileText']
	)
	res.json({ prompt: rows[0] })
})

router.post('/prompts/generate', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const input = {
		category: String(req.body?.category || '') as PromptTemplateCategory,
		requirement: String(req.body?.requirement || ''),
	}
	const state = await createAgentState(userId, 'prompt_generation', input)
	const runner = new WorkflowRunner(state)
	try {
		await runner.start()
		const execution = await runner.step(
			'prompt_template_generator_skill',
			input,
			() => executeSkill<PromptTemplateGeneratorInput, GeneratedPromptTemplate>(
				'prompt-template-generator',
				input,
			),
		)
		await runner.complete(execution)
		res.json({ template: execution.output, skill: execution.skill, agentRunId: state.runId })
	} catch (error) {
		await runner.fail(error)
		console.error('[Skill prompt-template-generator] 执行失败：', error)
		const message = error instanceof Error ? error.message : '提示词生成 Skill 执行失败'
		const status = /请选择|至少输入|不能超过/.test(message) ? 400 : 502
		res.status(status).json({ error: message })
	}
})

router.put('/prompts/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { title, description, content, category, icon, sort_order, is_active } = req.body
	const normalizedCategory = category === 'video' ? 'image_edit' : category
	if (normalizedCategory && !['writing', 'image', 'image_edit', 'optimize', 'article', 'general'].includes(normalizedCategory)) {
		res.status(400).json({ error: '提示词模版类别无效' })
		return
	}
	const { rows } = await pool.query(
		'UPDATE prompts SET title = COALESCE($1, title), description = COALESCE($2, description), content = COALESCE($3, content), category = COALESCE($4, category), icon = COALESCE($5, icon), sort_order = COALESCE($6, sort_order), is_active = COALESCE($7, is_active) WHERE id = $8 RETURNING *',
		[title, description, content, normalizedCategory, icon === 'Video' ? 'WandSparkles' : icon, sort_order, is_active, req.params.id]
	)
	res.json({ prompt: rows[0] || null })
})

router.delete('/prompts/:id', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	await pool.query('DELETE FROM prompts WHERE id = $1', [req.params.id])
	res.json({ message: '已删除' })
})

export default router