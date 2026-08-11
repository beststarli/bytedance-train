import { Router, Request, Response } from 'express'
import path from 'path'
import { randomUUID } from 'crypto'
import { pool } from '../../utils/db'
import { chatCompletionStream, generateImage, detectModelType, chatSummary } from '../../utils/ai'
import type { ModelType } from '../../utils/ai'
import { truncateToTokenLimit, buildMessages, countTokens, DEFAULT_TEXT_CONFIG } from '../../utils/context'
import { getUploadByUrl, objectStorageErrorMessage, saveUpload } from '../../utils/objectStorage'
import { createAgentState } from '../../agents/core/run-store'
import { WorkflowRunner } from '../../agents/core/workflow'
import { auth, downloadImage, imageExtension } from './shared'

const router: Router = Router()

function imageMarkdown(urls: string[]) {
	return urls.map((url, index) => `![AI 生成图片${urls.length > 1 ? ` ${index + 1}` : ''}](${url})`).join('\n\n')
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

export default router