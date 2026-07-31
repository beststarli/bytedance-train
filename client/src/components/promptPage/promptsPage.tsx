"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { Sparkles, Plus, Pencil, Trash2, FileText, ImageIcon, WandSparkles, Bot, Send, Check, LoaderCircle } from 'lucide-react'
import { api } from '@/api/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/store/userStore'
import AuthRequired from '@/components/auth-required'
import { toast } from 'sonner'

interface Prompt {
	id: string
	title: string
	description: string
	content: string
	category: string
	icon: string
	sort_order: number
	is_active: boolean
}

const CATEGORY_MAP: Record<string, { label: string; icon: React.ReactNode }> = {
	article: { label: '文章创作', icon: <FileText className="w-4 h-4" /> },
	writing: { label: '文章写作', icon: <FileText className="w-4 h-4" /> },
	image: { label: '图片生成', icon: <ImageIcon className="w-4 h-4" /> },
	image_edit: { label: '图片修改', icon: <WandSparkles className="w-4 h-4" /> },
	general: { label: '通用优化', icon: <Sparkles className="w-4 h-4" /> },
	optimize: { label: '内容优化', icon: <Sparkles className="w-4 h-4" /> },
}

const CATEGORY_OPTIONS = [
	{ key: 'writing', label: '写作' },
	{ key: 'image', label: '图片' },
	{ key: 'image_edit', label: '图片修改' },
	{ key: 'optimize', label: '优化' },
] as const

const CATEGORY_ICON_MAP: Record<string, string> = {
	article: 'FileText',
	writing: 'FileText',
	image: 'ImageIcon',
	image_edit: 'WandSparkles',
	general: 'Sparkles',
	optimize: 'Sparkles',
}

const CATEGORY_GENERATOR_STARTERS: Record<string, string> = {
	writing: '请生成一个用于文章写作的提示词模板，我想要实现：',
	image: '请生成一个用于图片创作的提示词模板，我想要呈现：',
	image_edit: '请生成一个用于图片修改的提示词模板，我希望基于参考图片调整：',
	optimize: '请生成一个用于内容优化的提示词模板，我想要改善：',
}

interface GeneratedTemplate {
	title: string
	description: string
	content: string
}

interface ExecutedSkill {
	id: string
	name: string
	version: string
}

const normalizedPromptCategory = (category: string) => category

export default function PromptsPage() {
	const [prompts, setPrompts] = useState<Prompt[]>([])
	const [loading, setLoading] = useState(true)
	const [editing, setEditing] = useState<Prompt | null>(null)
	const [showForm, setShowForm] = useState(false)
	const [form, setForm] = useState({ title: '', description: '', content: '', category: 'writing', icon: 'FileText' })
	const [saving, setSaving] = useState(false)
	const [generatorRequest, setGeneratorRequest] = useState(CATEGORY_GENERATOR_STARTERS.writing)
	const [lastGeneratorRequest, setLastGeneratorRequest] = useState('')
	const [generatedTemplate, setGeneratedTemplate] = useState<GeneratedTemplate | null>(null)
	const [executedSkill, setExecutedSkill] = useState<ExecutedSkill | null>(null)
	const [generating, setGenerating] = useState(false)
	const user = useAuthStore((state) => state.user)

	const load = (cancelled?: () => boolean) => {
		if (!user) {
			setPrompts([])
			setLoading(false)
			return
		}
		setLoading(true)
		api<{ prompts: Prompt[] }>('/api/content/prompts')
			.then((d) => { if (!cancelled?.()) setPrompts(d.prompts) })
			.catch(() => { if (!cancelled?.()) setPrompts([]) })
			.finally(() => { if (!cancelled?.()) setLoading(false) })
	}

	useEffect(() => {
		let cancelled = false
		setPrompts([])
		setEditing(null)
		setShowForm(false)
		setActiveTab('')
		load(() => cancelled)
		return () => { cancelled = true }
	}, [user?.id])

	const handleSave = async () => {
		if (!user || !form.title || !form.content) return
		setSaving(true)
		try {
			const method = editing ? 'PUT' : 'POST'
			const url = editing ? `/api/content/prompts/${editing.id}` : '/api/content/prompts'
			await api(url, { method, body: JSON.stringify(form) })
			setShowForm(false)
			setEditing(null)
			setForm({ title: '', description: '', content: '', category: 'writing', icon: 'FileText' })
			toast.success(editing ? '提示词模版已更新' : '提示词模版已创建')
			load()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : '保存失败')
		} finally {
			setSaving(false)
		}
	}

	const handleDelete = async (id: string) => {
		if (!user) return
		await api(`/api/content/prompts/${id}`, { method: 'DELETE' })
		load()
	}

	const openEdit = (p: Prompt) => {
		if (!user) return
		setEditing(p)
		setForm({ title: p.title, description: p.description || '', content: p.content, category: p.category, icon: p.icon })
		setShowForm(true)
	}

	const handleCategoryChange = (category: string) => {
		const previousStarter = CATEGORY_GENERATOR_STARTERS[form.category]
		setGeneratorRequest((current) =>
			!current.trim() || current === previousStarter
				? CATEGORY_GENERATOR_STARTERS[category] || ''
				: current
		)
		setGeneratedTemplate(null)
		setExecutedSkill(null)
		setLastGeneratorRequest('')
		setForm((prev) => ({ ...prev, category, icon: CATEGORY_ICON_MAP[category] || prev.icon }))
	}

	const openNew = () => {
		if (!user) return
		setEditing(null)
		setForm({ title: '', description: '', content: '', category: 'writing', icon: 'FileText' })
		setGeneratorRequest(CATEGORY_GENERATOR_STARTERS.writing)
		setLastGeneratorRequest('')
		setGeneratedTemplate(null)
		setExecutedSkill(null)
		setShowForm(true)
	}

	const generateTemplate = async () => {
		const requirement = generatorRequest.trim()
		if (requirement.length < 4 || generating) return
		setGenerating(true)
		setLastGeneratorRequest(requirement)
		setGeneratedTemplate(null)
		setExecutedSkill(null)
		try {
			const data = await api<{ template: GeneratedTemplate; skill: ExecutedSkill }>('/api/content/prompts/generate', {
				method: 'POST',
				body: JSON.stringify({ category: form.category, requirement }),
			})
			setGeneratedTemplate(data.template)
			setExecutedSkill(data.skill)
		} catch (error) {
			toast.error(error instanceof Error ? error.message : '提示词生成失败')
		} finally {
			setGenerating(false)
		}
	}

	const applyGeneratedTemplate = () => {
		if (!generatedTemplate) return
		setForm((current) => ({
			...current,
			title: generatedTemplate.title,
			description: generatedTemplate.description,
			content: generatedTemplate.content,
		}))
		toast.success('AI 生成结果已填入右侧表单')
	}

	const categories = useMemo(() => {
		const keys = [...new Set(prompts.map((p) => normalizedPromptCategory(p.category)))]
		// 把已知分类按固定顺序排列，未知分类放最后
		const known = ['writing', 'image', 'image_edit', 'optimize', 'article', 'general']
		return [
			...known.filter((k) => keys.includes(k)),
			...keys.filter((k) => !known.includes(k)),
		]
	}, [prompts])

	const [activeTab, setActiveTab] = useState('')

	// 当 categories 加载完成后默认选中第一个
	useEffect(() => {
		if (categories.length > 0 && !activeTab) setActiveTab(categories[0])
	}, [categories])

	return (
		<div className="enter-workspace min-h-0 flex-1 overflow-hidden px-16 py-8">
			<div className="mx-auto flex h-full min-h-0 flex-col">
				<div className="mb-7 flex shrink-0 items-end justify-between">
					<div>
						<div className="workspace-label mb-2">Prompt Template</div>
						<h1 className="text-2xl font-bold">提示词模版</h1>
						<p className="text-sm text-muted-foreground mt-1.5">沉淀可复用的创作方法，让 AI 输出保持稳定</p>
					</div>
					<Button disabled={!user} onClick={openNew} className="h-10 rounded-lg bg-[#f5222d] hover:bg-[#df1722] text-white gap-2">
						<Plus className="w-4 h-4" />新建提示词模版
					</Button>
				</div>

				{/* 表单弹窗 */}
				{showForm && (
					<div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowForm(false)}>
						<div
							className={`mx-4 flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-lg border bg-background shadow-xl lg:flex-row ${editing ? 'max-w-lg' : 'max-w-6xl'}`}
							onClick={(e) => e.stopPropagation()}
						>
							{!editing && (
								<section className="flex min-h-[360px] w-full min-w-0 flex-col border-b bg-muted/25 lg:min-h-[620px] lg:w-[44%] lg:border-b-0 lg:border-r">
									<div className="border-b px-5 py-4">
										<div className="flex items-center gap-3">
											<div className="flex size-9 items-center justify-center rounded-md bg-red-500 text-white">
												<Bot className="size-5" />
											</div>
											<div>
												<h3 className="font-semibold">AI 提示词工坊</h3>
												<p className="mt-0.5 text-xs text-muted-foreground">把简单想法扩写成可复用的专业提示词</p>
											</div>
										</div>
										<div className="mt-3 rounded-md border border-red-100 bg-red-50/70 px-3 py-2 text-xs leading-5 text-red-700">
											已按“{CATEGORY_MAP[form.category]?.label || '提示词'}”类型约束生成结构，你只需补充冒号后的具体需求。
										</div>
									</div>

									<div className="scrollBar-hidden flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
										{!lastGeneratorRequest && !generating && (
											<div className="my-auto text-center">
												<Sparkles className="mx-auto size-6 text-red-400" />
												<p className="mt-3 text-sm font-medium">描述你想让提示词完成什么</p>
												<p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
													AI 会保留未知信息为可填写变量，不会替你直接完成最终创作任务。
												</p>
											</div>
										)}
										{lastGeneratorRequest && (
											<div className="ml-auto max-w-[88%] rounded-lg bg-red-500 px-3 py-2 text-sm leading-6 text-white">
												{lastGeneratorRequest}
											</div>
										)}
										{generating && (
											<div className="flex max-w-[88%] items-center gap-2 rounded-lg border bg-background px-3 py-3 text-sm text-muted-foreground">
												<LoaderCircle className="size-4 animate-spin text-red-500" />
												正在拆解任务、补充约束与输出格式…
											</div>
										)}
										{generatedTemplate && (
											<div className="max-w-[94%] rounded-lg border bg-background p-4 shadow-sm">
												<div className="flex items-center justify-between gap-2 text-xs font-medium text-red-500">
													<span className="flex items-center gap-1.5"><Sparkles className="size-3.5" />Skill 执行完成</span>
													{executedSkill && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px]">{executedSkill.name} · v{executedSkill.version}</span>}
												</div>
												<strong className="mt-2 block text-sm">{generatedTemplate.title}</strong>
												<p className="mt-1 text-xs leading-5 text-muted-foreground">{generatedTemplate.description}</p>
												<div className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs leading-5">
													{generatedTemplate.content}
												</div>
												<Button onClick={applyGeneratedTemplate} className="mt-3 h-8 w-full gap-1.5 bg-red-500 text-white hover:bg-red-600">
													<Check className="size-3.5" />填入右侧模板
												</Button>
											</div>
										)}
									</div>

									<div className="border-t bg-background p-4">
										<div className="relative rounded-lg border bg-background focus-within:border-red-300 focus-within:ring-2 focus-within:ring-red-100">
											<textarea
												value={generatorRequest}
												onChange={(event) => setGeneratorRequest(event.target.value)}
												onKeyDown={(event) => {
													if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
														event.preventDefault()
														void generateTemplate()
													}
												}}
												className="scrollBar-hidden min-h-24 w-full resize-none bg-transparent px-3 pb-11 pt-3 text-sm leading-6 outline-none"
												placeholder="补充你的简单需求…"
											/>
											<span className="absolute bottom-3 left-3 text-[10px] text-muted-foreground">⌘ / Ctrl + Enter 生成</span>
											<Button
												size="icon"
												onClick={() => void generateTemplate()}
												disabled={generating || generatorRequest.trim().length < 4}
												className="absolute bottom-2 right-2 size-8 rounded-md bg-red-500 text-white hover:bg-red-600"
											>
												{generating ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
											</Button>
										</div>
									</div>
								</section>
							)}

							<section className={`scrollBar-hidden min-h-0 w-full overflow-y-auto p-6 ${editing ? '' : 'lg:w-[56%]'}`}>
								<h2 className="font-semibold">{editing ? '编辑提示词模版' : '新建提示词模版'}</h2>
								<p className="mb-5 mt-1 text-xs text-muted-foreground">
									{editing ? '调整模板内容并保存修改' : '可手动填写，也可采用左侧 AI 生成结果后继续修改'}
								</p>
								<div className="space-y-4">
								{/* 类别选择 */}
								<div>
									<Label className="text-sm text-muted-foreground">选择类别</Label>
									<div className="grid grid-cols-4 gap-2 mt-1.5">
										{CATEGORY_OPTIONS.map((opt) => {
											const meta = CATEGORY_MAP[opt.key]
											const isActive = form.category === opt.key
											const disabled = !!editing && !isActive
											return (
												<button
													key={opt.key}
													type="button"
													disabled={disabled}
													onClick={() => handleCategoryChange(opt.key)}
													className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all text-sm ${isActive
														? 'border-red-500 bg-red-50 text-red-600 ring-1 ring-red-500'
														: disabled
															? 'border-border bg-muted text-muted-foreground cursor-not-allowed opacity-50'
															: 'border-border bg-card text-muted-foreground hover:border-red-200 hover:text-foreground'
														}`}
												>
													<span className={isActive ? 'text-red-500' : 'text-muted-foreground'}>{meta.icon}</span>
													<span className="text-xs font-medium">{opt.label}</span>
												</button>
											)
										})}
									</div>
									{editing && (
										<p className="text-xs text-muted-foreground mt-1.5">编辑时不可修改类别，如需更换请新建提示词模版</p>
									)}
								</div>

								{/* 标题 */}
								<div>
									<Label className="text-sm text-muted-foreground">标题</Label>
									<Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 mt-1" placeholder="输入提示词模版标题" />
								</div>

								{/* 描述 */}
								<div>
									<Label className="text-sm text-muted-foreground">描述</Label>
									<Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="h-9 mt-1" placeholder="简短描述提示词用途" />
								</div>

								{/* 提示词内容 */}
								<div>
									<Label className="text-sm text-muted-foreground">提示词内容</Label>
									<textarea
										value={form.content}
										onChange={(e) => setForm({ ...form, content: e.target.value })}
										className="w-full mt-1 rounded-lg border bg-background px-3 py-2 text-sm min-h-[120px] resize-y"
										placeholder="输入提示词模版，用 {变量名} 表示占位符"
									/>
								</div>

								<div className="flex justify-end gap-2 pt-2">
									<Button onClick={handleSave} disabled={saving || !form.title || !form.content} className="bg-red-500 hover:bg-red-600 text-white">
										{saving ? '保存中...' : '保存'}
									</Button>
									<Button variant="ghost" onClick={() => setShowForm(false)}>取消</Button>
								</div>
							</div>
							</section>
						</div>
					</div>
				)}

				{/* Tab 分类列表 */}
				{!user ? (
					<AuthRequired className="min-h-[50vh]" />
				) : loading ? (
					<div className="text-center py-12 text-muted-foreground">加载中...</div>
				) : prompts.length === 0 ? (
					<div className="text-center py-12 text-muted-foreground">暂无提示词模版</div>
				) : (
					<Tabs value={activeTab} onValueChange={setActiveTab} className="workspace-card flex min-h-0 flex-1 flex-col overflow-hidden">
						<TabsList variant="line" className="mb-0 h-14 w-full shrink-0 rounded-none border-b bg-muted/30 p-0 px-3">
							{categories.map((cat) => {
								const meta = CATEGORY_MAP[cat] || { label: cat, icon: <Sparkles className="w-4 h-4" /> }
								const count = prompts.filter((p) => normalizedPromptCategory(p.category) === cat).length
								return (
									<TabsTrigger
										key={cat}
										value={cat}
										className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:text-red-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5"
									>
										{meta.icon}
										{meta.label}
										<span className="text-xs text-muted-foreground ml-0.5">({count})</span>
									</TabsTrigger>
								)
							})}
						</TabsList>
						{categories.map((cat) => {
							const filtered = prompts.filter((p) => normalizedPromptCategory(p.category) === cat)
							return (
								<TabsContent key={cat} value={cat} className="mt-0 min-h-0 flex-1 overflow-y-auto p-5">
									{filtered.length === 0 ? (
										<div className="text-center py-12 text-muted-foreground text-sm">该分类暂无提示词模版</div>
									) : (
										<div className="grid grid-cols-2 gap-4">
											{filtered.map((p) => (
												<div key={p.id} className="group flex min-h-28 items-start gap-4 p-4 rounded-lg border bg-card hover:border-red-200 hover:shadow-sm transition-all">
													<div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
														<Sparkles className="w-5 h-5 text-red-500" />
													</div>
													<div className="flex-1 min-w-0">
														<div className="text-sm font-medium">{p.title}</div>
														<div className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</div>
													</div>
													<div className="flex items-center gap-1">
														<Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openEdit(p)}>
															<Pencil className="w-3.5 h-3.5" />
														</Button>
														<Button variant="ghost" size="icon" className="w-8 h-8 text-red-500 hover:text-red-600" onClick={() => handleDelete(p.id)}>
															<Trash2 className="w-3.5 h-3.5" />
														</Button>
													</div>
												</div>
											))}
										</div>
									)}
								</TabsContent>
							)
						})}
					</Tabs>
				)}
			</div>
		</div>
	)
}
