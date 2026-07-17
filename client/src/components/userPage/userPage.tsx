"use client"

import React, { useEffect, useRef, useState } from "react"
import {
	ArrowRight,
	BarChart3,
	Bookmark,
	Camera,
	Check,
	FilePenLine,
	Heart,
	ImageIcon,
	Lightbulb,
	Mail,
	Pencil,
	Phone,
	Sparkles,
} from "lucide-react"
import { api } from "@/api/api"
import { useAuthStore } from "@/store/userStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"

interface UserPageProps {
	onNavigate?: (menu: string) => void
}

interface DashboardData {
	stats: { works: number; views: number; published: number; quality: number }
	reactions: Array<{ id: string; title: string; content: string; view_count: number; type: "like" | "favorite" }>
}

export default function UserPage({ onNavigate }: UserPageProps) {
	const { user, setAuth, token } = useAuthStore()
	const [profileOpen, setProfileOpen] = useState(false)
	const [avatarOpen, setAvatarOpen] = useState(false)
	const [nickname, setNickname] = useState(user?.nickname || "")
	const [email, setEmail] = useState(user?.email || "")
	const [saving, setSaving] = useState(false)
	const [message, setMessage] = useState("")
	const [dashboard, setDashboard] = useState<DashboardData | null>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		api<DashboardData>("/api/content/creator-dashboard")
			.then(setDashboard)
			.catch(() => setDashboard(null))
	}, [])

	const saveProfile = async () => {
		setSaving(true)
		try {
			const data = await api<{ user: typeof user }>("/api/auth/profile", {
				method: "PUT",
				body: JSON.stringify({ nickname, email }),
			})
			if (data.user && token) setAuth(data.user, token)
			setMessage("资料已更新")
			setProfileOpen(false)
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "保存失败")
		} finally {
			setSaving(false)
		}
	}

	const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (!file) return
		if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
			setMessage("请选择不超过 2MB 的图片")
			return
		}
		setSaving(true)
		try {
			const image = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader()
				reader.onload = () => resolve(reader.result as string)
				reader.onerror = reject
				reader.readAsDataURL(file)
			})
			const data = await api<{ user: typeof user }>("/api/auth/avatar", {
				method: "POST",
				body: JSON.stringify({ image }),
			})
			if (data.user && token) setAuth(data.user, token)
			setAvatarOpen(false)
			setMessage("头像已更新")
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "上传失败")
		} finally {
			setSaving(false)
		}
	}

	const avatarText = user?.nickname?.charAt(0) || user?.phone?.slice(-1) || "?"
	const stats = dashboard?.stats || { works: 0, views: 0, published: 0, quality: 0 }

	return (
		<div className="enter-workspace flex-1 overflow-y-auto px-16 py-8">
			<div className="mx-auto space-y-5">
				<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
					<div className="space-y-2">
						<section className="workspace-card relative overflow-hidden p-6 sm:p-8">
							<div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 via-orange-400 to-transparent" />
							<div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
								<div className="flex items-center gap-5">
									<button type="button" onClick={() => setAvatarOpen(true)} className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-red-400 to-red-600 text-2xl font-bold text-white">
										{user?.avatar_url ? <img src={user.avatar_url} alt="头像" className="h-full w-full object-cover" /> : avatarText}
										<span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100"><Camera className="h-5 w-5" /></span>
									</button>
									<div>
										<div className="flex items-center gap-2"><h1 className="text-xl font-bold">{user?.nickname || "未设置昵称"}</h1><span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">创作者认证</span></div>
										<p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {user?.phone}</p>
										<div className="mt-3 flex gap-5 text-xs text-muted-foreground"><span><strong className="mr-1 text-foreground">{stats.published}</strong>已发布</span><span><strong className="mr-1 text-foreground">{stats.works}</strong>作品</span><span><strong className="mr-1 text-foreground">{stats.views}</strong>阅读</span></div>
									</div>
								</div>
								<Button onClick={() => setProfileOpen(true)} className="bg-red-500 text-white hover:bg-red-600"><Pencil className="mr-1.5 h-4 w-4" />修改资料</Button>
							</div>
							{message && <p className="mt-4 flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" />{message}</p>}
						</section>

						<section className="workspace-card p-5 sm:p-6">
							<div className="mb-5"><h2 className="font-bold">新的创作</h2><p className="mt-1 text-xs text-muted-foreground">选择下一步，直接进入对应工作流</p></div>
							<div className="grid gap-4 md:grid-cols-3">
								{[
									{ title: "发布文章", desc: "进入创作中心，编辑并发布内容", icon: FilePenLine, tone: "bg-red-50 text-red-500", target: "create:manual" },
									{ title: "图文草稿", desc: "从素材库整理图片与内容草稿", icon: ImageIcon, tone: "bg-blue-50 text-blue-600", target: "materials" },
									{ title: "AI 一键初稿", desc: "与 AI 协作，从想法快速生成文章", icon: Sparkles, tone: "bg-amber-50 text-amber-600", target: "create:ai" },
								].map((item) => (
									<button key={item.title} type="button" onClick={() => onNavigate?.(item.target)} className="focus-red group rounded-lg border p-5 text-left transition-colors hover:border-red-200">
										<span className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.tone}`}><item.icon className="h-5 w-5" /></span>
										<h3 className="mt-6 text-sm font-bold">{item.title}</h3><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.desc}</p>
										<ArrowRight className="mt-4 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-red-500" />
									</button>
								))}
							</div>
						</section>

						<section className="workspace-card p-5 sm:p-6">
							<div className="mb-5 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-red-500" /><h2 className="font-bold">作品数据看板</h2></div>
							<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
								{[["作品总数", stats.works], ["累计阅读", stats.views], ["已发布", stats.published], ["平均质量分", stats.quality]].map(([label, value]) => (
									<div key={label} className="rounded-lg border bg-muted/25 p-4"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-3 block text-2xl">{value}</strong></div>
								))}
							</div>
						</section>

						<section className="workspace-card p-5 sm:p-6">
							<div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">我的互动</h2><p className="mt-1 text-xs text-muted-foreground">收藏与点赞过的文章</p></div><div className="flex gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />点赞</span><span className="flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" />收藏</span></div></div>
							{dashboard?.reactions.length ? <div className="grid gap-3 md:grid-cols-2">{dashboard.reactions.map((item) => <div key={`${item.id}-${item.type}`} className="rounded-lg border p-4"><div className="flex items-start gap-3">{item.type === "like" ? <Heart className="mt-0.5 h-4 w-4 fill-red-500 text-red-500" /> : <Bookmark className="mt-0.5 h-4 w-4 fill-amber-400 text-amber-500" />}<div><h3 className="line-clamp-1 text-sm font-semibold">{item.title}</h3><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.content}</p></div></div></div>)}</div> : <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">还没有点赞或收藏文章</div>}
						</section>
					</div>

					<aside className="workspace-card p-5 xl:sticky ">
						<div className="mb-3 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Lightbulb className="h-4 w-4" /></span>
								<div><h2 className="text-sm font-bold">灵感榜单</h2><p className="text-[10px] text-muted-foreground">今日值得关注的选题</p></div>
							</div>
							<button type="button" onClick={() => onNavigate?.("inspiration")} className="text-[11px] text-muted-foreground hover:text-red-500">全部</button>
						</div>
						{["普通人如何用 AI 建立第二大脑", "年轻人重新爱上逛公园", "一人公司需要哪些 Agent", "内容创作者的效率系统", "低成本拍出电影感画面"].map((topic, index) => (
							<button key={topic} type="button" onClick={() => onNavigate?.("create:ai")} className="focus-red group flex w-full gap-2.5 rounded-lg px-1 py-2 text-left hover:bg-muted/60">
								<span className="w-5 text-xs font-bold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
								<span className="flex-1 text-xs leading-5 group-hover:text-red-600">{topic}</span>
							</button>
						))}
					</aside>
				</div>
			</div>

			<Dialog open={profileOpen} onOpenChange={setProfileOpen}>
				<DialogContent><DialogHeader><DialogTitle>修改个人资料</DialogTitle><DialogDescription>这些信息会展示在你的作品和个人中心。</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div><Label htmlFor="profile-name">昵称</Label><Input id="profile-name" value={nickname} onChange={(e) => setNickname(e.target.value)} className="mt-1.5" /></div><div><Label htmlFor="profile-email">邮箱</Label><div className="relative mt-1.5"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="profile-email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" /></div></div><Button onClick={() => void saveProfile()} disabled={saving} className="w-full bg-red-500 text-white hover:bg-red-600">{saving ? "保存中…" : "保存资料"}</Button></div></DialogContent>
			</Dialog>

			<Dialog open={avatarOpen} onOpenChange={setAvatarOpen}>
				<DialogContent><DialogHeader><DialogTitle>更新头像</DialogTitle><DialogDescription>建议上传正方形图片，文件大小不超过 2MB。</DialogDescription></DialogHeader><div className="py-4 text-center"><div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-red-400 to-red-600 text-3xl font-bold text-white">{user?.avatar_url ? <img src={user.avatar_url} alt="当前头像" className="h-full w-full object-cover" /> : avatarText}</div><input ref={fileInputRef} type="file" accept="image/*" onChange={uploadAvatar} className="hidden" /><Button onClick={() => fileInputRef.current?.click()} disabled={saving} className="mt-5 bg-red-500 text-white hover:bg-red-600"><Camera className="mr-1.5 h-4 w-4" />选择图片</Button></div></DialogContent>
			</Dialog>
		</div>
	)
}
