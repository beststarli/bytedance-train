"use client"

import React, { useEffect, useRef, useState } from "react"
import {
	ArrowRight,
	BarChart3,
	Bookmark,
	Camera,
	FileText,
	FilePenLine,
	FolderOpen,
	Heart,
	Lightbulb,
	Mail,
	Pencil,
	Phone,
	ShieldCheck,
} from "lucide-react"
import { api } from "@/api/api"
import { useAuthStore } from "@/store/userStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { resolveAssetUrl } from "@/lib/asset-url"
import { toast } from "sonner"
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
	stats: { works: number; views: number; published: number; quality: number; likes: number; favorites: number }
	latestWorks: Array<{ id: string; title: string; content: string; created_at: string; view_count: number; like_count: number; favorite_count: number }>
	reactions: Array<{ id: string; title: string; content: string; view_count: number; type: "like" | "favorite" }>
}

interface LatestPerformance {
	work: DashboardData["latestWorks"][number] | null
	points: Array<{ date: string; views: number; likes: number; favorites: number }>
}

const AVATAR_CROP_SIZE = 240

function articleCover(content: string) {
	return content.match(/!\[[^\]]*\]\(((?:https?:\/\/|\/)[^)\s]+)\)/i)?.[1] || ""
}

function WorksChart({ points }: { points: LatestPerformance["points"] }) {
	const chartRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!chartRef.current || !points.length) return
		let disposed = false
		let resizeObserver: ResizeObserver | undefined
		let chart: { setOption: (option: object) => void; resize: () => void; dispose: () => void } | undefined
		void import("echarts").then((echarts) => {
			if (disposed || !chartRef.current) return
			chart = echarts.init(chartRef.current)
			chart.setOption({
				color: ["#f5222d", "#ff8a65", "#f3b229"],
				tooltip: { trigger: "axis" },
				legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 6, textStyle: { color: "#667085", fontSize: 11 } },
				grid: { left: 42, right: 18, top: 42, bottom: 48 },
				xAxis: {
					type: "category",
					data: points.map((point) => point.date.slice(5).replace("-", "/")),
					axisLabel: { color: "#8a94a6", fontSize: 10, interval: points.length > 14 ? 4 : 0 },
					axisLine: { lineStyle: { color: "#e7eaf0" } },
				},
				yAxis: {
					type: "value",
					minInterval: 1,
					axisLabel: { color: "#8a94a6", fontSize: 10 },
					splitLine: { lineStyle: { color: "#f0f2f5", type: "dashed" } },
				},
				series: [
					{ name: "阅读量", type: "line", smooth: true, symbolSize: 5, data: points.map((point) => point.views), areaStyle: { color: "rgba(245,34,45,.07)" } },
					{ name: "点赞量", type: "line", smooth: true, symbolSize: 5, data: points.map((point) => point.likes) },
					{ name: "收藏量", type: "line", smooth: true, symbolSize: 5, data: points.map((point) => point.favorites) },
				],
			})
			resizeObserver = new ResizeObserver(() => chart?.resize())
			resizeObserver.observe(chartRef.current)
		})
		return () => {
			disposed = true
			resizeObserver?.disconnect()
			chart?.dispose()
		}
	}, [points])

	if (!points.length) return <div className="flex h-64 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">发布文章后将在这里展示数据趋势</div>
	return <div ref={chartRef} className="h-72 w-full" role="img" aria-label="最新发布文章阅读、点赞与收藏数据图表" />
}

export default function UserPage({ onNavigate }: UserPageProps) {
	const { user, setAuth, token } = useAuthStore()
	const [profileOpen, setProfileOpen] = useState(false)
	const [avatarOpen, setAvatarOpen] = useState(false)
	const [nickname, setNickname] = useState(user?.nickname || "")
	const [email, setEmail] = useState(user?.email || "")
	const [newPassword, setNewPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [saving, setSaving] = useState(false)
	const [dashboard, setDashboard] = useState<DashboardData | null>(null)
	const [chartRange, setChartRange] = useState<7 | 30>(7)
	const [latestPerformance, setLatestPerformance] = useState<LatestPerformance>({ work: null, points: [] })
	const [interactionType, setInteractionType] = useState<"like" | "favorite">("like")
	const [avatarSource, setAvatarSource] = useState("")
	const [avatarImageSize, setAvatarImageSize] = useState({ width: 0, height: 0 })
	const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 })
	const fileInputRef = useRef<HTMLInputElement>(null)
	const cropDragRef = useRef<{ pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null)

	useEffect(() => {
		api<DashboardData>("/api/content/creator-dashboard")
			.then(setDashboard)
			.catch(() => setDashboard(null))
	}, [])

	useEffect(() => {
		api<LatestPerformance>(`/api/content/creator-dashboard/latest-performance?days=${chartRange}`)
			.then(setLatestPerformance)
			.catch(() => setLatestPerformance({ work: null, points: [] }))
	}, [chartRange])

	const saveProfile = async () => {
		if (newPassword && newPassword !== confirmPassword) {
			toast.error("两次输入的密码不一致")
			return
		}
		setSaving(true)
		try {
			const data = await api<{ user: typeof user }>("/api/auth/profile", {
				method: "PUT",
				body: JSON.stringify({ nickname, email }),
			})
			if (newPassword) {
				await api("/api/auth/password", {
					method: "PUT",
					body: JSON.stringify({ new_password: newPassword, confirm_password: confirmPassword }),
				})
			}
			if (data.user && token) setAuth(data.user, token)
			setProfileOpen(false)
			setNewPassword("")
			setConfirmPassword("")
			toast.success("个人资料已更新")
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "保存失败")
		} finally {
			setSaving(false)
		}
	}

	const chooseAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (!file) return
		if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
			toast.error("请选择不超过 2MB 的图片")
			return
		}
		try {
			const image = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader()
				reader.onload = () => resolve(reader.result as string)
				reader.onerror = reject
				reader.readAsDataURL(file)
			})
			setAvatarSource(image)
			setAvatarImageSize({ width: 0, height: 0 })
			setCropOffset({ x: 0, y: 0 })
		} catch {
			toast.error("无法读取这张图片")
		} finally {
			event.target.value = ""
		}
	}

	const avatarScale = avatarImageSize.width && avatarImageSize.height
		? Math.max(AVATAR_CROP_SIZE / avatarImageSize.width, AVATAR_CROP_SIZE / avatarImageSize.height)
		: 1
	const renderedAvatarSize = {
		width: avatarImageSize.width * avatarScale,
		height: avatarImageSize.height * avatarScale,
	}
	const clampCropOffset = (x: number, y: number) => ({
		x: Math.min(Math.max(x, (AVATAR_CROP_SIZE - renderedAvatarSize.width) / 2), (renderedAvatarSize.width - AVATAR_CROP_SIZE) / 2),
		y: Math.min(Math.max(y, (AVATAR_CROP_SIZE - renderedAvatarSize.height) / 2), (renderedAvatarSize.height - AVATAR_CROP_SIZE) / 2),
	})

	const confirmAvatar = async () => {
		if (!avatarSource || !avatarImageSize.width) return
		setSaving(true)
		try {
			const imageElement = await new Promise<HTMLImageElement>((resolve, reject) => {
				const image = new Image()
				image.onload = () => resolve(image)
				image.onerror = reject
				image.src = avatarSource
			})
			const canvas = document.createElement("canvas")
			canvas.width = 512
			canvas.height = 512
			const context = canvas.getContext("2d")
			if (!context) throw new Error("浏览器不支持图片裁剪")
			const renderedLeft = (AVATAR_CROP_SIZE - renderedAvatarSize.width) / 2 + cropOffset.x
			const renderedTop = (AVATAR_CROP_SIZE - renderedAvatarSize.height) / 2 + cropOffset.y
			const sourceX = -renderedLeft / avatarScale
			const sourceY = -renderedTop / avatarScale
			const sourceSize = AVATAR_CROP_SIZE / avatarScale
			context.drawImage(imageElement, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512)
			const croppedImage = canvas.toDataURL("image/jpeg", 0.9)
			const data = await api<{ user: typeof user }>("/api/auth/avatar", {
				method: "POST",
				body: JSON.stringify({ image: croppedImage }),
			})
			if (data.user && token) setAuth(data.user, token)
			setAvatarOpen(false)
			setAvatarSource("")
			toast.success("头像已更新")
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "上传失败")
		} finally {
			setSaving(false)
		}
	}

	const avatarText = user?.nickname?.charAt(0) || user?.phone?.slice(-1) || "?"
	const stats = dashboard?.stats || { works: 0, views: 0, published: 0, quality: 0, likes: 0, favorites: 0 }
	const latestWork = latestPerformance.work

	return (
		<div className="enter-workspace flex-1 overflow-y-auto bg-muted/20 px-16 py-8">
			<div className="mx-auto space-y-5">
				<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
					<div className="space-y-5">
						<section className="workspace-card relative overflow-hidden rounded-md bg-white p-6 shadow-sm sm:p-8">
							<div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
								<div className="flex items-center gap-5">
									<button type="button" onClick={() => setAvatarOpen(true)} className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-red-400 to-red-600 text-2xl font-bold text-white">
										<span className="absolute inset-0 flex items-center justify-center">{avatarText}</span>
										{user?.avatar_url && <img src={resolveAssetUrl(user.avatar_url)} alt="头像" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} />}
										<span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100"><Camera className="h-5 w-5" /></span>
									</button>
									<div>
										<div className="flex items-center gap-2"><h1 className="text-xl font-bold">{user?.nickname || "未设置昵称"}</h1><span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">创作者认证</span></div>
										<p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {user?.phone}</p>
										<div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span><strong className="mr-1 text-foreground">{stats.published}</strong>已发布</span><span><strong className="mr-1 text-foreground">{stats.works}</strong>作品</span><span><strong className="mr-1 text-foreground">{stats.views}</strong>阅读</span><span><strong className="mr-1 text-foreground">{stats.likes}</strong>获赞</span><span><strong className="mr-1 text-foreground">{stats.favorites}</strong>获收藏</span></div>
									</div>
								</div>
								<Button onClick={() => setProfileOpen(true)} className="bg-red-500 text-white hover:bg-red-600"><Pencil className="mr-1.5 h-4 w-4" />修改资料</Button>
							</div>
						</section>

						<section className="workspace-card rounded-md bg-white p-5 shadow-sm sm:p-6">
							<div className="mb-5"><h2 className="font-bold">新的创作</h2><p className="mt-1 text-xs text-muted-foreground">选择下一步，直接进入对应工作流</p></div>
							<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
								{[
									{ title: "作品管理", desc: "查看、编辑与管理已发布作品", icon: FileText, tone: "bg-red-50 text-red-500", target: "works" },
									{ title: "素材管理", desc: "整理图片、视频与创作参考", icon: FolderOpen, tone: "bg-blue-50 text-blue-600", target: "materials" },
									{ title: "审核作品", desc: "检查作品状态与内容安全结果", icon: ShieldCheck, tone: "bg-emerald-50 text-emerald-600", target: "review" },
									{ title: "创作文章", desc: "进入 AI 协作与内容写作台", icon: FilePenLine, tone: "bg-amber-50 text-amber-600", target: "create" },
								].map((item) => (
									<button key={item.title} type="button" onClick={() => onNavigate?.(item.target)} className="focus-red group rounded-md border p-5 text-left transition-colors hover:border-red-200">
										<span className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.tone}`}><item.icon className="h-5 w-5" /></span>
										<div className="mt-6 flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold">{item.title}</h3><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.desc}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-red-500" /></div>
									</button>
								))}
							</div>
						</section>

						<section className="workspace-card rounded-md bg-white p-5 shadow-sm sm:p-6">
							<div className="mb-5 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-red-500" /><div><h2 className="font-bold">作品数据看板</h2><p className="mt-1 text-xs text-muted-foreground">最新发布文章的阅读与互动趋势</p></div></div><div className="flex rounded-md bg-muted p-0.5 text-xs"><button type="button" onClick={() => setChartRange(7)} className={`rounded px-2.5 py-1 ${chartRange === 7 ? "bg-white text-red-500 shadow-sm" : "text-muted-foreground"}`}>近7天</button><button type="button" onClick={() => setChartRange(30)} className={`rounded px-2.5 py-1 ${chartRange === 30 ? "bg-white text-red-500 shadow-sm" : "text-muted-foreground"}`}>近30天</button></div></div>
							<div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
								<div className="relative min-h-72 overflow-hidden rounded-md border bg-muted">
									{latestWork && articleCover(latestWork.content) ? <img src={articleCover(latestWork.content)} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">最新作品暂无配图</div>}
									<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-16 text-white"><div className="text-[10px] text-white/65">最新发布</div><h3 className="mt-1 line-clamp-2 text-sm font-semibold">{latestWork?.title || "暂无已发布作品"}</h3></div>
								</div>
								<div className="min-w-0">
									<WorksChart points={latestPerformance.points} />
									<div className="grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-4">
										{[
											["作品", latestWork ? 1 : 0],
											["阅读", latestWork?.view_count || 0],
											["获赞", latestWork?.like_count || 0],
											["收藏", latestWork?.favorite_count || 0],
										].map(([label, value]) => <div key={label} className="rounded-md border bg-muted/35 px-3 py-2"><span className="text-[10px] text-muted-foreground">{label}</span><strong className="mt-1 block text-lg">{value}</strong></div>)}
									</div>
								</div>
							</div>
						</section>

						<section className="workspace-card rounded-md bg-white p-5 shadow-sm sm:p-6">
							<div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">我的互动</h2><p className="mt-1 text-xs text-muted-foreground">收藏与点赞过的文章</p></div><button type="button" onClick={() => setInteractionType((type) => type === "like" ? "favorite" : "like")} className="flex items-center gap-2 rounded-full bg-muted px-1 py-1 text-xs"><span className={`rounded-full px-3 py-1 ${interactionType === "like" ? "bg-white text-red-500 shadow-sm" : "text-muted-foreground"}`}>点赞</span><span className={`rounded-full px-3 py-1 ${interactionType === "favorite" ? "bg-white text-amber-600 shadow-sm" : "text-muted-foreground"}`}>收藏</span></button></div>
							{dashboard?.reactions?.some((item) => item.type === interactionType) ? <div className="grid gap-2 md:grid-cols-4">{dashboard.reactions.filter((item) => item.type === interactionType).map((item) => <div key={`${item.id}-${item.type}`} className="flex overflow-hidden rounded-md border"><div className="h-full w-36 shrink-0 bg-muted">{articleCover(item.content) ? <img src={articleCover(item.content)} alt="" className="h-full w-full object-fill" /> : <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">无配图</div>}</div><div className="min-w-0 p-3"><div className="flex items-center gap-1 text-[10px] text-muted-foreground">{item.type === "like" ? <Heart className="h-3 w-3 fill-red-500 text-red-500" /> : <Bookmark className="h-3 w-3 fill-amber-400 text-amber-500" />}{item.type === "like" ? "已点赞" : "已收藏"}</div><h3 className="mt-2 line-clamp-2 text-sm font-semibold">{item.title}</h3><p className="mt-1 text-[10px] text-muted-foreground">阅读 {item.view_count || 0}</p></div></div>)}</div> : <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">还没有{interactionType === "like" ? "点赞" : "收藏"}文章</div>}
						</section>
					</div>

					<aside className="workspace-card rounded-md bg-white p-5 shadow-sm xl:sticky">
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
				<DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>修改个人资料</DialogTitle><DialogDescription>昵称不能与其他用户重复；保持原昵称也可以修改邮箱或密码。</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div><Label htmlFor="profile-name">新昵称</Label><Input id="profile-name" value={nickname} onChange={(e) => setNickname(e.target.value)} className="mt-1.5" /></div><div><Label htmlFor="profile-email">邮箱</Label><div className="relative mt-1.5"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="profile-email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" /></div></div><div className="space-y-3"><div><Label htmlFor="new-password">新密码</Label><Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 6 位" className="mt-1.5" /></div><div><Label htmlFor="confirm-password">确认密码</Label><Input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入" className="mt-1.5" /></div></div><Button onClick={() => void saveProfile()} disabled={saving || !nickname.trim() || (!!newPassword && (newPassword.length < 6 || newPassword !== confirmPassword))} className="w-full bg-red-500 text-white hover:bg-red-600">{saving ? "保存中…" : "保存资料"}</Button></div></DialogContent>
			</Dialog>

			<Dialog open={avatarOpen} onOpenChange={(open) => { setAvatarOpen(open); if (!open) setAvatarSource("") }}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>更新头像</DialogTitle>
						<DialogDescription>{avatarSource ? "拖动图片，调整圆圈内最终显示的范围。" : "选择一张不超过 2MB 的图片，然后调整头像范围。"}</DialogDescription>
					</DialogHeader>
					<div className="py-3 text-center">
						{avatarSource ? (
							<>
								<div
									className="relative mx-auto h-[240px] w-[240px] touch-none overflow-hidden rounded-full bg-muted shadow-[0_0_0_5px_rgba(245,34,45,.10)] cursor-grab active:cursor-grabbing"
									onPointerDown={(event) => {
										event.currentTarget.setPointerCapture(event.pointerId)
										cropDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: cropOffset.x, offsetY: cropOffset.y }
									}}
									onPointerMove={(event) => {
										const drag = cropDragRef.current
										if (!drag || drag.pointerId !== event.pointerId) return
										setCropOffset(clampCropOffset(drag.offsetX + event.clientX - drag.startX, drag.offsetY + event.clientY - drag.startY))
									}}
									onPointerUp={(event) => {
										if (cropDragRef.current?.pointerId === event.pointerId) cropDragRef.current = null
									}}
								>
									<img
										src={avatarSource}
										alt=""
										draggable={false}
										onLoad={(event) => {
											setAvatarImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
											setCropOffset({ x: 0, y: 0 })
										}}
										className="pointer-events-none absolute max-w-none select-none"
										style={{
											width: renderedAvatarSize.width || "100%",
											height: renderedAvatarSize.height || "100%",
											left: `calc(50% - ${renderedAvatarSize.width / 2}px + ${cropOffset.x}px)`,
											top: `calc(50% - ${renderedAvatarSize.height / 2}px + ${cropOffset.y}px)`,
										}}
									/>
									<div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)]" />
								</div>
								<p className="mt-3 text-xs text-muted-foreground">按住图片拖动，圆圈内区域将作为新头像</p>
								<div className="mt-5 flex justify-center gap-2">
									<Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={saving}>重新选择</Button>
									<Button onClick={() => void confirmAvatar()} disabled={saving || !avatarImageSize.width} className="bg-red-500 text-white hover:bg-red-600">{saving ? "上传中…" : "确认使用"}</Button>
								</div>
							</>
						) : (
							<>
								<div className="relative mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-red-400 to-red-600 text-3xl font-bold text-white"><span>{avatarText}</span>{user?.avatar_url && <img src={resolveAssetUrl(user.avatar_url)} alt="当前头像" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} />}</div>
								<Button onClick={() => fileInputRef.current?.click()} disabled={saving} className="mt-5 bg-red-500 text-white hover:bg-red-600"><Camera className="mr-1.5 h-4 w-4" />选择图片</Button>
							</>
						)}
						<input ref={fileInputRef} type="file" accept="image/*" onChange={chooseAvatar} className="hidden" />
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
