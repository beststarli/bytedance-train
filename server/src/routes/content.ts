import { Router, Request, Response } from 'express'
import path from 'path'
import { randomUUID } from 'crypto'
import { pool } from '../utils/db'
import { verifyToken } from '../utils/jwt'
import { chatCompletionStream, generateImage, detectModelType, chatSummary } from '../utils/ai'
import type { ModelType } from '../utils/ai'
import { executeSkill } from '../skills'
import type { GeneratedPromptTemplate, PromptTemplateCategory, PromptTemplateGeneratorInput } from '../skills'
import { truncateToTokenLimit, buildMessages, countTokens, DEFAULT_TEXT_CONFIG } from '../utils/context'
import { deleteUpload, getUpload, getUploadByUrl, objectStorageErrorMessage, saveUpload } from '../utils/objectStorage'
import {
	applyRewriteProposal,
	generateRewriteProposals,
	rejectRewriteProposal,
	submitWorkForReview,
} from '../agents/review-service'
import { createAgentState } from '../agents/core/run-store'
import { WorkflowRunner } from '../agents/core/workflow'

const router: Router = Router()

function imageMarkdown(urls: string[]) {
	return urls.map((url, index) => `![AI 生成图片${urls.length > 1 ? ` ${index + 1}` : ''}](${url})`).join('\n\n')
}

function imageExtension(contentType: string) {
	if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'jpg'
	if (contentType === 'image/webp') return 'webp'
	if (contentType === 'image/gif') return 'gif'
	return 'png'
}

async function downloadImage(url: string) {
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

async function persistGeneratedImages(urls: string[], userId: string) {
	return Promise.all(urls.map(async (sourceUrl) => {
		const { buffer, contentType } = await downloadImage(sourceUrl)
		const filename = `ai-generated-${userId}-${Date.now()}-${randomUUID().slice(0, 8)}.${imageExtension(contentType)}`
		return saveUpload(`generated/${filename}`, buffer, contentType)
	}))
}

interface ImageAttachment {
	url: string
	filename?: string
}

async function validateImageAttachments(userId: string, attachments: ImageAttachment[]) {
	const unique = Array.from(new Map(attachments.map((item) => [String(item.url || '').trim(), item])).values())
		.filter((item) => item.url)
		.slice(0, 4)
	if (!unique.length) return []

	const { rows: materialRows } = await pool.query(
		'SELECT url FROM materials WHERE user_id = $1 AND type = $2 AND url = ANY($3::text[])',
		[userId, 'image', unique.map((item) => item.url)],
	)
	const materialUrls = new Set(materialRows.map((row) => row.url))
	return unique.filter((item) => {
		if (materialUrls.has(item.url)) return true
		const filename = path.basename(item.url)
		return (
			(item.url.startsWith('/api/content/assets/generated/') || item.url.startsWith('/uploads/'))
			&& filename.includes(`-${userId}-`)
		)
	})
}

async function imageAttachmentsAsDataUrls(attachments: ImageAttachment[]) {
	return Promise.all(attachments.map(async (attachment) => {
		const asset = await getUploadByUrl(attachment.url)
		if (!asset.contentType.startsWith('image/')) throw new Error('引用的素材不是图片')
		if (asset.body.length > 20 * 1024 * 1024) throw new Error('引用图片超过 20MB')
		return `data:${asset.contentType};base64,${asset.body.toString('base64')}`
	}))
}

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

function optionalUserId(req: Request) {
	const header = req.headers.authorization
	if (!header?.startsWith('Bearer ')) return null
	try {
		return verifyToken(header.slice(7)).userId
	} catch {
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

// ==================== AI 生成（SSE 流式，文本/图片通用） ====================

router.post('/chats/:id/generate-stream', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return

	const { content, model_type } = req.body
	const attachments = await validateImageAttachments(userId, Array.isArray(req.body?.attachments) ? req.body.attachments : [])
	if (!content?.trim()) {
		res.status(400).json({ error: '消息不能为空' })
		return
	}

	const { rows: chatRows } = await pool.query(
		'SELECT id, title, summary FROM chats WHERE id = $1 AND user_id = $2',
		[req.params.id, userId]
	)
	if (!chatRows[0]) {
		res.status(404).json({ error: '聊天不存在' })
		return
	}

	const persistedUserContent = `${imageMarkdown(attachments.map((item) => item.url))}${attachments.length ? '\n\n' : ''}${content}`.trim()
	// 存用户消息
	const { rows: userMsg } = await pool.query(
		'INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at',
		[req.params.id, 'user', persistedUserContent]
	)

	// 设置 SSE 响应头
	res.setHeader('Content-Type', 'text/event-stream')
	res.setHeader('Cache-Control', 'no-cache')
	res.setHeader('Connection', 'keep-alive')
	res.setHeader('X-Accel-Buffering', 'no')
	// Disable Nagle to prevent TCP buffering of small SSE chunks
	req.socket?.setNoDelay(true)
	res.flushHeaders()
	const generationController = new AbortController()
	res.on('close', () => {
		if (!res.writableEnded) generationController.abort()
	})

	// Send user message event
	res.write(`data: ${JSON.stringify({ type: 'user_message', message: userMsg[0] })}\n\n`)
	res.write(`data: ${JSON.stringify({ type: 'status', message: '正在理解你的创作需求' })}\n\n`)

	const contentAgentState = await createAgentState(userId, 'content_generation', {
		chatId: String(req.params.id),
		content,
		attachmentCount: attachments.length,
	})
	const contentRunner = new WorkflowRunner(contentAgentState)
	try {
		await contentRunner.start()
		res.write(`data: ${JSON.stringify({ type: 'agent_run', run_id: contentAgentState.runId })}\n\n`)
		const modelType = await contentRunner.step<ModelType>('route_model', { model_type, attachmentCount: attachments.length }, () =>
			attachments.length
				? 'image'
				: model_type && ['text', 'image'].includes(model_type)
					? model_type as ModelType
					: detectModelType(content),
		)

		let fullContent = ''
		res.write(`data: ${JSON.stringify({
			type: 'status',
			model_type: modelType,
			message: modelType === 'image' ? 'AI 正在处理图片' : 'AI 正在思考',
		})}\n\n`)

		await contentRunner.step('generate_content', { modelType }, async () => {
			switch (modelType) {
			case 'image': {
				const imageInputs = await imageAttachmentsAsDataUrls(attachments)
				const temporaryUrls = await generateImage(content, imageInputs, generationController.signal)
				res.write(`data: ${JSON.stringify({ type: 'status', model_type: 'image', message: '正在持久化生成图片' })}\n\n`)
				const urls = await persistGeneratedImages(temporaryUrls, userId)
				fullContent = imageMarkdown(urls) || '图片生成失败'
				res.write(`data: ${JSON.stringify({ type: 'image', content: fullContent, urls })}\n\n`)
				if (urls.length > 0) {
					try {
						const descriptionHeading = '\n\n### 图片描述\n'
						fullContent += descriptionHeading
						res.write(`data: ${JSON.stringify({ type: 'status', model_type: 'text', message: 'AI 正在描述图片' })}\n\n`)
						res.write(`data: ${JSON.stringify({ type: 'chunk', content: descriptionHeading })}\n\n`)

						const descriptionStream = chatCompletionStream([
							{
								role: 'system',
								content: '你是专业的视觉内容编辑。请根据用户的绘图需求，为刚生成的图片撰写一段自然、具体的中文描述。描述主体、动作、构图、色彩、光影和整体氛围，控制在80至150字，不要提及URL、模型、提示词或“根据需求推测”等内容，不要使用标题。',
							},
							{
								role: 'user',
								content: `刚生成图片时使用的创作要求如下：\n${content}`,
							},
							], 'text', generationController.signal)
						for await (const descriptionChunk of descriptionStream) {
							fullContent += descriptionChunk
							res.write(`data: ${JSON.stringify({ type: 'chunk', content: descriptionChunk })}\n\n`)
						}
					} catch (descriptionError) {
						console.error('[Image] 生成图片描述失败：', descriptionError)
						const fallbackDescription = '\n\n图片已根据你的创作要求生成，可直接插入正文或添加到素材库。'
						fullContent += fallbackDescription
						res.write(`data: ${JSON.stringify({ type: 'chunk', content: fallbackDescription })}\n\n`)
					}
				}
				break
			}
			default: {
				const { rows: history } = await pool.query(
					`SELECT role, content FROM messages
					 WHERE chat_id = $1 AND id != $2
					 ORDER BY created_at ASC`,
					[req.params.id, userMsg[0].id]
				)
				const messages = history.map((m: any) => ({
					role: m.role as 'user' | 'assistant',
					content: m.content,
				}))

				const summary = chatRows[0].summary || undefined
				const finalMessages = buildMessages(messages, { role: 'user', content }, { summary })

				const totalTokens = finalMessages.reduce((sum, m) => sum + countTokens(m.content), 0)
				console.log(`[Stream ${req.params.id}] ${finalMessages.length} messages, ~${totalTokens} tokens`)

				const stream = chatCompletionStream(finalMessages, 'text', generationController.signal)
				res.write(`data: ${JSON.stringify({ type: 'status', model_type: 'text', message: 'AI 正在思考' })}\n\n`)

				for await (const chunk of stream) {
					fullContent += chunk
					res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
				}

				// 触发摘要（不阻塞响应）
				const { truncatedCount } = truncateToTokenLimit(messages, DEFAULT_TEXT_CONFIG)
				if (truncatedCount > 2) {
					chatSummary(messages, summary).then((newSummary) => {
						pool.query('UPDATE chats SET summary = $1 WHERE id = $2', [newSummary, req.params.id])
							.catch((err) => console.error('[Summary] save failed:', err))
					})
				}
			}
			}
			return { modelType, outputLength: fullContent.length }
		})

		// 存 AI 消息
		const { rows: aiMsg } = await pool.query(
			'INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at',
			[req.params.id, 'assistant', fullContent]
		)

		// 更新标题
		if (chatRows[0].title === '新对话') {
			const shortTitle = content.length > 30 ? content.slice(0, 30) + '…' : content
			await pool.query('UPDATE chats SET title = $1, updated_at = NOW() WHERE id = $2', [shortTitle, req.params.id])
		} else {
			await pool.query('UPDATE chats SET updated_at = NOW() WHERE id = $1', [req.params.id])
		}

		res.write(`data: ${JSON.stringify({ type: 'done', message: aiMsg[0] })}\n\n`)
		await contentRunner.complete({ messageId: aiMsg[0].id, modelType })
		} catch (err: any) {
			await contentRunner.fail(err)
			if (generationController.signal.aborted) {
				console.info(`[Stream ${req.params.id}] generation aborted by client`)
				return
			}
			console.error('[Stream] Error:', err)
		res.write(`data: ${JSON.stringify({ type: 'error', message: err.message || '生成失败' })}\n\n`)
	} finally {
		res.end()
	}
})

router.post('/ai-attachments', async (req: Request, res: Response) => {
	const userId = auth(req, res)
	if (!userId) return
	const data = String(req.body?.data || '')
	const filename = String(req.body?.filename || 'reference.png')
	const match = data.match(/^data:(image\/[\w.+-]+);base64,(.+)$/)
	if (!match) {
		res.status(400).json({ error: '请选择有效的图片文件' })
		return
	}
	const mime = match[1]!
	const buffer = Buffer.from(match[2]!, 'base64')
	if (buffer.length > 10 * 1024 * 1024) {
		res.status(400).json({ error: '图片不能超过 10MB' })
		return
	}
	try {
		const storedName = `ai-input-${userId}-${Date.now()}-${randomUUID().slice(0, 8)}.${imageExtension(mime)}`
		const url = await saveUpload(`generated/${storedName}`, buffer, mime)
		res.json({ attachment: { url, filename: path.basename(filename), type: 'image' } })
	} catch (error) {
		res.status(502).json({ error: objectStorageErrorMessage(error) })
	}
})

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
		rows[0].agent_run_id
			? pool.query(
				`SELECT step_name, status, error, started_at, completed_at
				 FROM agent_steps WHERE run_id = $1 ORDER BY id ASC`,
				[rows[0].agent_run_id],
			)
			: Promise.resolve({ rows: [] }),
	])
	res.json({ review: rows[0], findings: findings.rows, proposals: proposals.rows, steps: steps.rows })
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
		const savedName = `mat_${userId}_${Date.now()}.${ext}`
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

	let orderBy = 'w.view_count DESC, w.created_at DESC'
	if (sort === 'new') orderBy = 'w.created_at DESC'
	else if (sort === 'likes') orderBy = "COUNT(*) FILTER (WHERE r.type = 'like') DESC, w.created_at DESC"
	else if (sort === 'quality') orderBy = 'w.quality_score DESC NULLS LAST, w.view_count DESC'

	const { rows } = await pool.query(
		`SELECT w.id, w.title, w.content, w.quality_score, w.view_count, w.created_at,
				u.nickname, u.avatar_url,
				COUNT(*) FILTER (WHERE r.type = 'like')::int AS like_count,
				COUNT(*) FILTER (WHERE r.type = 'favorite')::int AS favorite_count,
				COALESCE(BOOL_OR(r.user_id = $3 AND r.type = 'like'), false) AS liked,
				COALESCE(BOOL_OR(r.user_id = $3 AND r.type = 'favorite'), false) AS favorited
		 FROM works w JOIN users u ON w.user_id = u.id
		 LEFT JOIN work_reactions r ON r.work_id = w.id
		 WHERE w.status = 'published'
		 GROUP BY w.id, u.id
		 ORDER BY ${orderBy}
		 LIMIT $1 OFFSET $2`,
		[limit, offset, userId]
	)

	const { rows: countRows } = await pool.query(
		"SELECT COUNT(*) as total FROM works WHERE status = 'published'"
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
