"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
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
} from 'lucide-react'
import { useAuthStore } from '@/store/userStore'
import { api, getValidAccessToken } from '@/api/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

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
}

// 从 prompt 的图标推断模型类型
function iconToModelType(icon: string): string | undefined {
	if (icon === 'ImageIcon') return 'image'
	if (icon === 'Video') return 'video'
	return undefined // text: 让后端自动检测
}

const iconMap: Record<string, React.ElementType> = {
	FileText, ImageIcon, Video, Sparkles,
}

interface CreatePageProps {
	initialMode?: 'manual' | 'ai'
}

export default function CreatePage({ initialMode }: CreatePageProps) {
	const user = useAuthStore((s) => s.user)
	const [sidebarOpen, setSidebarOpen] = useState(true)
	const [chats, setChats] = useState<Chat[]>([])
	const [activeChatId, setActiveChatId] = useState<string | null>(null)
	const [messages, setMessages] = useState<Message[]>([])
	const [prompts, setPrompts] = useState<Prompt[]>([])
	const [inputValue, setInputValue] = useState('')
	const [modelType, setModelType] = useState<string | undefined>(undefined)
	const [loadingChats, setLoadingChats] = useState(true)
	const [sending, setSending] = useState(false)
	const [creationMode, setCreationMode] = useState<'manual' | 'ai' | null>(initialMode || null)
	const [draftTitle, setDraftTitle] = useState('')
	const [draftContent, setDraftContent] = useState('')
	const [publishing, setPublishing] = useState(false)
	const messagesEndRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLTextAreaElement>(null)

	// 加载聊天列表 + prompt 模板
	useEffect(() => {
		if (!user) return
		Promise.all([
			api<{ chats: Chat[] }>('/api/content/chats'),
			api<{ prompts: Prompt[] }>('/api/content/prompts'),
		]).then(([chatData, promptData]) => {
			setChats(chatData.chats)
			setPrompts(promptData.prompts)
		}).finally(() => setLoadingChats(false))
	}, [user])

	// 切换聊天时加载消息
	useEffect(() => {
		if (!activeChatId) {
			setMessages([])
			return
		}
		api<{ messages: Message[] }>(`/api/content/chats/${activeChatId}/messages`)
			.then((data) => setMessages(data.messages))
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
	const handleDeleteChat = useCallback(async (e: React.MouseEvent, chatId: string) => {
		e.stopPropagation()
		await api(`/api/content/chats/${chatId}`, { method: 'DELETE' })
		setChats((prev) => prev.filter((c) => c.id !== chatId))
		if (activeChatId === chatId) {
			setActiveChatId(null)
			setMessages([])
		}
	}, [activeChatId])

	const requestCounter = useRef(0)

	// ===== SSE 流式发送消息（文生文 / 图 / 视频通用） =====
	const sendStreamingMessage = useCallback(async (chatId: string, content: string): Promise<void> => {
		if (sending || !content.trim()) return

		const trimmedContent = content.trim()
		setInputValue('')
		setSending(true)

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
							case 'user_message':
								// 用服务端返回的消息替换临时消息
								setMessages((prev) =>
									prev.map((m) => (m.id === tempId ? data.message : m))
								)
								break

							case 'chunk':
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
			setActiveChatId(chat.id)

			// 再流式发送
			await sendStreamingMessage(chat.id, content)
		} catch (err: any) {
			// 创建聊天失败不需要额外处理
		}
	}, [inputValue, sending, sendStreamingMessage])

	// 点击 prompt 卡片填充内容并设置模型类型
	const handlePromptClick = useCallback((prompt: Prompt) => {
		setInputValue(prompt.content)
		setModelType(iconToModelType(prompt.icon))
		setTimeout(() => inputRef.current?.focus(), 0)
	}, [])

	const isLoggedIn = !!user

	const handlePublish = async (status: 'draft' | 'published') => {
		if (!draftTitle.trim() || !draftContent.trim()) return
		setPublishing(true)
		try {
			await api('/api/content/works', {
				method: 'POST',
				body: JSON.stringify({ title: draftTitle.trim(), content: draftContent.trim(), status }),
			})
			setDraftTitle('')
			setDraftContent('')
		} finally {
			setPublishing(false)
		}
	}

	if (!creationMode) {
		return (
			<div className="enter-workspace flex-1 overflow-y-auto px-4 py-8 sm:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="mb-8">
						<div className="workspace-label mb-2">Creation workflow</div>
						<h1 className="text-2xl font-bold tracking-tight">选择你的创作方式</h1>
						<p className="mt-2 text-sm text-muted-foreground">从空白稿开始完整表达，或让 AI 帮你快速完成第一版。</p>
					</div>
					<div className="grid gap-5 md:grid-cols-2">
						<button type="button" onClick={() => setCreationMode('manual')} className="focus-red group min-h-64 rounded-lg border bg-card p-7 text-left transition-all hover:border-red-200 hover:shadow-sm">
							<span className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-50 text-red-500"><PenLine className="h-5 w-5" /></span>
							<h2 className="mt-10 text-xl font-bold">自由写作台</h2>
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
			<div className="enter-workspace flex-1 overflow-y-auto px-4 py-6 sm:px-8">
				<div className="mx-auto max-w-4xl">
					<div className="mb-5 flex items-center justify-between gap-4">
						<div><button type="button" onClick={() => setCreationMode(null)} className="text-xs text-muted-foreground hover:text-red-500">← 返回创作方式</button><h1 className="mt-2 text-xl font-bold">自由写作台</h1></div>
						<div className="flex gap-2"><Button variant="outline" disabled={publishing} onClick={() => void handlePublish('draft')}>保存草稿</Button><Button disabled={publishing || !draftTitle.trim() || !draftContent.trim()} onClick={() => void handlePublish('published')} className="bg-red-500 text-white hover:bg-red-600">发布文章</Button></div>
					</div>
					<div className="workspace-card overflow-hidden">
						<input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="输入文章标题" className="w-full border-b bg-transparent px-7 py-6 text-2xl font-bold outline-none placeholder:text-muted-foreground/40" />
						<textarea value={draftContent} onChange={(e) => setDraftContent(e.target.value)} placeholder="从这里开始写作…" className="min-h-[520px] w-full resize-none bg-transparent px-7 py-6 text-base leading-8 outline-none placeholder:text-muted-foreground/40" />
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="enter-workspace relative flex h-[calc(100dvh-8.5rem)] flex-1 overflow-hidden bg-[#f7f8fb] lg:h-[calc(100vh-4.5rem)]">
			{/* 侧边栏 */}
			<aside
				className={cn(
					'hidden flex-col border-r bg-background transition-all duration-200 shrink-0 md:flex',
					sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'
				)}
			>
				<div className="px-4 pt-5 pb-4">
					<div className="workspace-label mb-3 px-1">创作记录</div>
					<Button
						onClick={handleNewChat}
						className="w-full h-10 gap-2 rounded-lg bg-[#f5222d] hover:bg-[#df1722] text-white shadow-[0_6px_14px_rgba(245,34,45,.14)]"
						
					>
						<Pencil className="w-4 h-4" />
						新对话
					</Button>
				</div>

				<nav className="flex-1 overflow-y-auto px-2 pt-1 space-y-0.5">
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
									onClick={(e) => handleDeleteChat(e, chat.id)}
									className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
								>
									<Trash2 className="w-3.5 h-3.5" />
								</button>
							</div>
						))
					)}
				</nav>
			</aside>

			{/* 侧边栏切换按钮 */}
			<button
				onClick={() => setSidebarOpen(!sidebarOpen)}
				className={cn(
					"absolute top-1/2 z-10 hidden h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex",
					sidebarOpen ? "-translate-x-1/2" : ""
				)}
				style={{ left: sidebarOpen ? '18rem' : '0.25rem' }}
			>
				{sidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
			</button>

			{/* 主内容区 */}
			<main className="flex-1 flex flex-col relative min-w-0">
				{isLoggedIn && activeChatId ? (
					/* 聊天视图 */
					<div className="flex-1 flex flex-col min-h-0">
						<div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
							<div>
								<div className="text-sm font-semibold">{chats.find((chat) => chat.id === activeChatId)?.title || '未命名创作'}</div>
								<div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
									<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 已自动保存
								</div>
							</div>
							<div className="flex items-center gap-2">
								<span className="hidden rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-medium text-emerald-700 sm:inline">安全检查正常</span>
								<Button variant="outline" className="h-8 shrink-0 rounded-lg text-xs">保存草稿</Button>
							</div>
						</div>
						{/* 消息列表 */}
						<div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7">
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
												<div className="flex h-6 items-center gap-1" aria-label="AI 正在生成">
													<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40" style={{ animationDelay: '0ms' }} />
													<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40" style={{ animationDelay: '150ms' }} />
													<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40" style={{ animationDelay: '300ms' }} />
												</div>
											) : (() => {
												const isImage = msg.role === 'assistant' && /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(msg.content)
												return isImage ? (
													<img src={msg.content} alt="生成的图片" className="max-w-full rounded-lg" />
												) : (
													msg.content
												)
											})()}
										</div>
										{msg.role === 'user' && (
											<div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 overflow-hidden">
												{user?.avatar_url ? (
													<img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
												) : (
													user?.nickname?.charAt(0) || user?.phone?.slice(-1) || '?'
												)}
											</div>
										)}
									</div>
								))}
								<div ref={messagesEndRef} />
							</div>
						</div>

						{/* 底部输入 */}
						<div className="border-t bg-background px-3 py-3 sm:px-6 sm:py-4">
							<div className="max-w-4xl mx-auto">
								<div className="flex items-end gap-2 bg-background rounded-lg border px-4 py-2.5 shadow-[0_5px_18px_rgba(30,36,55,.05)] focus-within:border-red-300 focus-within:ring-4 focus-within:ring-red-500/5 transition-all">
									<textarea
										ref={inputRef}
										value={inputValue}
										onChange={(e) => setInputValue(e.target.value)}
										placeholder="描述你想创作的内容..."
										className="flex-1 bg-transparent border-none outline-none resize-none text-sm py-1.5 max-h-[120px] placeholder:text-muted-foreground"
										rows={1}
										onKeyDown={(e) => {
											if (e.key === 'Enter' && !e.shiftKey) {
												e.preventDefault()
												handleSend()
											}
										}}
										onInput={(e) => {
											const el = e.currentTarget
											el.style.height = 'auto'
											el.style.height = Math.min(el.scrollHeight, 120) + 'px'
										}}
									/>
									<div className="flex items-center gap-1 shrink-0 pb-1">
										<Button variant="ghost" size="icon" className="text-muted-foreground w-8 h-8">
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
					<div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-10">
						<div className="mx-auto w-full max-w-5xl">
						<div className="mb-8">
							<div className="workspace-label mb-3">AI creation studio</div>
							<h1 className="mb-2 text-2xl font-bold tracking-[-0.04em] text-foreground sm:text-[32px]">
								把一个想法，变成可发布的作品
							</h1>
							<p className="text-muted-foreground text-sm">
								描述主题、受众和表达方式，AI 会保留完整创作上下文。
							</p>
						</div>

						{/* 主输入框 */}
						<div className="workspace-card w-full mb-8 p-2">
							<div className="flex items-end gap-2 bg-background rounded-lg px-4 py-3 focus-within:ring-4 focus-within:ring-red-500/5 transition-all">
								<textarea
									value={inputValue}
									onChange={(e) => setInputValue(e.target.value)}
									placeholder={isLoggedIn ? "例如：为刚入职场的年轻人写一篇关于 AI 工作流的文章，语气真诚、有具体案例…" : "请先登录后再开始创作"}
									disabled={!isLoggedIn}
									className="flex-1 bg-transparent border-none outline-none resize-none text-sm py-1.5 max-h-[120px] placeholder:text-muted-foreground disabled:opacity-50"
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
										const el = e.currentTarget
										el.style.height = 'auto'
										el.style.height = Math.min(el.scrollHeight, 120) + 'px'
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
										'w-9 h-9 rounded-lg shrink-0 mb-0.5 transition-colors',
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
							<div className="w-full">
								<div className="mb-4 flex items-end justify-between">
									<div>
										<h3 className="text-sm font-bold">从模板开始</h3>
										<p className="mt-1 text-xs text-muted-foreground">复用经过调试的 Prompt，快速进入稳定创作流程</p>
									</div>
									<span className="text-[11px] text-muted-foreground">共 {prompts.length} 个模板</span>
								</div>
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
									{prompts.map((prompt) => {
										const Icon = iconMap[prompt.icon] || FileText
										return (
											<button
												key={prompt.id}
												onClick={() => handlePromptClick(prompt)}
												className="focus-red group flex min-h-28 items-start gap-3 rounded-lg border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-red-200 hover:shadow-sm"
											>
												<div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-red-50">
													<Icon className="w-5 h-5 text-muted-foreground group-hover:text-red-500" />
												</div>
												<div className="flex-1 min-w-0">
													<div className="text-sm font-medium truncate">{prompt.title}</div>
													<div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{prompt.description}</div>
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
	)
}
