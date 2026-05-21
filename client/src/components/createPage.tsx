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
} from 'lucide-react'
import { useAuthStore } from '@/store/userStore'
import { api } from '@/api/api'
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

export default function CreatePage() {
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

	// 发送消息 & 创建对话并发送
	const handleSend = useCallback(async (chatId?: string) => {
		const targetChatId = chatId || activeChatId
		if (!inputValue.trim() || !targetChatId || sending) return
		const content = inputValue.trim()
		setInputValue('')
		setSending(true)

		const tempUserMsg: Message = {
			id: 'temp-' + Date.now(),
			role: 'user',
			content,
			created_at: new Date().toISOString(),
		}
		setMessages((prev) => [...prev, tempUserMsg])

		try {
			const data = await api<{ user_message: Message; ai_message: Message }>(
				`/api/content/chats/${targetChatId}/generate`,
				{ method: 'POST', body: JSON.stringify({ content, model_type: modelType }) }
			)

			setMessages((prev) =>
				prev
					.map((m) => (m.id === tempUserMsg.id ? data.user_message : m))
					.concat(data.ai_message)
			)

			setModelType(undefined)
			const chatData = await api<{ chats: Chat[] }>('/api/content/chats')
			setChats(chatData.chats)
		} catch {
			setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id))
		} finally {
			setSending(false)
		}
	}, [inputValue, activeChatId, sending, modelType])

	// 新建聊天并发送消息
	const handleCreateAndSend = useCallback(async () => {
		if (!inputValue.trim() || sending) return
		const content = inputValue.trim()
		setInputValue('')
		setSending(true)

		// 先创建聊天
		const { chat } = await api<{ chat: Chat }>('/api/content/chats', {
			method: 'POST',
			body: JSON.stringify({ title: '新对话' }),
		})
		setChats((prev) => [chat, ...prev])
		setActiveChatId(chat.id)

		const tempUserMsg: Message = {
			id: 'temp-' + Date.now(),
			role: 'user',
			content,
			created_at: new Date().toISOString(),
		}
		setMessages([tempUserMsg])

		try {
			const data = await api<{ user_message: Message; ai_message: Message }>(
				`/api/content/chats/${chat.id}/generate`,
				{ method: 'POST', body: JSON.stringify({ content, model_type: modelType }) }
			)
			setMessages([data.user_message, data.ai_message])

			setModelType(undefined)
			const chatData = await api<{ chats: Chat[] }>('/api/content/chats')
			setChats(chatData.chats)
		} catch {
			setMessages([])
		} finally {
			setSending(false)
		}
	}, [inputValue, sending, modelType])

	// 点击 prompt 卡片填充内容并设置模型类型
	const handlePromptClick = useCallback((prompt: Prompt) => {
		setInputValue(prompt.content)
		setModelType(iconToModelType(prompt.icon))
		setTimeout(() => inputRef.current?.focus(), 0)
	}, [])

	const isLoggedIn = !!user

	return (
		<div className="flex-1 flex h-[calc(100vh-4rem)] bg-background overflow-hidden relative">
			{/* 侧边栏 */}
			<aside
				className={cn(
					'flex flex-col border-r bg-muted/20 transition-all duration-200 shrink-0',
					sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
				)}
			>
				<div className="px-4 pt-4 pb-4">
					<Button
						onClick={handleNewChat}
						className="w-full gap-2 bg-red-500 hover:bg-red-600 text-white"
						
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
									'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-colors group',
									activeChatId === chat.id
										? 'bg-accent text-accent-foreground'
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
					"absolute top-1/2 -translate-y-1/2 z-10 w-6 h-12 bg-background border rounded-r-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
					sidebarOpen ? "-translate-x-1/2" : ""
				)}
				style={{ left: sidebarOpen ? '16rem' : '0.25rem' }}
			>
				{sidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
			</button>

			{/* 主内容区 */}
			<main className="flex-1 flex flex-col relative">
				{isLoggedIn && activeChatId ? (
					/* 聊天视图 */
					<div className="flex-1 flex flex-col">
						{/* 消息列表 */}
						<div className="flex-1 overflow-y-auto px-4 py-6">
							<div className="max-w-3xl mx-auto space-y-4">
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
											<div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
												AI
											</div>
										)}
										<div
											className={cn(
												'max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap',
												msg.role === 'user'
													? 'bg-red-500 text-white rounded-br-md'
													: 'bg-muted text-foreground rounded-bl-md'
											)}
										>
											{(() => {
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
								{sending && (
									<div className="flex gap-3">
										<div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
											AI
										</div>
										<div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
											<div className="flex gap-1">
												<span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
												<span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
												<span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
											</div>
										</div>
									</div>
								)}
								<div ref={messagesEndRef} />
							</div>
						</div>

						{/* 底部输入 */}
						<div className="border-t bg-background px-4 py-3">
							<div className="max-w-3xl mx-auto">
								<div className="flex items-end gap-2 bg-muted rounded-2xl border px-4 py-2 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500/20 transition-all">
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
					<div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
						<div className="text-center mb-8">
							<h1 className="text-3xl font-semibold text-foreground mb-2">
								你今天想创作什么？
							</h1>
							<p className="text-muted-foreground text-sm">
								选择一个模板开始，或直接输入你的想法
							</p>
						</div>

						{/* 主输入框 */}
						<div className="w-full max-w-2xl mb-10">
							<div className="flex items-end gap-2 bg-muted rounded-2xl border px-4 py-2 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500/20 transition-all">
								<textarea
									value={inputValue}
									onChange={(e) => setInputValue(e.target.value)}
									placeholder={isLoggedIn ? "描述你想创作的内容..." : "请先登录后再开始创作"}
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
										'w-8 h-8 rounded-full shrink-0 mb-1 transition-colors',
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
							<div className="w-full max-w-2xl">
								<h3 className="text-sm font-medium text-muted-foreground mb-3">创作模板</h3>
								<div className="grid grid-cols-2 gap-3">
									{prompts.map((prompt) => {
										const Icon = iconMap[prompt.icon] || FileText
										return (
											<button
												key={prompt.id}
												onClick={() => handlePromptClick(prompt)}
												className="flex items-start gap-3 p-4 rounded-xl border bg-card hover:border-red-500 hover:shadow-sm hover:bg-red-50/30 transition-all text-left group"
											>
												<div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-red-100">
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
				)}
			</main>
		</div>
	)
}
