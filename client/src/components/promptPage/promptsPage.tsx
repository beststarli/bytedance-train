"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { Sparkles, Plus, Pencil, Trash2, FileText, ImageIcon, Video } from 'lucide-react'
import { api } from '@/api/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
	image: { label: '图片生成', icon: <ImageIcon className="w-4 h-4" /> },
	video: { label: '视频创作', icon: <Video className="w-4 h-4" /> },
	general: { label: '通用优化', icon: <Sparkles className="w-4 h-4" /> },
}

const CATEGORY_OPTIONS = [
	{ key: 'article', label: '文章' },
	{ key: 'image', label: '图片' },
	{ key: 'video', label: '视频' },
	{ key: 'general', label: '优化' },
] as const

const CATEGORY_ICON_MAP: Record<string, string> = {
	article: 'FileText',
	image: 'ImageIcon',
	video: 'Video',
	general: 'Sparkles',
}

export default function PromptsPage() {
	const [prompts, setPrompts] = useState<Prompt[]>([])
	const [loading, setLoading] = useState(true)
	const [editing, setEditing] = useState<Prompt | null>(null)
	const [showForm, setShowForm] = useState(false)
	const [form, setForm] = useState({ title: '', description: '', content: '', category: 'article', icon: 'FileText' })
	const [saving, setSaving] = useState(false)

	const load = () => {
		setLoading(true)
		api<{ prompts: Prompt[] }>('/api/content/prompts')
			.then((d) => setPrompts(d.prompts))
			.finally(() => setLoading(false))
	}

	useEffect(() => { load() }, [])

	const handleSave = async () => {
		if (!form.title || !form.content) return
		setSaving(true)
		const method = editing ? 'PUT' : 'POST'
		const url = editing ? `/api/content/prompts/${editing.id}` : '/api/content/prompts'
		await api(url, { method, body: JSON.stringify(form) })
		setSaving(false)
		setShowForm(false)
		setEditing(null)
		setForm({ title: '', description: '', content: '', category: 'article', icon: 'FileText' })
		load()
	}

	const handleDelete = async (id: string) => {
		await api(`/api/content/prompts/${id}`, { method: 'DELETE' })
		load()
	}

	const openEdit = (p: Prompt) => {
		setEditing(p)
		setForm({ title: p.title, description: p.description || '', content: p.content, category: p.category, icon: p.icon })
		setShowForm(true)
	}

	const handleCategoryChange = (category: string) => {
		setForm((prev) => ({ ...prev, category, icon: CATEGORY_ICON_MAP[category] || prev.icon }))
	}

	const openNew = () => {
		setEditing(null)
		setForm({ title: '', description: '', content: '', category: 'article', icon: 'FileText' })
		setShowForm(true)
	}

	const categories = useMemo(() => {
		const keys = [...new Set(prompts.map((p) => p.category))]
		// 把已知分类按固定顺序排列，未知分类放最后
		const known = ['article', 'image', 'video', 'general']
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
		<div className="enter-workspace flex-1 overflow-y-auto px-16 py-8 ">
			<div className="mx-auto">
				<div className="flex items-end justify-between mb-7">
					<div>
						<div className="workspace-label mb-2">提示词系统</div>
						<h1 className="text-2xl font-bold">提示词模版</h1>
						<p className="text-sm text-muted-foreground mt-1.5">沉淀可复用的创作方法，让 AI 输出保持稳定</p>
					</div>
					<Button onClick={openNew} className="h-10 rounded-lg bg-[#f5222d] hover:bg-[#df1722] text-white gap-2">
						<Plus className="w-4 h-4" />新建提示词模版
					</Button>
				</div>

				{/* 表单弹窗 */}
				{showForm && (
					<div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowForm(false)}>
						<div className="bg-background rounded-lg border shadow-md p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
							<h2 className="font-semibold mb-4">{editing ? '编辑提示词模版' : '新建提示词模版'}</h2>
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
						</div>
					</div>
				)}

				{/* Tab 分类列表 */}
				{loading ? (
					<div className="text-center py-12 text-muted-foreground">加载中...</div>
				) : prompts.length === 0 ? (
					<div className="text-center py-12 text-muted-foreground">暂无提示词模版</div>
				) : (
					<Tabs value={activeTab} onValueChange={setActiveTab} className="workspace-card overflow-hidden">
						<TabsList variant="line" className="w-full h-14 bg-muted/30 border-b rounded-none p-0 px-3 mb-0">
							{categories.map((cat) => {
								const meta = CATEGORY_MAP[cat] || { label: cat, icon: <Sparkles className="w-4 h-4" /> }
								const count = prompts.filter((p) => p.category === cat).length
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
							const filtered = prompts.filter((p) => p.category === cat)
							return (
								<TabsContent key={cat} value={cat} className="mt-0 p-5">
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
