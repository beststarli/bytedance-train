"use client"

import React, { useEffect, useState } from "react"
import {
	ArrowRight,
	Bookmark,
	ChevronDown,
	Eye,
	FileText,
	Flame,
	Heart,
	Plus,
	SlidersHorizontal,
} from "lucide-react"
import { api } from "@/api/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type FeedSort = "new" | "hot" | "likes"

const feedSortLabels: Record<FeedSort, string> = {
	new: "最新发布",
	hot: "最多浏览",
	likes: "最多点赞",
}

interface FeedItem {
	id: string
	title: string
	content: string
	quality_score: number | null
	view_count: number
	created_at: string
	nickname: string
	like_count?: number
	favorite_count?: number
	liked?: boolean
	favorited?: boolean
}

interface HotNewsItem {
	title: string
	description?: string
	url: string
	publishedAt?: string
	source?: { name?: string }
}

interface MainPageProps {
	onNavigate?: (menu: string) => void
	mode?: "inspiration"
}

function getArticlePreview(content: string) {
	const markdownImage = content.match(/!\[[^\]]*\]\(((?:https?:\/\/|\/)[^)\s]+)\)/i)
	const directImage = content.match(/(?:https?:\/\/|\/)[^\s)]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s)]*)?/i)
	const image = markdownImage?.[1] || directImage?.[0] || null
	const text = content
		.replace(/!\[[^\]]*\]\([^)]+\)/g, "")
		.replace(/(?:https?:\/\/|\/)[^\s)]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s)]*)?/gi, "")
		.replace(/[#>*_`-]/g, "")
		.replace(/\s+/g, " ")
		.trim()
	return { image, text }
}

function ArticleMarkdown({ content }: { content: string }) {
	return (
		<div className="space-y-4 text-justify text-[16px] leading-8 text-foreground/90">
			{content.split("\n").map((line, index) => {
				const image = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
				if (image) {
					return (
						<figure key={index} className="flex flex-col items-center">
							<img src={image[2]} alt="" className="max-h-[40vh] max-w-[50%] rounded-md object-contain" />
						</figure>
					)
				}
				if (line.startsWith("### ")) return <h3 key={index} className="pt-2 text-lg font-bold">{line.slice(4)}</h3>
				if (line.startsWith("## ")) return <h2 key={index} className="pt-2 text-xl font-bold">{line.slice(3)}</h2>
				if (line.startsWith("# ")) return <h1 key={index} className="pt-2 text-2xl font-bold">{line.slice(2)}</h1>
				if (/^[-*]\s/.test(line)) return <div key={index} className="flex gap-2"><span className="text-red-500">•</span><span>{line.slice(2)}</span></div>
				// if (!line.trim()) return <div key={index} className="h-2" />
				return <p key={index}>{line}</p>
			})}
		</div>
	)
}

function ContentHome({ onNavigate }: Pick<MainPageProps, "onNavigate">) {
	const [articles, setArticles] = useState<FeedItem[]>([])
	const [loading, setLoading] = useState(true)
	const [sort, setSort] = useState<FeedSort>("new")
	const [selectedArticle, setSelectedArticle] = useState<FeedItem | null>(null)
	const [hotNews, setHotNews] = useState<HotNewsItem[]>([])
	const [newsConfigured, setNewsConfigured] = useState(true)
	const [hotNewsLoading, setHotNewsLoading] = useState(true)

	useEffect(() => {
		let cancelled = false
		setLoading(true)
		api<{ works: FeedItem[] }>(`/api/content/feed?sort=${sort}&limit=10&offset=0`)
			.then((data) => {
				if (!cancelled) setArticles(data.works)
			})
			.catch(() => {
				if (!cancelled) setArticles([])
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [sort])

	useEffect(() => {
		api<{ articles: HotNewsItem[]; configured: boolean }>("/api/content/hot-news", { cache: "no-store" })
			.then((data) => {
				setHotNews(data.articles)
				setNewsConfigured(data.configured)
			})
			.catch(() => setHotNews([]))
			.finally(() => setHotNewsLoading(false))
	}, [])

	const openArticle = async (article: FeedItem) => {
		setSelectedArticle(article)
		try {
			const data = await api<{ work: FeedItem }>(`/api/content/feed/${article.id}`)
			setSelectedArticle(data.work)
			setArticles((items) => items.map((item) => item.id === data.work.id ? data.work : item))
		} catch {
			// 列表摘要仍可作为降级详情展示
		}
	}

	const toggleReaction = async (type: "like" | "favorite") => {
		if (!selectedArticle) return
		try {
			const data = await api<{ active: boolean }>(`/api/content/feed/${selectedArticle.id}/reactions`, {
				method: "POST",
				body: JSON.stringify({ type }),
			})
			setSelectedArticle((current) => current ? {
				...current,
				[type === "like" ? "liked" : "favorited"]: data.active,
				[type === "like" ? "like_count" : "favorite_count"]: Math.max(0, Number(current[type === "like" ? "like_count" : "favorite_count"] || 0) + (data.active ? 1 : -1)),
			} : current)
		} catch {
			// 未登录时由统一认证流程处理，详情保持可阅读
		}
	}

	const toggleArticleReaction = async (article: FeedItem, type: "like" | "favorite") => {
		try {
			const data = await api<{ active: boolean }>(`/api/content/feed/${article.id}/reactions`, {
				method: "POST",
				body: JSON.stringify({ type }),
			})
			setArticles((items) => items.map((item) => item.id === article.id ? {
				...item,
				[type === "like" ? "liked" : "favorited"]: data.active,
				[type === "like" ? "like_count" : "favorite_count"]: Math.max(0, Number(item[type === "like" ? "like_count" : "favorite_count"] || 0) + (data.active ? 1 : -1)),
			} : item))
		} catch {
			// 未登录时不改变本地互动状态
		}
	}

	const hotArticles = [...articles]
		.sort((a, b) => Number(b.view_count || 0) - Number(a.view_count || 0))
		.slice(0, 5)

	return (
		<div className="enter-workspace flex-1 xl:h-[calc(100dvh-72px)] xl:overflow-hidden">
			<div className="mx-auto px-16 pt-8 xl:flex xl:h-full xl:flex-col">
				<section className="mb-2 flex flex-col items-start justify-between gap-4 border-b pb-4 sm:flex-row sm:items-end">
					<div>
						<div className="workspace-label mb-2">Content discovery</div>
						<h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-[28px]">发现值得阅读的好内容</h1>
						<p className="mt-1.5 text-sm text-muted-foreground">浏览最新发布文章，从热点与灵感中找到下一个创作方向。</p>
					</div>
					<Button
						onClick={() => onNavigate?.("create")}
						className="h-10 rounded-lg bg-[#f5222d] px-4 text-white hover:bg-[#df1722]"
					>
						<Plus className="mr-1.5 h-4 w-4" /> 去创作
					</Button>
				</section>

				<div className="grid min-h-0 flex-1 grid-cols-12 gap-5">
					<section className="col-span-12 flex min-h-0 flex-col overflow-hidden xl:col-span-9">
						<div className="flex items-center justify-between px-4 py-4">
							<div className="flex items-center gap-2">
								<h2 className="font-bold">{feedSortLabels[sort]}</h2>
								<span className="text-xs text-muted-foreground">{articles.length} 篇内容</span>
							</div>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" className="h-8 cursor-pointer bg-card gap-1.5 rounded-md px-2.5 text-xs font-medium">
										<SlidersHorizontal className="h-3.5 w-3.5" />
										筛选
										<span className="hidden text-muted-foreground sm:inline">· {feedSortLabels[sort]}</span>
										<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-36">
									<DropdownMenuRadioGroup value={sort} onValueChange={(value) => setSort(value as FeedSort)}>
										<DropdownMenuRadioItem value="new" className="cursor-pointer">最新发布</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="hot" className="cursor-pointer">最多浏览</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="likes" className="cursor-pointer">最多点赞</DropdownMenuRadioItem>
									</DropdownMenuRadioGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>

						{loading ? (
							<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">正在加载文章…</div>
						) : articles.length === 0 ? (
							<div className="flex flex-1 flex-col items-center justify-center text-center">
								<FileText className="mx-auto h-7 w-7 text-muted-foreground/50" />
								<h2 className="mt-3 text-sm font-semibold">还没有已发布文章</h2>
								<p className="mt-1 text-xs text-muted-foreground">发布后的内容会展示在首页。</p>
							</div>
						) : (
							<div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 sm:px-4 ">
								{articles.map((article) => (
									<article key={article.id} onClick={() => void openArticle(article)} className="homepage-article-card group cursor-pointer rounded-lg bg-card p-3 shadow-sm transition-colors hover:bg-red-50/10 sm:p-4">
										<div className="flex gap-4">
											{getArticlePreview(article.content).image ? (
												<img src={getArticlePreview(article.content).image!} alt="" className="h-28 w-36 shrink-0 rounded-lg object-cover sm:h-32 sm:w-44" />
											) : (
												<div className="flex h-28 w-36 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-xs text-muted-foreground sm:h-32 sm:w-44">无配图</div>
											)}
											<div className="flex min-w-0 flex-1 flex-col">
												<h2 className="line-clamp-1 text-lg font-bold transition-colors group-hover:text-red-600">{article.title}</h2>
												<p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{getArticlePreview(article.content).text || "暂无正文内容"}…</p>
												<div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-3 text-[11px] text-muted-foreground">
													<span className="font-medium text-foreground">{article.nickname || "创作者"}</span>
													<span>{formatDate(article.created_at)}</span>
													<span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{article.view_count || 0}</span>
													<button type="button" onClick={(event) => { event.stopPropagation(); void toggleArticleReaction(article, "like") }} className={cn("flex items-center gap-1 hover:text-red-500", article.liked && "text-red-500")}><Heart className={cn("h-3.5 w-3.5", article.liked && "fill-current")} />{article.like_count || 0}</button>
													<button type="button" onClick={(event) => { event.stopPropagation(); void toggleArticleReaction(article, "favorite") }} className={cn("flex items-center gap-1 hover:text-amber-600", article.favorited && "text-amber-600")}><Bookmark className={cn("h-3.5 w-3.5", article.favorited && "fill-current")} />{article.favorite_count || 0}</button>
												</div>
											</div>
										</div>
									</article>
								))}
							</div>
						)}
					</section>

					<aside className="col-span-12 min-h-0 overflow-y-auto xl:col-span-3">
						<section className="px-4 pt-4">
							<div className="mb-3 flex items-center justify-between">
								<div>
									<h2 className="text-sm font-bold">当下热点</h2>
									<p className="text-[10px] text-muted-foreground">实时新闻选题雷达</p>
								</div>
								<span className="h-2 w-2 rounded-full bg-red-500" />
							</div>
							<div className="min-h-[170px]">
								{hotNewsLoading ? (
									<div className="space-y-1" aria-label="正在加载热点新闻">
										{Array.from({ length: 5 }).map((_, index) => (
											<div key={index} className="flex h-8 items-center gap-2.5 px-1">
												<span className="h-3 w-4 animate-pulse rounded bg-muted" />
												<span className="min-w-0 flex-1">
													<span className="block h-3 animate-pulse rounded bg-muted" style={{ width: `${88 - index * 7}%` }} />
													<span className="mt-1 block h-2 w-16 animate-pulse rounded bg-muted/70" />
												</span>
											</div>
										))}
									</div>
								) : hotNews.length ? (
									<div>{hotNews.slice(0, 5).map((news, index) => <a key={news.url} href={news.url} target="_blank" rel="noreferrer" className="group flex gap-2.5 rounded-lg px-1 py-1.5 hover:bg-muted/60"><span className="text-xs font-bold text-red-500">{String(index + 1).padStart(2, "0")}</span><span><span className="line-clamp-1 text-xs font-medium leading-5 group-hover:text-red-600">{news.title}</span><span className="block text-[10px] text-muted-foreground">{news.source?.name || "新闻来源"}</span></span></a>)}</div>
								) : (
									<div className="flex min-h-[170px] items-center justify-center rounded-lg border border-dashed px-3 text-center text-xs text-muted-foreground">{newsConfigured ? "热点新闻暂时不可用" : "配置 GNEWS_API_KEY 后显示实时热点"}</div>
								)}
							</div>
						</section>
						<section className="px-4 pt-4">
							<div className="mb-3 flex items-center gap-2">
								<div>
									<h2 className="text-sm font-bold">爆文榜单</h2>
									<p className="text-[10px] text-muted-foreground">按阅读热度实时排序</p>
								</div>
							</div>
							<div className="min-h-[180px]">
								{loading ? Array.from({ length: 5 }).map((_, index) => (
									<div key={index} className="flex h-9 items-center gap-2.5 px-1">
										<span className="h-3 w-4 animate-pulse rounded bg-muted" />
										<span className="flex-1"><span className="block h-3 animate-pulse rounded bg-muted" style={{ width: `${90 - index * 6}%` }} /><span className="mt-1 block h-2 w-20 animate-pulse rounded bg-muted/70" /></span>
									</div>
								)) : Array.from({ length: 5 }).map((_, index) => {
									const article = hotArticles[index]
									return article ? (
										<button
											key={article.id}
											type="button"
											onClick={() => void openArticle(article)}
											className="cursor-pointer focus-red group flex h-9 w-full items-start gap-2.5 rounded-lg px-1 py-1 text-left hover:bg-muted/60"
										>
											<span className={cn("w-5 text-sm font-black italic", index < 3 ? "text-red-500" : "text-muted-foreground")}>{index + 1}</span>
											<span className="min-w-0 flex-1">
												<span className="line-clamp-1 text-xs font-medium leading-5 group-hover:text-red-600">{article.title}</span>
												<div className="flex items-center gap-1 text-[10px] text-muted-foreground">
													<Flame className="h-3 w-3" />
													{Number(article.view_count || 0).toLocaleString("zh-CN")} 热度
												</div>
											</span>
											<div className="group-hover:text-red-600 self-center flex items-center text-xs font-bold opacity-0 transition-opacity duration-200 group-hover:opacity-100">
												去看 →
											</div>
										</button>
									) : <div key={`empty-${index}`} className="h-9" aria-hidden="true" />
								})}
							</div>
						</section>

					</aside>
				</div>
			</div>
			<Dialog open={!!selectedArticle} onOpenChange={(open) => !open && setSelectedArticle(null)}>
				<DialogContent className="flex gap-0 max-h-[92vh] w-[94vw] flex-col overflow-hidden p-0 sm:max-w-6xl">
					{selectedArticle && <>
						<DialogHeader className="shrink-0 border-b px-7 pb-5 pt-7 sm:px-10">
							<DialogTitle className="pr-8 text-2xl leading-9">{selectedArticle.title}</DialogTitle>
							<DialogDescription>{selectedArticle.nickname || "创作者"} · {formatDate(selectedArticle.created_at)} · 阅读 {selectedArticle.view_count || 0}</DialogDescription>
						</DialogHeader>
						<div className="min-h-0 flex-1 overflow-y-auto scrollBar-hidden px-7 py-4 sm:px-10">
							<ArticleMarkdown content={selectedArticle.content} />
						</div>
						<div className="flex shrink-0 items-center gap-3 border-t bg-background px-7 py-4 sm:px-10">
							<Button variant="outline" onClick={() => void toggleReaction("like")} className={cn(selectedArticle.liked && "border-red-200 bg-red-50 text-red-600")}><Heart className={cn("mr-1.5 h-4 w-4", selectedArticle.liked && "fill-current")} />点赞 {selectedArticle.like_count || 0}</Button>
							<Button variant="outline" onClick={() => void toggleReaction("favorite")} className={cn(selectedArticle.favorited && "border-amber-200 bg-amber-50 text-amber-700")}><Bookmark className={cn("mr-1.5 h-4 w-4", selectedArticle.favorited && "fill-current")} />收藏 {selectedArticle.favorite_count || 0}</Button>
						</div>
					</>}
				</DialogContent>
			</Dialog>
		</div>
	)
}

function formatDate(date: string) {
	return new Date(date).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
}

function InspirationView({ onNavigate }: Pick<MainPageProps, "onNavigate">) {
	return (
		<div className="enter-workspace flex-1 overflow-y-auto px-16 py-8">
			<div className="mx-auto">
				<div className="mb-7">
					<div className="workspace-label mb-2">Inspiration radar</div>
					<h1 className="text-2xl font-bold">创作灵感</h1>
					<p className="mt-1.5 text-sm text-muted-foreground">热点只是一种输入。把趋势转化成与你擅长领域相关的选题。</p>
				</div>
				<div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
					{["AI 与效率", "城市生活", "职场成长", "数码体验", "个人成长", "内容创作"].map((item, index) => (
						<button key={item} onClick={() => onNavigate?.("create")} className="workspace-card focus-red group p-5 text-left hover:border-red-200">
							<div className="mb-8 flex items-center justify-between">
								<span className="workspace-label">灵感 {String(index + 1).padStart(2, "0")}</span>
								<Flame className={cn("h-4 w-4", index < 2 ? "text-red-500" : "text-muted-foreground")} />
							</div>
							<h2 className="font-bold">{item}</h2>
							<p className="mt-2 text-xs leading-5 text-muted-foreground">相关讨论持续增长，适合结合个人经验产出观点型内容。</p>
							<div className="mt-5 flex items-center gap-1 text-xs font-medium text-red-500 opacity-0 transition-opacity group-hover:opacity-100">
								用这个方向创作 <ArrowRight className="h-3.5 w-3.5" />
							</div>
						</button>
					))}
				</div>
			</div>
		</div>
	)
}

export default function MainPage({ onNavigate, mode }: MainPageProps) {
	if (mode === "inspiration") return <InspirationView onNavigate={onNavigate} />
	return <ContentHome onNavigate={onNavigate} />
}
