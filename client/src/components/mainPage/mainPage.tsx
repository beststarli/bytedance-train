"use client"

import Image from "next/image"
import React, { useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
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
import { FeedSort, getFeed, getFeedWork, toggleFeedReaction } from "@/api/feed"
import { getHotNews } from "@/api/discovery"
import { cn, resolveAssetUrl } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { FeedItem, HomeInitialData, HotNewsItem } from "@/types/home"

const feedSortLabels: Record<FeedSort, string> = {
	new: "最新发布",
	hot: "最多浏览",
	likes: "最多点赞",
}

const FEED_PAGE_SIZE = 10
const HOT_NEWS_MAX_ATTEMPTS = 3
const HOT_NEWS_RETRY_INTERVAL_MS = 1_000
const HOT_NEWS_ATTEMPT_TIMEOUT_MS = 5_000

interface MainPageProps {
	onNavigate?: (menu: string) => void
	mode?: "inspiration"
	initialData?: HomeInitialData
}

function abortError() {
	return new DOMException("热点新闻请求已取消", "AbortError")
}

function waitForHotNewsRetry(signal: AbortSignal) {
	let timeoutId: number | undefined
	let rejectOnAbort: (() => void) | undefined
	const delay = new Promise<void>((resolve) => {
		timeoutId = window.setTimeout(resolve, HOT_NEWS_RETRY_INTERVAL_MS)
	})
	const aborted = new Promise<never>((_, reject) => {
		if (signal.aborted) return reject(abortError())
		rejectOnAbort = () => reject(abortError())
		signal.addEventListener("abort", rejectOnAbort, { once: true })
	})
	return Promise.race([delay, aborted]).finally(() => {
		if (timeoutId !== undefined) window.clearTimeout(timeoutId)
		if (rejectOnAbort) signal.removeEventListener("abort", rejectOnAbort)
	})
}

async function getHotNewsWithRetry(signal: AbortSignal) {
	let lastError: unknown
	for (let attempt = 1; attempt <= HOT_NEWS_MAX_ATTEMPTS; attempt += 1) {
		if (signal.aborted) throw abortError()
		const attemptController = new AbortController()
		const abortAttempt = () => attemptController.abort()
		signal.addEventListener("abort", abortAttempt, { once: true })
		let timeoutId: number | undefined
		try {
			return await Promise.race([
				getHotNews<{ articles: HotNewsItem[]; configured: boolean }>(attemptController.signal),
				new Promise<never>((_, reject) => {
					timeoutId = window.setTimeout(() => {
						attemptController.abort()
						reject(new Error("热点新闻请求超时"))
					}, HOT_NEWS_ATTEMPT_TIMEOUT_MS)
				}),
			])
		} catch (error) {
			if (signal.aborted) throw abortError()
			lastError = error
			if (attempt < HOT_NEWS_MAX_ATTEMPTS) await waitForHotNewsRetry(signal)
		} finally {
			if (timeoutId !== undefined) window.clearTimeout(timeoutId)
			signal.removeEventListener("abort", abortAttempt)
		}
	}
	throw lastError instanceof Error ? lastError : new Error("热点新闻请求失败")
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
		<div className="text-justify text-[16px] leading-8 text-foreground/90">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={{
					h1: ({ children }) => <h1 className="mb-4 mt-7 text-3xl font-bold leading-tight first:mt-0">{children}</h1>,
					h2: ({ children }) => <h2 className="mb-3 mt-6 text-2xl font-bold leading-tight first:mt-0">{children}</h2>,
					h3: ({ children }) => <h3 className="mb-3 mt-5 text-xl font-semibold leading-tight first:mt-0">{children}</h3>,
					p: ({ children }) => <p className="my-3 whitespace-pre-wrap">{children}</p>,
					strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
					em: ({ children }) => <em className="italic">{children}</em>,
					blockquote: ({ children }) => <blockquote className="my-4 border-l-4 border-red-400 bg-muted/45 px-4 py-1 text-muted-foreground">{children}</blockquote>,
					ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 marker:text-red-500">{children}</ul>,
					ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 marker:font-semibold marker:text-red-500">{children}</ol>,
					li: ({ children }) => <li className="pl-1">{children}</li>,
					a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-red-500 underline decoration-red-300 underline-offset-4 hover:text-red-600">{children}</a>,
					code: ({ children, className }) => <code className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]", className)}>{children}</code>,
					pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-left text-sm leading-6 text-slate-100 [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
					hr: () => <hr className="my-6 border-border" />,
					table: ({ children }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
					th: ({ children }) => <th className="border bg-muted px-3 py-2 font-semibold">{children}</th>,
					td: ({ children }) => <td className="border px-3 py-2">{children}</td>,
					img: ({ src, alt }) => {
						const resolvedSrc = resolveAssetUrl(String(src || ""))
						return <span className="my-5 flex justify-center"><Image src={resolvedSrc} alt={alt || "文章配图"} width={1200} height={800} sizes="(max-width: 768px) 90vw, 50vw" unoptimized={/^https?:\/\//.test(resolvedSrc)} className="h-auto max-h-[55vh] w-auto max-w-full rounded-lg object-contain shadow-sm" /></span>
					},
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	)
}

function ContentHome({ onNavigate, initialData }: Pick<MainPageProps, "onNavigate" | "initialData">) {
	const [articles, setArticles] = useState<FeedItem[]>(initialData?.articles ?? [])
	const [loading, setLoading] = useState(!initialData)
	const [loadingMore, setLoadingMore] = useState(false)
	const [hasMore, setHasMore] = useState(initialData?.articlesHasMore ?? false)
	const [nextOffset, setNextOffset] = useState(initialData?.articles.length ?? 0)
	const [loadMoreFailed, setLoadMoreFailed] = useState(false)
	const [sort, setSort] = useState<FeedSort>("new")
	const [selectedArticle, setSelectedArticle] = useState<FeedItem | null>(null)
	const [hotNews, setHotNews] = useState<HotNewsItem[]>(initialData?.hotNews ?? [])
	const [newsConfigured, setNewsConfigured] = useState(initialData?.newsConfigured ?? false)
	const [newsLoading, setNewsLoading] = useState(true)
	const [newsLoadFailed, setNewsLoadFailed] = useState(false)
	const [hotArticles] = useState<FeedItem[]>(initialData?.hotArticles ?? [])
	const initialSortHandled = useRef(false)
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const loadMoreRef = useRef<HTMLDivElement>(null)
	const loadingMoreRef = useRef(false)
	const requestGenerationRef = useRef(0)

	useEffect(() => {
		const controller = new AbortController()
		setNewsLoading(true)
		setNewsLoadFailed(false)
		getHotNewsWithRetry(controller.signal)
			.then((data) => {
				setHotNews(data.articles || [])
				setNewsConfigured(data.configured)
			})
			.catch((error) => {
				if (error instanceof DOMException && error.name === "AbortError") return
				setNewsLoadFailed(true)
			})
			.finally(() => {
				if (!controller.signal.aborted) setNewsLoading(false)
			})
		return () => controller.abort()
	}, [])

	useEffect(() => {
		if (!initialSortHandled.current && initialData && sort === "new") {
			initialSortHandled.current = true
			return
		}
		let cancelled = false
		const requestGeneration = ++requestGenerationRef.current
		loadingMoreRef.current = false
		setLoading(true)
		setLoadingMore(false)
		setLoadMoreFailed(false)
		getFeed<FeedItem>(sort, FEED_PAGE_SIZE, 0)
			.then((page) => {
				if (cancelled || requestGeneration !== requestGenerationRef.current) return
				setArticles(page.works)
				setHasMore(page.has_more)
				setNextOffset(page.works.length)
				scrollContainerRef.current?.scrollTo({ top: 0 })
			})
			.catch(() => {
				if (cancelled || requestGeneration !== requestGenerationRef.current) return
				setArticles([])
				setHasMore(false)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [initialData, sort])

	const loadMore = useCallback(async () => {
		if (loading || loadingMoreRef.current || !hasMore) return
		loadingMoreRef.current = true
		setLoadingMore(true)
		setLoadMoreFailed(false)
		const requestGeneration = requestGenerationRef.current
		const offset = nextOffset

		try {
			const page = await getFeed<FeedItem>(sort, FEED_PAGE_SIZE, offset)
			if (requestGeneration !== requestGenerationRef.current) return
			setArticles((current) => {
				const existingIds = new Set(current.map((item) => item.id))
				return [...current, ...page.works.filter((item) => !existingIds.has(item.id))]
			})
			setHasMore(page.has_more)
			setNextOffset(offset + page.works.length)
		} catch {
			if (requestGeneration === requestGenerationRef.current) setLoadMoreFailed(true)
		} finally {
			loadingMoreRef.current = false
			if (requestGeneration === requestGenerationRef.current) setLoadingMore(false)
		}
	}, [hasMore, loading, nextOffset, sort])

	useEffect(() => {
		const root = scrollContainerRef.current
		const target = loadMoreRef.current
		if (!root || !target || !hasMore || loading || loadMoreFailed) return

		const observer = new IntersectionObserver(([entry]) => {
			if (entry.isIntersecting) void loadMore()
		}, { root, rootMargin: "300px 0px", threshold: 0 })

		observer.observe(target)
		return () => observer.disconnect()
	}, [hasMore, loadMore, loadMoreFailed, loading])

	const openArticle = async (article: FeedItem) => {
		setSelectedArticle(article)
		try {
			const work = await getFeedWork<FeedItem>(article.id)
			setSelectedArticle(work)
			setArticles((items) => items.map((item) => item.id === work.id ? work : item))
		} catch {
			// 列表摘要仍可作为降级详情展示
		}
	}

	const toggleReaction = async (type: "like" | "favorite") => {
		if (!selectedArticle) return
		try {
			const data = await toggleFeedReaction(selectedArticle.id, type)
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
			const data = await toggleFeedReaction(article.id, type)
			setArticles((items) => items.map((item) => item.id === article.id ? {
				...item,
				[type === "like" ? "liked" : "favorited"]: data.active,
				[type === "like" ? "like_count" : "favorite_count"]: Math.max(0, Number(item[type === "like" ? "like_count" : "favorite_count"] || 0) + (data.active ? 1 : -1)),
			} : item))
		} catch {
			// 未登录时不改变本地互动状态
		}
	}

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
							<div ref={scrollContainerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 sm:px-4">
								{articles.map((article) => {
									const preview = getArticlePreview(article.content)
									const previewImageSrc = preview.image ? resolveAssetUrl(preview.image) : null
									return (
									<article key={article.id} onClick={() => void openArticle(article)} className="homepage-article-card group cursor-pointer rounded-lg bg-card p-3 shadow-sm transition-colors hover:bg-red-50/10 sm:p-4">
										<div className="flex gap-4">
											{previewImageSrc ? (
												<div className="relative h-28 w-36 shrink-0 overflow-hidden rounded-lg sm:h-32 sm:w-44">
													<Image src={previewImageSrc} alt={`${article.title}配图`} fill sizes="(max-width: 640px) 144px, 176px" unoptimized={/^https?:\/\//.test(previewImageSrc)} className="object-cover" />
												</div>
											) : (
												<div className="flex h-28 w-36 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-xs text-muted-foreground sm:h-32 sm:w-44">无配图</div>
											)}
											<div className="flex min-w-0 flex-1 flex-col">
												<h2 className="line-clamp-1 text-lg font-bold transition-colors group-hover:text-red-600">{article.title}</h2>
												<p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{preview.text || "暂无正文内容"}…</p>
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
									)
								})}
								<div ref={loadMoreRef} className="flex min-h-16 items-center justify-center py-5 text-xs text-muted-foreground" aria-live="polite">
									{loadingMore ? "正在加载更多文章…" : loadMoreFailed ? (
										<button type="button" onClick={() => void loadMore()} className="rounded-md px-3 py-1.5 text-red-500 hover:bg-red-50">加载失败，点击重试</button>
									) : hasMore ? "继续向下滚动加载更多" : "已经到底了"}
								</div>
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
								{newsLoading ? (
									<div className="space-y-2 py-1" aria-label="正在加载热点新闻">
										{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-7 animate-pulse rounded-md bg-muted/70" />)}
									</div>
								) : hotNews.length ? (
									<div>{hotNews.slice(0, 5).map((news, index) => <a key={news.url} href={news.url} target="_blank" rel="noreferrer" className="group flex gap-2.5 rounded-lg px-1 py-1.5 hover:bg-muted/60"><span className="text-xs font-bold text-red-500">{String(index + 1).padStart(2, "0")}</span><span><span className="line-clamp-1 text-xs font-medium leading-5 group-hover:text-red-600">{news.title}</span><span className="block text-[10px] text-muted-foreground">{news.source?.name || "新闻来源"}</span></span></a>)}</div>
								) : (
									<div className="flex min-h-[170px] items-center justify-center rounded-lg border border-dashed px-3 text-center text-xs text-muted-foreground">{newsLoadFailed || newsConfigured ? "热点新闻暂时不可用" : "配置 GNEWS_API_KEY 后显示实时热点"}</div>
								)}
							</div>
						</section>
						<section className="px-4 pt-4">
							<div className="mb-3 flex items-center gap-2">
								<div>
									<h2 className="text-sm font-bold">爆文榜单</h2>
									<p className="text-[10px] text-muted-foreground">综合互动、质量与时效排序</p>
								</div>
							</div>
							<div className="min-h-[180px]">
								{Array.from({ length: 5 }).map((_, index) => {
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
													热度 {Number(article.hot_score || 0).toFixed(2)}
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

export default function MainPage({ onNavigate, mode, initialData }: MainPageProps) {
	if (mode === "inspiration") return <InspirationView onNavigate={onNavigate} />
	return <ContentHome initialData={initialData} onNavigate={onNavigate} />
}
