"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
	Plus,
	MessageSquare,
	Trash2,
	Send,
	Mic,
	Sparkles,
	FileText,
	ImageIcon,
	Video,
	ChevronLeft,
	ChevronRight,
	Pencil,
	PenLine,
	WandSparkles,
	ArrowRight,
	FolderOpen,
	Bold,
	Italic,
	Heading1,
	Heading2,
	Quote,
	List,
	Link2,
	Code2,
} from 'lucide-react'
import { useAuthStore } from '@/store/userStore'
import { api, getValidAccessToken } from '@/api/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { emitTaskProgress } from '@/components/taskProgress'
import { resolveAssetUrl } from '@/lib/asset-url'
import { useEditorStore } from '@/store/editorStore'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Chat {
	id: string
	title: string
	created_at: string
	updated_at: string
}

interface Message {
	id: string
	role: 'user' | 'assistant'
	content: string
	created_at: string
}

interface Prompt {
	id: string
	title: string
	description: string
	content: string
	category: string
	icon: string
	model_type?: string
	is_active?: boolean
}

interface Material {
	id: string
	filename: string
	url: string
	type: string
}

const iconMap: Record<string, React.ElementType> = {
	FileText, ImageIcon, Video, Sparkles,
}

const promptCategoryMeta: Record<string, { title: string; description: string; icon: React.ElementType }> = {
	writing: { title: '文章写作', description: '标题、结构与正文创作', icon: FileText },
	article: { title: '文章创作', description: '标题、结构与正文创作', icon: FileText },
	image: { title: '图片生成', description: '配图描述与视觉灵感', icon: ImageIcon },
	video: { title: '视频创作', description: '分镜、口播与短视频脚本', icon: Video },
	optimize: { title: '内容优化', description: '润色、改写与观点整理', icon: Sparkles },
	general: { title: '通用优化', description: '润色、改写与观点整理', icon: Sparkles },
}

function resizeInputTextarea(el: HTMLTextAreaElement) {
	el.style.height = 'auto'
	el.style.height = `${Math.min(el.scrollHeight, 200)}px`
}

function renderInlineMarkdown(text: string) {
	return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
		if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
		if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-muted px-1 py-0.5 text-[.9em]">{part.slice(1, -1)}</code>
		return <React.Fragment key={index}>{part}</React.Fragment>
	})
}

function MarkdownContent({ content }: { content: string }) {
	return <div className="space-y-2">{content.split('\n').map((line, index) => {
		const image = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
		if (image) return <figure key={index} className="my-4 flex justify-center"><img src={image[2]} alt="" className="max-h-[420px] max-w-full rounded-lg object-contain" /></figure>
		if (line.startsWith('### ')) return <h3 key={index} className="pt-2 text-base font-bold">{renderInlineMarkdown(line.slice(4))}</h3>
		if (line.startsWith('## ')) return <h2 key={index} className="pt-2 text-lg font-bold">{renderInlineMarkdown(line.slice(3))}</h2>
		if (line.startsWith('# ')) return <h1 key={index} className="pt-2 text-xl font-bold">{renderInlineMarkdown(line.slice(2))}</h1>
		if (/^[-*]\s/.test(line)) return <div key={index} className="flex gap-2"><span className="text-red-500">•</span><span>{renderInlineMarkdown(line.slice(2))}</span></div>
		const ordered = line.match(/^(\d+)\.\s(.*)$/)
		if (ordered) return <div key={index} className="flex gap-2"><span className="font-semibold text-red-500">{ordered[1]}.</span><span>{renderInlineMarkdown(ordered[2])}</span></div>
		if (!line.trim()) return <div key={index} className="h-1" />
		return <p key={index}>{renderInlineMarkdown(line)}</p>
	})}</div>
}

function escapeHtml(value: string) {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderEditorInline(value: string) {
	return escapeHtml(value)
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>')
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

function markdownToEditorHtml(content: string) {
	if (!content) return ''
	return content.split('\n').map((line) => {
		const image = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
		if (image) {
			return `<figure contenteditable="false" data-image-node="true" data-image-alt="${escapeHtml(image[1])}" data-image-url="${escapeHtml(image[2])}"><img src="${escapeHtml(resolveAssetUrl(image[2]))}" alt=""><button type="button" data-remove-image="true" aria-label="删除图片" title="删除图片">×</button></figure>`
		}
		if (line.startsWith('## ')) return `<h2>${renderEditorInline(line.slice(3))}</h2>`
		if (line.startsWith('# ')) return `<h1>${renderEditorInline(line.slice(2))}</h1>`
		if (line.startsWith('> ')) return `<blockquote>${renderEditorInline(line.slice(2))}</blockquote>`
		if (/^[-*]\s/.test(line)) return `<ul><li>${renderEditorInline(line.slice(2))}</li></ul>`
		return line ? `<p>${renderEditorInline(line)}</p>` : '<p><br></p>'
	}).join('')
}

function editorInlineToMarkdown(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
	if (!(node instanceof HTMLElement)) return ''
	if (node.dataset.imageNode === 'true') {
		return `\n![${node.dataset.imageAlt || ''}](${node.dataset.imageUrl || ''})\n`
	}
	const content = Array.from(node.childNodes).map(editorInlineToMarkdown).join('')
	if (node.tagName === 'STRONG' || node.tagName === 'B') return `**${content}**`
	if (node.tagName === 'EM' || node.tagName === 'I') return `*${content}*`
	if (node.tagName === 'CODE') return `\`${content}\``
	if (node.tagName === 'A') return `[${content}](${node.getAttribute('href') || ''})`
	if (node.tagName === 'BR') return '\n'
	return content
}

function editorHtmlToMarkdown(editor: HTMLDivElement) {
	return Array.from(editor.childNodes).map((node) => {
		if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
		if (!(node instanceof HTMLElement)) return ''
		if (node.dataset.imageNode === 'true') return `![${node.dataset.imageAlt || ''}](${node.dataset.imageUrl || ''})`
		const content = editorInlineToMarkdown(node).replace(/\n+$/, '')
		if (node.tagName === 'H1') return `# ${content}`
		if (node.tagName === 'H2') return `## ${content}`
		if (node.tagName === 'BLOCKQUOTE') return `> ${content}`
		if (node.tagName === 'UL' || node.tagName === 'OL') {
			return Array.from(node.querySelectorAll(':scope > li')).map((item, index) =>
				node.tagName === 'OL' ? `${index + 1}. ${editorInlineToMarkdown(item)}` : `- ${editorInlineToMarkdown(item)}`
			).join('\n')
		}
		return content
	}).join('\n').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function InlineArticleEditor({
	content,
	onChange,
	editorRef,
	fillHeight = false,
}: {
	content: string
	onChange: (content: string) => void
	editorRef: React.MutableRefObject<HTMLDivElement | null>
	fillHeight?: boolean
}) {
	const lastContentRef = useRef(content)

	useEffect(() => {
		const editor = editorRef.current
		if (!editor || content === lastContentRef.current) return
		editor.innerHTML = markdownToEditorHtml(content)
		editor.dataset.empty = content.trim() ? 'false' : 'true'
		lastContentRef.current = content
	}, [content, editorRef])

	const syncContent = useCallback(() => {
		if (!editorRef.current) return
		const nextContent = editorHtmlToMarkdown(editorRef.current)
		editorRef.current.dataset.empty = nextContent ? 'false' : 'true'
		lastContentRef.current = nextContent
		onChange(nextContent)
	}, [editorRef, onChange])

	const insertDroppedImage = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault()
		const raw = event.dataTransfer.getData('application/x-creator-material')
		if (!raw || !editorRef.current) return
		try {
			const material = JSON.parse(raw) as Material
			if (material.type !== 'image') return
			const holder = document.createElement('div')
			holder.innerHTML = markdownToEditorHtml(`![${material.filename}](${material.url})`)
			const imageNode = holder.firstElementChild
			if (!imageNode) return
			const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
			const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY) || window.getSelection()?.getRangeAt(0)
			if (range && editorRef.current.contains(range.commonAncestorContainer)) {
				range.insertNode(imageNode)
			} else {
				editorRef.current.append(imageNode)
			}
			syncContent()
		} catch {
			// 忽略非素材拖拽数据
		}
	}

	return (
		<div
			ref={(node) => {
				editorRef.current = node
				if (node && !node.innerHTML) {
					node.innerHTML = markdownToEditorHtml(content)
					node.dataset.empty = content.trim() ? 'false' : 'true'
				}
			}}
			contentEditable
			suppressContentEditableWarning
			role="textbox"
			aria-multiline="true"
			data-placeholder="从这里开始写作，也可以将素材拖入正文…"
			data-empty={content.trim() ? 'false' : 'true'}
			className={cn(
				"article-rich-editor px-4 pb-4 text-justify text-sm leading-7 outline-none",
				fillHeight
					? "scrollBar-hidden min-h-0 flex-1 overflow-y-auto"
					: "min-h-[420px]",
			)}
			onInput={syncContent}
			onClick={(event) => {
				const target = event.target as HTMLElement
				if (!target.closest('[data-remove-image="true"]')) return
				target.closest('[data-image-node="true"]')?.remove()
				syncContent()
			}}
			onDragOver={(event) => {
				event.preventDefault()
				event.dataTransfer.dropEffect = 'copy'
			}}
			onDrop={insertDroppedImage}
		/>
	)
}

function MaterialShelf({ materials, onInsert }: { materials: Material[]; onInsert: (material: Material) => void }) {
	return (
		<section className="shrink-0 bg-white px-4 py-3">
			<div className="mb-2 flex items-center justify-between">
				<div className="flex items-center gap-2 text-xs font-semibold"><FolderOpen className="h-3.5 w-3.5 text-red-500" />素材库</div>
				<span className="text-[10px] text-muted-foreground">拖拽图片到右侧正文，点击也可快速插入</span>
			</div>
			<div className="flex min-h-20 gap-3 overflow-x-auto pb-1">
				{materials.length ? materials.map((material) => (
					<button
						key={material.id}
						type="button"
						onClick={() => onInsert(material)}
						disabled={material.type !== 'image'}
						title={material.type === 'image' ? `插入 ${material.filename}` : '视频素材暂不支持嵌入正文'}
						draggable={material.type === 'image'}
						onDragStart={(event) => {
							event.dataTransfer.setData('application/x-creator-material', JSON.stringify(material))
							event.dataTransfer.effectAllowed = 'copy'
						}}
						className="group relative h-20 w-28 shrink-0 overflow-hidden rounded-md border bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{material.type === 'image'
							? <img src={material.url} alt={material.filename} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
							: <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">视频素材</span>}
					</button>
				)) : <div className="flex h-20 items-center text-xs text-muted-foreground">素材库暂无内容，可前往侧栏“素材库”上传。</div>}
			</div>
		</section>
	)
}

interface CreatePageProps {
	initialMode?: 'manual' | 'ai'
	onNavigate?: (menu: string) => void
}

export default function CreatePage({ onNavigate }: CreatePageProps) {
	const user = useAuthStore((s) => s.user)
	const [chats, setChats] = useState<Chat[]>([])
	const [activeChatId, setActiveChatId] = useState<string | null>(null)
	const [messages, setMessages] = useState<Message[]>([])
	const [prompts, setPrompts] = useState<Prompt[]>([])
	const [materials, setMaterials] = useState<Material[]>([])
	const [inputValue, setInputValue] = useState('')
	const [modelType, setModelType] = useState<string | undefined>(undefined)
	const [loadingChats, setLoadingChats] = useState(true)
	const [sending, setSending] = useState(false)
	const [thinkingStage, setThinkingStage] = useState("")
	const [creationMode, setCreationMode] = useState<'manual' | 'ai' | null>('ai')
	const { id: editingWorkId, title: draftTitle, content: draftContent, setTitle: setDraftTitle, setContent: setDraftContent, markSaved } = useEditorStore()
	const [publishing, setPublishing] = useState(false)
	const [deleteChatTarget, setDeleteChatTarget] = useState<Chat | null>(null)
	const [selectedPromptCategory, setSelectedPromptCategory] = useState<string | null>(null)
	const messagesEndRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const draftEditorRef = useRef<HTMLDivElement>(null)
	const streamingChatIdRef = useRef<string | null>(null)
	const promptCategories = useMemo(() => {
		const categoryIds = [...new Set(prompts.filter((prompt) => prompt.is_active !== false).map((prompt) => prompt.category))]
		return categoryIds.map((id) => ({
			id,
			...(promptCategoryMeta[id] || { title: id, description: '自定义提示词类别', icon: Sparkles }),
		}))
	}, [prompts])

	// 加载聊天列表 + prompt 模板
	useEffect(() => {
		if (!user) return
		Promise.all([
			api<{ chats: Chat[] }>('/api/content/chats'),
			api<{ prompts: Prompt[] }>('/api/content/prompts'),
			api<{ materials: Material[] }>('/api/content/materials'),
		]).then(([chatData, promptData, materialData]) => {
			setChats(chatData.chats)
			setPrompts(promptData.prompts)
			setMaterials(materialData.materials)
		}).finally(() => setLoadingChats(false))
	}, [user])

	// 切换聊天时加载消息
	useEffect(() => {
		if (!activeChatId) {
			setMessages([])
			return
		}
		// 新建会话后立即发起流式请求时，不再用并发的空消息请求覆盖临时消息与流式占位。
		if (streamingChatIdRef.current === activeChatId) return
		let cancelled = false
		api<{ messages: Message[] }>(`/api/content/chats/${activeChatId}/messages`)
			.then((data) => {
				if (!cancelled) setMessages(data.messages)
			})
		return () => {
			cancelled = true
		}
	}, [activeChatId])

	// 自动滚动到底部
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [messages])

	// 新建聊天
	const handleNewChat = useCallback(async () => {
		const data = await api<{ chat: Chat }>('/api/content/chats', {
			method: 'POST',
			body: JSON.stringify({ title: '新对话' }),
		})
		setChats((prev) => [data.chat, ...prev])
		setActiveChatId(data.chat.id)
		setMessages([])
	}, [])

	// 删除聊天
	const handleDeleteChat = useCallback(async () => {
		if (!deleteChatTarget) return
		await api(`/api/content/chats/${deleteChatTarget.id}`, { method: 'DELETE' })
		setChats((prev) => prev.filter((c) => c.id !== deleteChatTarget.id))
		if (activeChatId === deleteChatTarget.id) {
			setActiveChatId(null)
			setMessages([])
		}
		setDeleteChatTarget(null)
	}, [activeChatId, deleteChatTarget])

	const requestCounter = useRef(0)

	// ===== SSE 流式发送消息（文生文 / 图 / 视频通用） =====
	const sendStreamingMessage = useCallback(async (chatId: string, content: string): Promise<void> => {
		if (sending || !content.trim()) return

		const trimmedContent = content.trim()
		setInputValue('')
		setSending(true)
		setThinkingStage('正在理解你的创作需求')
		streamingChatIdRef.current = chatId

		const requestId = ++requestCounter.current

		// 1. 临时用户消息
		const tempId = 'temp-' + Date.now()
		const tempMsg: Message = {
			id: tempId,
			role: 'user',
			content: trimmedContent,
			created_at: new Date().toISOString(),
		}
		setMessages((prev) => [...prev, tempMsg])

		// 2. AI 占位消息
		const aiId = 'ai-' + Date.now()
		setMessages((prev) => [...prev, {
			id: aiId,
			role: 'assistant',
			content: '',
			created_at: new Date().toISOString(),
		}])

		try {
			const token = await getValidAccessToken()
			const response = await fetch(`/api/content/chats/${chatId}/generate-stream`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify({ content: trimmedContent, model_type: modelType }),
			})

			if (!response.ok) throw new Error('请求失败')

			const reader = response.body!.getReader()
			const decoder = new TextDecoder()
			let buffer = ''
			let accumulatedContent = ''
			let finalMessage: Message | null = null

			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })

				// 解析 SSE：data: {...}\n\n
				const lines = buffer.split('\n')
				buffer = lines.pop() || ''

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue
					try {
						const data = JSON.parse(line.slice(6))

						switch (data.type) {
							case 'status':
								setThinkingStage(data.message)
								break
							case 'user_message':
								// 用服务端返回的消息替换临时消息
								setMessages((prev) =>
									prev.map((m) => (m.id === tempId ? data.message : m))
								)
								break

							case 'chunk':
								setThinkingStage('正在流式生成内容')
								accumulatedContent += data.content
								// 渐进式更新 AI 消息内容
								setMessages((prev) =>
									prev.map((m) =>
										m.id === aiId ? { ...m, content: accumulatedContent } : m
									)
								)
								break

							case 'done':
								finalMessage = data.message
								break

							case 'error':
								throw new Error(data.message)
						}
					} catch (e) {
						if (e instanceof SyntaxError) continue // 跳过无效 JSON
						throw e
					}
				}
			}

			// 如果用户在此期间切换了聊天，丢弃本次结果
			if (requestId !== requestCounter.current) return

			// 用服务端持久化的消息替换占位
			if (finalMessage) {
				setMessages((prev) =>
					prev.map((m) => (m.id === aiId ? finalMessage! : m))
				)
			} else if (!accumulatedContent) {
				setMessages((prev) => prev.filter((m) => m.id !== aiId))
			}

			setModelType(undefined)
			setThinkingStage('')
			streamingChatIdRef.current = null
			// 刷新聊天列表（标题可能已更新）
			const chatData = await api<{ chats: Chat[] }>('/api/content/chats')
			setChats(chatData.chats)
		} catch {
			// 保留用户输入，并将 AI 占位改为可见的失败提示
			setMessages((prev) =>
				prev.map((m) =>
					m.id === aiId
						? { ...m, content: '生成失败，请稍后重试。' }
						: m
				)
			)
		} finally {
			setSending(false)
			setThinkingStage('')
			streamingChatIdRef.current = null
		}
	}, [sending, modelType])

	// 发送消息（已有聊天）
	const handleSend = useCallback(async () => {
		if (!inputValue.trim() || !activeChatId || sending) return
		await sendStreamingMessage(activeChatId, inputValue)
	}, [inputValue, activeChatId, sending, sendStreamingMessage])

	// 新建聊天并发送消息
	const handleCreateAndSend = useCallback(async () => {
		if (!inputValue.trim() || sending) return
		const content = inputValue.trim()

		try {
			// 先创建聊天
			const { chat } = await api<{ chat: Chat }>('/api/content/chats', {
				method: 'POST',
				body: JSON.stringify({ title: '新对话' }),
			})
			setChats((prev) => [chat, ...prev])
			streamingChatIdRef.current = chat.id
			setActiveChatId(chat.id)

			// 再流式发送
			await sendStreamingMessage(chat.id, content)
		} catch (err: any) {
			// 创建聊天失败不需要额外处理
		}
	}, [inputValue, sending, sendStreamingMessage])

	const handlePromptClick = useCallback((prompt: Prompt) => {
		setInputValue((current) => `${current}${current.trim() ? '\n\n' : ''}${prompt.content}`)
		setModelType(prompt.category === 'image' ? 'image' : prompt.category === 'video' ? 'video' : undefined)
		setSelectedPromptCategory(null)
		requestAnimationFrame(() => {
			const input = inputRef.current
			if (!input) return
			input.focus()
			resizeInputTextarea(input)
		})
	}, [])

	const isLoggedIn = !!user

	useEffect(() => {
		requestAnimationFrame(() => {
			const input = inputRef.current
			if (input) resizeInputTextarea(input)
		})
	}, [inputValue, isLoggedIn, creationMode, activeChatId])

	const insertMaterial = useCallback((material: Material) => {
		if (material.type !== 'image') return
		const markdown = `![${material.filename}](${material.url})`
		const editor = draftEditorRef.current
		const selection = window.getSelection()
		if (editor && selection?.rangeCount) {
			const range = selection.getRangeAt(0)
			if (editor.contains(range.commonAncestorContainer)) {
				const holder = document.createElement('div')
				holder.innerHTML = markdownToEditorHtml(markdown)
				const imageNode = holder.firstElementChild
				if (imageNode) {
					range.deleteContents()
					range.insertNode(imageNode)
					range.setStartAfter(imageNode)
					range.collapse(true)
					selection.removeAllRanges()
					selection.addRange(range)
					editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
					return
				}
			}
		}
		setDraftContent(`${draftContent}${draftContent.trim() ? '\n\n' : ''}${markdown}\n`)
	}, [draftContent, setDraftContent])

	const insertFormatting = useCallback((before: string, after = '', placeholder = '文本') => {
		const editor = draftEditorRef.current
		if (!editor) return
		editor.focus()
		const selection = window.getSelection()
		const hasSelection = !!selection && !selection.isCollapsed && editor.contains(selection.anchorNode)

		if (before === '# ') document.execCommand('formatBlock', false, 'h1')
		else if (before === '## ') document.execCommand('formatBlock', false, 'h2')
		else if (before === '**') document.execCommand('bold')
		else if (before === '*') document.execCommand('italic')
		else if (before === '> ') document.execCommand('formatBlock', false, 'blockquote')
		else if (before === '- ') document.execCommand('insertUnorderedList')
		else if (before === '[') {
			if (hasSelection) document.execCommand('createLink', false, 'https://')
			else document.execCommand('insertHTML', false, `<a href="https://">${escapeHtml(placeholder)}</a>`)
		} else if (before === '`') {
			if (hasSelection && selection) {
				const selected = selection.toString()
				document.execCommand('insertHTML', false, `<code>${escapeHtml(selected)}</code>`)
			} else document.execCommand('insertHTML', false, `<code>${escapeHtml(placeholder)}</code>`)
		} else {
			document.execCommand('insertText', false, `${before}${placeholder}${after}`)
		}
		editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
	}, [])

	const handlePublish = async (status: 'draft' | 'published') => {
		if (!draftTitle.trim() || !draftContent.trim()) return
		setPublishing(true)
		emitTaskProgress({ title: status === 'published' ? '正在发布文章' : '正在保存草稿', status: 'running', message: '正在同步内容与作品数据' })
		try {
			const data = await api<{ work: { id: string } }>(editingWorkId ? `/api/content/works/${editingWorkId}` : '/api/content/works', {
				method: editingWorkId ? 'PUT' : 'POST',
				body: JSON.stringify({ title: draftTitle.trim(), content: draftContent.trim(), status }),
			})
			markSaved(data.work.id)
			emitTaskProgress({ title: status === 'published' ? '文章发布成功' : '草稿保存成功', status: 'success', message: '内容已同步' })
			if (status === 'published') onNavigate?.('dashboard')
		} catch (error) {
			emitTaskProgress({ title: '操作失败', status: 'error', message: error instanceof Error ? error.message : '请稍后重试' })
		} finally {
			setPublishing(false)
		}
	}

	if (!creationMode) {
		return (
			<div className="enter-workspace scrollBar-hidden flex-1 overflow-y-auto px-4 py-8 sm:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="mb-8">
						<div className="workspace-label mb-2">Creation workflow</div>
						<h1 className="text-2xl font-bold tracking-tight">选择你的创作方式</h1>
						<p className="mt-2 text-sm text-muted-foreground">从空白稿开始完整表达，或让 AI 帮你快速完成第一版。</p>
					</div>
					<div className="grid gap-5 md:grid-cols-2">
						<button type="button" onClick={() => setCreationMode('manual')} className="focus-red group min-h-64 rounded-lg border bg-card p-7 text-left transition-all hover:border-red-200 hover:shadow-sm">
							<span className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-50 text-red-500"><PenLine className="h-5 w-5" /></span>
							<h2 className="mt-10 text-xl font-bold">内容写作台</h2>
							<p className="mt-2 text-sm leading-6 text-muted-foreground">适合已有明确思路的创作者。专注编写标题和正文，完成后直接保存草稿或发布。</p>
							<span className="mt-8 flex items-center gap-1 text-sm font-semibold text-red-500">开始写作 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
						</button>
						<button type="button" onClick={() => setCreationMode('ai')} className="focus-red group min-h-64 rounded-lg border bg-[#242632] p-7 text-left text-white transition-all hover:-translate-y-0.5 hover:shadow-md">
							<span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white"><WandSparkles className="h-5 w-5" /></span>
							<h2 className="mt-10 text-xl font-bold">AI 协作台</h2>
							<p className="mt-2 text-sm leading-6 text-white/60">适合从选题或一句想法起步。通过连续对话生成、修改并打磨文章初稿。</p>
							<span className="mt-8 flex items-center gap-1 text-sm font-semibold text-white">与 AI 共创 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
						</button>
					</div>
				</div>
			</div>
		)
	}

	if (creationMode === 'manual') {
		return (
			<div className="enter-workspace scrollBar-hidden flex-1 overflow-y-auto px-4 py-6 sm:px-8">
				<div className="mx-auto max-w-4xl">
					<div className="mb-5 flex items-center justify-between gap-4">
						<div><button type="button" onClick={() => setCreationMode(null)} className="text-xs text-muted-foreground hover:text-red-500">← 返回创作方式</button><h1 className="mt-2 text-xl font-bold">内容写作台</h1></div>
						<div className="flex gap-2"><Button variant="outline" disabled={publishing} onClick={() => void handlePublish('draft')}>保存草稿</Button><Button disabled={publishing || !draftTitle.trim() || !draftContent.trim()} onClick={() => void handlePublish('published')} className="bg-red-500 text-white hover:bg-red-600">发布文章</Button></div>
					</div>
					<div className="workspace-card overflow-hidden">
						<input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="输入文章标题" className="w-full border-b bg-transparent px-7 py-6 text-2xl font-bold outline-none placeholder:text-muted-foreground/40" />
						<InlineArticleEditor
							content={draftContent}
							onChange={setDraftContent}
							editorRef={draftEditorRef}
						/>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="enter-workspace relative flex h-full min-h-0 w-full flex-1 gap-3 overflow-hidden bg-[#f7f8fa] p-3">
			<section className="workspace-card order-2 hidden w-[42%] min-w-[420px] flex-col overflow-hidden bg-background rounded-lg shadow-sm lg:flex">
				<div className="shrink-0 border-b px-5 pt-3 pb-1">
					<div className="flex items-center justify-between gap-3">
						<div><div className="text-sm font-bold">内容写作台</div><div className="mt-1 text-[10px] text-muted-foreground">内容会在发布前保留在当前工作区</div></div>
						<div className="flex gap-2"><Button variant="outline" size="sm" disabled={publishing || !draftTitle.trim() || !draftContent.trim()} onClick={() => void handlePublish('draft')}>保存草稿</Button><Button size="sm" disabled={publishing || !draftTitle.trim() || !draftContent.trim()} onClick={() => void handlePublish('published')} className="bg-red-500 text-white hover:bg-red-600">发布文章</Button></div>
					</div>
					<div className=" flex flex-wrap items-center gap-1">
						{[
							{ label: "一级标题", icon: Heading1, action: () => insertFormatting("# ", "", "一级标题") },
							{ label: "二级标题", icon: Heading2, action: () => insertFormatting("## ", "", "二级标题") },
							{ label: "加粗", icon: Bold, action: () => insertFormatting("**", "**", "加粗文本") },
							{ label: "斜体", icon: Italic, action: () => insertFormatting("*", "*", "斜体文本") },
							{ label: "引用", icon: Quote, action: () => insertFormatting("> ", "", "引用内容") },
							{ label: "无序列表", icon: List, action: () => insertFormatting("- ", "", "列表项") },
							{ label: "链接", icon: Link2, action: () => insertFormatting("[", "](https://)", "链接文字") },
							{ label: "行内代码", icon: Code2, action: () => insertFormatting("`", "`", "代码") },
						].map((tool) => <button key={tool.label} type="button" title={tool.label} aria-label={tool.label} onMouseDown={(event) => event.preventDefault()} onClick={tool.action} className="focus-red flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500"><tool.icon className="h-4 w-4" /></button>)}
						<span className="ml-auto text-[10px] text-muted-foreground">可将下方素材拖入正文</span>
					</div>
				</div>
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<input
						value={draftTitle}
						onChange={(event) => setDraftTitle(event.target.value)}
						placeholder="输入文章标题"
						className="h-14 w-full shrink-0 bg-transparent px-4 text-xl font-bold outline-none placeholder:text-muted-foreground/40"
					/>
					<InlineArticleEditor
						content={draftContent}
						onChange={setDraftContent}
						editorRef={draftEditorRef}
						fillHeight
					/>
				</div>
			</section>
			<div className="relative flex min-w-0 flex-1 flex-col gap-3">
				<div className="workspace-card relative flex min-h-0 flex-1 overflow-hidden bg-background rounded-lg shadow-sm">
					{/* 侧边栏 */}
					<aside
						className={cn(
							'hidden flex-col border-r bg-white transition-all duration-200 shrink-0 md:flex',
							'w-56'
						)}
					>
						<div className="px-4 pt-4.5 pb-1">
							<Button
								onClick={handleNewChat}
								className="cursor-pointer w-full h-10 gap-2 rounded-lg bg-red-50/50 hover:bg-red-50 text-black border-2 border-red-500/75"

							>
								<Pencil className="w-4 h-4" />
								新对话
							</Button>
						</div>

						<nav className="scrollBar-hidden flex-1 overflow-y-auto px-2 pt-1 space-y-0.5">
							{loadingChats ? (
								<div className="text-center text-sm text-muted-foreground py-8">加载中...</div>
							) : chats.length === 0 ? (
								<div className="text-center text-sm text-muted-foreground py-8">暂无历史记录</div>
							) : (
								chats.map((chat) => (
									<div
										key={chat.id}
										onClick={() => setActiveChatId(chat.id)}
										onKeyDown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault()
												setActiveChatId(chat.id)
											}
										}}
										role="button"
										tabIndex={0}
										className={cn(
											'focus-red w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-colors group',
											activeChatId === chat.id
												? 'bg-red-50 text-red-600 font-medium'
												: 'hover:bg-muted text-muted-foreground hover:text-foreground'
										)}
									>
										<MessageSquare className="w-4 h-4 shrink-0" />
										<span className="flex-1 truncate">{chat.title}</span>
										<button
											type="button"
											onClick={(event) => {
												event.stopPropagation()
												setDeleteChatTarget(chat)
											}}
											className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
										>
											<Trash2 className="w-3.5 h-3.5" />
										</button>
									</div>
								))
							)}
						</nav>
					</aside>

					{/* 主内容区 */}
					<main className="flex-1 flex flex-col relative min-w-0 ">
						{isLoggedIn && activeChatId ? (
							/* 聊天视图 */
							<div className="flex-1 flex flex-col min-h-0">
								<div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
									<div>
										<div className="text-sm font-semibold">{chats.find((chat) => chat.id === activeChatId)?.title || '未命名创作'}</div>
										<div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
											<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 已保存对话
										</div>
									</div>
									<div className="flex items-center gap-2">
										<span className="hidden rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-medium text-emerald-700 sm:inline">安全检查正常</span>
									</div>
								</div>
								{/* 消息列表 */}
								<div className="scrollBar-hidden flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7">
									<div className="max-w-4xl mx-auto space-y-5">
										{messages.length === 0 && (
											<div className="text-center text-muted-foreground py-16">
												<p className="text-lg">开始你的创作</p>
												<p className="text-sm mt-1">在下方输入你的需求，AI 将为你生成内容</p>
											</div>
										)}
										{messages.map((msg) => (
											<div
												key={msg.id}
												className={cn(
													'flex gap-3',
													msg.role === 'user' ? 'justify-end' : 'justify-start'
												)}
											>
												{msg.role === 'assistant' && (
													<div className="w-9 h-9 rounded-lg bg-[#242632] flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">
														AI
													</div>
												)}
												<div
													className={cn(
														'max-w-[75%] rounded-xl px-4 py-3.5 text-sm leading-6 whitespace-pre-wrap border',
														msg.role === 'user'
															? 'bg-red-500 border-red-500 text-white rounded-br-md'
															: 'bg-background text-foreground rounded-bl-md shadow-sm'
													)}
												>
													{msg.role === 'assistant' && !msg.content && sending ? (
														<div className="flex h-6 items-center gap-2 text-xs text-muted-foreground" aria-label={thinkingStage || "AI 正在生成"}>
															<span className="flex items-center gap-1">
																<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-red-400" style={{ animationDelay: '0ms' }} />
																<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-red-400" style={{ animationDelay: '150ms' }} />
																<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-red-400" style={{ animationDelay: '300ms' }} />
															</span>
															<span>{thinkingStage || "正在准备回答"}</span>
														</div>
													) : (() => {
														const isImage = msg.role === 'assistant' && /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(msg.content)
														return isImage ? (
															<img src={msg.content} alt="生成的图片" className="max-w-full rounded-lg" />
														) : (
															msg.role === 'assistant' ? <div><MarkdownContent content={msg.content} />{sending && msg.id.startsWith('ai-') && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-red-500 align-middle" aria-hidden="true" />}</div> : msg.content
														)
													})()}
												</div>
												{msg.role === 'user' && (
													<div className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-red-400 to-red-600 text-xs font-bold text-white">
														{user?.nickname?.charAt(0) || user?.phone?.slice(-1) || '?'}
														{user?.avatar_url && <img src={resolveAssetUrl(user.avatar_url)} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} />}
													</div>
												)}
											</div>
										))}
										<div ref={messagesEndRef} />
									</div>
								</div>

								{/* 底部输入 */}
								<div className="border-t bg-background px-2 py-1 ">
									<div className="max-w-4xl mx-auto">
										<div className="relative min-h-16 rounded-lg border bg-background px-4 py-3 pr-20 shadow-[0_5px_18px_rgba(30,36,55,.05)] transition-all focus-within:border-red-300 focus-within:ring-4 focus-within:ring-red-500/5">
											<textarea
												ref={inputRef}
												value={inputValue}
												onChange={(e) => setInputValue(e.target.value)}
												placeholder="描述你想创作的内容..."
												className="scrollBar-hidden block min-h-9 max-h-[200px] w-full resize-none overflow-y-auto border-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
												rows={1}
												onKeyDown={(e) => {
													if (e.key === 'Enter' && !e.shiftKey) {
														e.preventDefault()
														handleSend()
													}
													}}
													onInput={(e) => {
														resizeInputTextarea(e.currentTarget)
													}}
												/>
											<div className="absolute bottom-3 right-3 flex items-center gap-1">
												<Button variant="ghost" size="icon" className="hidden h-8 w-8 text-muted-foreground sm:inline-flex">
													<Mic className="w-4 h-4" />
												</Button>
												<Button
													size="icon"
													onClick={() => handleSend()}
													disabled={!inputValue.trim() || sending}
													className={cn(
														'w-8 h-8 rounded-full transition-colors',
														inputValue.trim() && !sending
															? 'bg-red-500 hover:bg-red-600 text-white'
															: 'bg-muted-foreground/20 text-muted-foreground cursor-not-allowed'
													)}
												>
													<Send className="w-3.5 h-3.5" />
												</Button>
											</div>
										</div>
									</div>
								</div>
							</div>
						) : (
							/* 空状态 - 居中输入 + Prompt 卡片 */
							<div className="scrollBar-hidden flex-1 overflow-y-auto px-8 py-4 ">
								<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6">
									<div>
										<div className="workspace-label mb-3">AI creation studio</div>
										<h1 className="mb-2 text-2xl font-bold tracking-[-0.04em] text-foreground sm:text-[32px]">
											把一个想法，变成作品。
										</h1>
										<p className="text-muted-foreground text-sm">
											描述主题、受众和表达方式，AI 会保留完整创作上下文。
										</p>
									</div>

									{/* 主输入框 */}
									<div className="workspace-card order-2 mt-auto w-full">
										<div className="relative min-h-16 rounded-lg border bg-white px-4 py-1 pr-16 transition-all focus-within:border-red-300 focus-within:ring-4 focus-within:ring-red-500/5">
											<textarea
												ref={inputRef}
												value={inputValue}
												onChange={(e) => setInputValue(e.target.value)}
												placeholder={isLoggedIn ? "例如：为刚入职场的年轻人写一篇关于 AI 工作流的文章，语气真诚、有具体案例…" : "请先登录后再开始创作"}
												disabled={!isLoggedIn}
												className="scrollBar-hidden block min-h-9 max-h-[200px] w-full resize-none overflow-y-auto border-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
												rows={1}
												onKeyDown={(e) => {
													if (e.key === 'Enter' && !e.shiftKey) {
														e.preventDefault()
														if (activeChatId) {
															handleSend()
														} else {
															handleCreateAndSend()
														}
													}
													}}
													onInput={(e) => {
														resizeInputTextarea(e.currentTarget)
													}}
												/>
											<Button
												size="icon"
												onClick={() => {
													if (activeChatId) {
														handleSend()
													} else {
														handleCreateAndSend()
													}
												}}
												disabled={!inputValue.trim() || !isLoggedIn}
												className={cn(
													'absolute bottom-3 right-3 h-9 w-9 shrink-0 rounded-lg transition-colors',
													inputValue.trim() && isLoggedIn
														? 'bg-red-500 hover:bg-red-600 text-white'
														: 'bg-muted-foreground/20 text-muted-foreground cursor-not-allowed'
												)}
											>
												<Send className="w-3.5 h-3.5" />
											</Button>
										</div>
									</div>

									{/* Prompt 模板卡片 */}
									{isLoggedIn && (
										<div className="order-1 w-full">
											<div className="mb-4 flex items-end justify-between">
												<div>
													<h3 className="text-sm font-bold">从提示词模版开始</h3>
													<p className="mt-1 text-xs text-muted-foreground">复用经过调试的提示词，快速进入稳定创作流程</p>
												</div>
												<span className="text-[11px] text-muted-foreground">共 {prompts.filter((prompt) => prompt.is_active !== false).length} 个提示词模版</span>
											</div>
											<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2">
												{promptCategories.map((category) => {
													const count = prompts.filter((prompt) => prompt.category === category.id && prompt.is_active !== false).length
													const Icon = category.icon
													return (
														<button
															key={category.id}
															onClick={() => setSelectedPromptCategory(category.id)}
															className="focus-red group flex min-h-12 items-start gap-3 rounded-lg border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-red-200 hover:shadow-sm"
														>
															<div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-red-50">
																<Icon className="w-5 h-5 text-muted-foreground group-hover:text-red-500" />
															</div>
															<div className="flex-1 min-w-0">
																<div className="flex items-center justify-between gap-2">
																	<div className="truncate text-sm font-medium">{category.title}</div>
																	<span className="text-[10px] text-muted-foreground">{count} 个</span>
																</div>
																<div className="mt-1 text-xs text-muted-foreground">{category.description}</div>
															</div>
														</button>
													)
												})}
											</div>
										</div>
									)}
								</div>
							</div>
						)}
					</main>
				</div>
				<div className="workspace-card shrink-0 overflow-hidden bg-background  rounded-lg shadow-sm">
					<MaterialShelf materials={materials} onInsert={insertMaterial} />
				</div>
			</div>
			<Dialog open={!!deleteChatTarget} onOpenChange={(open) => !open && setDeleteChatTarget(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>确认删除会话？</DialogTitle>
						<DialogDescription>“{deleteChatTarget?.title}”及其中的全部 AI 对话记录将永久删除，此操作无法撤销。</DialogDescription>
					</DialogHeader>
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => setDeleteChatTarget(null)}>取消</Button>
						<Button variant="destructive" onClick={() => void handleDeleteChat()}>确认删除</Button>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={!!selectedPromptCategory} onOpenChange={(open) => !open && setSelectedPromptCategory(null)}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>{promptCategories.find((item) => item.id === selectedPromptCategory)?.title || '选择提示词模版'}</DialogTitle>
						<DialogDescription>选择后会填入下方 AI 输入框，你可以继续修改其中的变量与创作要求。</DialogDescription>
					</DialogHeader>
					<div className="scrollBar-hidden grid max-h-[52vh] gap-2 overflow-y-auto pr-1">
						{prompts.filter((prompt) => prompt.category === selectedPromptCategory && prompt.is_active !== false).map((prompt) => {
							const Icon = iconMap[prompt.icon] || FileText
							return (
								<button
									key={prompt.id}
									type="button"
									onClick={() => handlePromptClick(prompt)}
									className="focus-red cursor-pointer rounded-md border p-4 text-left transition-colors hover:border-red-200 hover:bg-red-50/40"
								>
									<div className="flex items-start gap-3">
										<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted"><Icon className="h-4 w-4" /></span>
										<span className="min-w-0">
											<strong className="block text-sm">{prompt.title}</strong>
											<span className="mt-1 block text-xs leading-5 text-muted-foreground">{prompt.description || prompt.content}</span>
										</span>
									</div>
								</button>
							)
						})}
						{!prompts.some((prompt) => prompt.category === selectedPromptCategory && prompt.is_active !== false) && (
							<div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">该类别暂无提示词模版</div>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
