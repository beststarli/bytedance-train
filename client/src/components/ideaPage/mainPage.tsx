"use client"

import React, { useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  Bookmark,
  BarChart3,
  BookOpenText,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eye,
  FileCheck2,
  FileText,
  FilePenLine,
  Flame,
  Heart,
  FolderOpen,
  ImageIcon,
  Lightbulb,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WandSparkles,
} from "lucide-react"
import { api } from "@/api/api"
import { useAuthStore } from "@/store/userStore"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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
  mode?: string
}

function getArticlePreview(content: string) {
  const markdownImage = content.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i)
  const directImage = content.match(/https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s)]*)?/i)
  const image = markdownImage?.[1] || directImage?.[0] || null
  const text = content
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s)]*)?/gi, "")
    .replace(/[#>*_`-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return { image, text }
}

function ContentHome({ onNavigate }: Pick<MainPageProps, "onNavigate">) {
  const [articles, setArticles] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedArticle, setSelectedArticle] = useState<FeedItem | null>(null)
  const [hotNews, setHotNews] = useState<HotNewsItem[]>([])
  const [newsConfigured, setNewsConfigured] = useState(true)
  const [hotNewsLoading, setHotNewsLoading] = useState(true)

  useEffect(() => {
    api<{ works: FeedItem[] }>("/api/content/feed?sort=new&limit=10&offset=0")
      .then((data) => setArticles(data.works))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false))
  }, [])

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
    <div className="enter-workspace flex-1 overflow-y-auto xl:h-[calc(100dvh-72px)] xl:overflow-hidden">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-7 xl:flex xl:h-full xl:flex-col">
        <section className="mb-7 flex flex-col items-start justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
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
          <section className="workspace-card col-span-12 flex min-h-0 flex-col overflow-hidden xl:col-span-9">
            <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
              <div>
                <h2 className="font-bold">最新发布</h2>
                <p className="mt-1 text-xs text-muted-foreground">来自创作者社区的优质文章</p>
              </div>
              <span className="text-xs text-muted-foreground">{articles.length} 篇内容</span>
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
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3 sm:p-4">
                {articles.map((article) => (
                  <article key={article.id} onClick={() => void openArticle(article)} className="group cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:border-red-200 hover:bg-red-50/10 sm:p-4">
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

          <aside className="col-span-12 min-h-0 space-y-5 overflow-y-auto xl:col-span-3">
            <section className="workspace-card p-5">
              <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold">当下热点</h2><p className="mt-1 text-[10px] text-muted-foreground">实时新闻选题雷达</p></div><span className="h-2 w-2 rounded-full bg-red-500" /></div>
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
            <section className="workspace-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-500">
                  <Flame className="h-4 w-4" />
                </span>
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
                    <button key={article.id} type="button" onClick={() => void openArticle(article)} className="focus-red group flex h-9 w-full items-start gap-2.5 rounded-lg px-1 py-1 text-left hover:bg-muted/60">
                      <span className={cn("w-5 text-sm font-black italic", index < 3 ? "text-red-500" : "text-muted-foreground")}>{index + 1}</span>
                      <span className="min-w-0 flex-1"><span className="line-clamp-1 text-xs font-medium leading-5 group-hover:text-red-600">{article.title}</span><span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Flame className="h-3 w-3" /> {Number(article.view_count || 0).toLocaleString("zh-CN")} 热度</span></span>
                    </button>
                  ) : <div key={`empty-${index}`} className="h-9" aria-hidden="true" />
                })}
              </div>
            </section>

          </aside>
        </div>
      </div>
      <Dialog open={!!selectedArticle} onOpenChange={(open) => !open && setSelectedArticle(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          {selectedArticle && <>
            <DialogHeader>
              <DialogTitle className="pr-8 text-xl leading-8">{selectedArticle.title}</DialogTitle>
              <DialogDescription>{selectedArticle.nickname || "创作者"} · {formatDate(selectedArticle.created_at)} · 阅读 {selectedArticle.view_count || 0}</DialogDescription>
            </DialogHeader>
            <div className="whitespace-pre-wrap py-3 text-sm leading-8 text-foreground/90">{selectedArticle.content}</div>
            <div className="sticky bottom-0 flex items-center gap-3 border-t bg-background py-3">
              <Button variant="outline" onClick={() => void toggleReaction("like")} className={cn(selectedArticle.liked && "border-red-200 bg-red-50 text-red-600")}><Heart className={cn("mr-1.5 h-4 w-4", selectedArticle.liked && "fill-current")} />点赞 {selectedArticle.like_count || 0}</Button>
              <Button variant="outline" onClick={() => void toggleReaction("favorite")} className={cn(selectedArticle.favorited && "border-amber-200 bg-amber-50 text-amber-700")}><Bookmark className={cn("mr-1.5 h-4 w-4", selectedArticle.favorited && "fill-current")} />收藏 {selectedArticle.favorite_count || 0}</Button>
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  )
}

const creationEntries = [
  {
    title: "长文创作",
    description: "从选题到成稿，完成一篇结构化文章",
    icon: BookOpenText,
    className: "bg-[#fff2f0] text-[#e64a3b]",
  },
  {
    title: "短图文",
    description: "生成适合信息流传播的图文内容",
    icon: ImageIcon,
    className: "bg-[#eef7ff] text-[#2e7dd7]",
  },
  {
    title: "AI 一键初稿",
    description: "用一句需求快速获得可编辑的草稿",
    icon: WandSparkles,
    className: "bg-[#fff8e7] text-[#cf8b19]",
  },
]

const workflow = [
  { label: "灵感", detail: "2 条待整理", icon: Lightbulb, state: "done" },
  { label: "生成", detail: "1 篇创作中", icon: Sparkles, state: "active" },
  { label: "审核", detail: "3 篇待处理", icon: ShieldCheck, state: "pending" },
  { label: "发布", detail: "本周已发布 6 篇", icon: FileCheck2, state: "pending" },
]

const chartPoints = "0,82 90,74 180,78 270,56 360,64 450,35 540,47 630,18"

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
}

function WorkspaceHome({ onNavigate }: Pick<MainPageProps, "onNavigate">) {
  const user = useAuthStore((state) => state.user)
  const [works, setWorks] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ works: FeedItem[] }>("/api/content/feed?sort=new&limit=6&offset=0")
      .then((data) => setWorks(data.works))
      .catch(() => setWorks([]))
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const views = works.reduce((sum, item) => sum + Number(item.view_count || 0), 0)
    const reviewed = works.filter((item) => item.quality_score !== null).length
    return [
      { label: "本周创作", value: works.length || 6, unit: "篇", trend: "较上周 +2" },
      { label: "累计阅读", value: views || 1246, unit: "", trend: "近 7 日 +18%" },
      { label: "审核通过", value: reviewed || 4, unit: "篇", trend: "通过率 86%" },
      { label: "平均质量分", value: works[0]?.quality_score || 8.6, unit: "", trend: "较上周 +0.4" },
    ]
  }, [works])

  return (
    <div className="enter-workspace flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1500px] px-7 py-7">
        <section className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="workspace-label mb-2">Creator workspace</div>
            <h1 className="text-[28px] font-bold tracking-[-0.04em]">
              下午好，{user?.nickname || "创作者"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">继续打磨内容。你有 3 篇作品等待审核。</p>
          </div>
          <Button
            onClick={() => onNavigate?.("create")}
            className="h-11 rounded-lg bg-[#f5222d] px-5 text-white shadow-[0_8px_18px_rgba(245,34,45,.18)] hover:bg-[#df1722]"
          >
            <Plus className="mr-1.5 h-4 w-4" /> 开始新创作
          </Button>
        </section>

        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 space-y-5 xl:col-span-9">
            <section className="workspace-card overflow-hidden">
              <div className="flex items-start justify-between border-b px-6 py-5">
                <div>
                  <h2 className="text-base font-bold">创作流水线</h2>
                  <p className="mt-1 text-xs text-muted-foreground">从想法到发布，每一步都可追踪、可回退</p>
                </div>
                <button
                  onClick={() => onNavigate?.("works")}
                  className="focus-red flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  查看全部 <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="relative grid grid-cols-2 gap-y-6 px-6 py-6 md:grid-cols-4">
                <div className="absolute left-[14%] right-[14%] top-[45px] h-px bg-border" />
                <div className="absolute left-[14%] top-[45px] h-px w-[25%] bg-red-400" />
                {workflow.map((step) => (
                  <button
                    key={step.label}
                    onClick={() => onNavigate?.(step.label === "生成" ? "create" : step.label === "审核" ? "review" : "works")}
                    className="focus-red relative z-10 flex flex-col items-center rounded-lg py-1 text-center"
                  >
                    <span
                      className={cn(
                        "mb-3 flex h-10 w-10 items-center justify-center rounded-full border-4 border-card",
                        step.state === "done" && "bg-emerald-500 text-white",
                        step.state === "active" && "bg-red-500 text-white shadow-[0_0_0_6px_rgba(245,34,45,.1)]",
                        step.state === "pending" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {step.state === "done" ? <Check className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
                    </span>
                    <span className="text-sm font-semibold">{step.label}</span>
                    <span className="mt-1 text-[11px] text-muted-foreground">{step.detail}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="workspace-card p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold">新的创作</h2>
                  <p className="mt-1 text-xs text-muted-foreground">选择创作方式，AI 会沿用你的素材和提示词模版偏好</p>
                </div>
                <button
                  onClick={() => onNavigate?.("prompts")}
                  className="focus-red flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                >
                  管理提示词 <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {creationEntries.map((entry) => (
                  <button
                    key={entry.title}
                    onClick={() => onNavigate?.("create")}
                    className="focus-red group relative overflow-hidden rounded-lg border bg-background p-5 text-left transition-all hover:-translate-y-0.5 hover:border-red-200 hover:shadow-sm"
                  >
                    <div className={cn("mb-7 flex h-10 w-10 items-center justify-center rounded-lg", entry.className)}>
                      <entry.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-sm font-bold">{entry.title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{entry.description}</p>
                    <ArrowRight className="absolute right-5 top-5 h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-12 gap-5">
              <div className="workspace-card col-span-12 p-6 lg:col-span-8">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-bold">内容表现</h2>
                    <p className="mt-1 text-xs text-muted-foreground">最近 7 日作品阅读趋势</p>
                  </div>
                  <div className="rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">近 7 日</div>
                </div>
                <div className="grid grid-cols-4 gap-3 border-b pb-4">
                  {stats.map((stat) => (
                    <div key={stat.label}>
                      <div className="text-[11px] text-muted-foreground">{stat.label}</div>
                      <div className="mt-1 flex items-baseline gap-1">
                        <strong className="text-xl tracking-tight">{stat.value}</strong>
                        <span className="text-xs text-muted-foreground">{stat.unit}</span>
                      </div>
                      <div className="mt-1 text-[10px] text-emerald-600">{stat.trend}</div>
                    </div>
                  ))}
                </div>
                <div className="relative mt-5 h-32 overflow-hidden">
                  <div className="absolute inset-x-0 top-3 border-t border-dashed" />
                  <div className="absolute inset-x-0 top-16 border-t border-dashed" />
                  <div className="absolute inset-x-0 bottom-2 border-t border-dashed" />
                  <svg viewBox="0 0 630 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                    <defs>
                      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f5222d" stopOpacity=".16" />
                        <stop offset="100%" stopColor="#f5222d" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <polygon points={`${chartPoints} 630,100 0,100`} fill="url(#chartFill)" />
                    <polyline points={chartPoints} fill="none" stroke="#f5222d" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-muted-foreground">
                    {["07-11", "07-12", "07-13", "07-14", "07-15", "07-16", "今天"].map((date) => <span key={date}>{date}</span>)}
                  </div>
                </div>
              </div>

              <div className="workspace-card col-span-12 p-6 lg:col-span-4">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-bold">审核队列</h2>
                    <p className="mt-1 text-xs text-muted-foreground">发布前的内容安全检查</p>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-red-500" />
                </div>
                <div className="space-y-3">
                  {[
                    { title: "AI Agent 的 5 种工作方式", status: "待确认", tone: "amber" },
                    { title: "周末城市散步指南", status: "审核中", tone: "blue" },
                    { title: "提示词实战手册", status: "已通过", tone: "green" },
                  ].map((item) => (
                    <div key={item.title} className="flex items-center gap-3 rounded-lg bg-muted/55 p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background">
                        <FilePenLine className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{item.title}</div>
                        <div className={cn(
                          "mt-1 text-[10px]",
                          item.tone === "amber" && "text-amber-600",
                          item.tone === "blue" && "text-blue-600",
                          item.tone === "green" && "text-emerald-600",
                        )}>{item.status}</div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  ))}
                </div>
                <Button onClick={() => onNavigate?.("review")} variant="outline" className="mt-4 h-9 w-full rounded-lg text-xs">
                  进入审核中心
                </Button>
              </div>
            </section>
          </div>

          <aside className="col-span-12 space-y-5 xl:col-span-3">
            <section className="workspace-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-500">
                    <Flame className="h-4 w-4" />
                  </span>
                  <h2 className="text-sm font-bold">今日灵感</h2>
                </div>
                <button onClick={() => onNavigate?.("inspiration")} className="text-[11px] text-muted-foreground hover:text-red-500">全部</button>
              </div>
              <div className="space-y-1">
                {[
                  "普通人如何用 AI 建立第二大脑",
                  "年轻人重新爱上逛公园",
                  "一人公司需要哪些 Agent",
                  "内容创作者的效率系统",
                  "低成本拍出电影感画面",
                ].map((topic, index) => (
                  <button
                    key={topic}
                    onClick={() => onNavigate?.("create")}
                    className="focus-red group flex w-full gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-muted"
                  >
                    <span className={cn("w-4 text-xs font-bold", index < 3 ? "text-red-500" : "text-muted-foreground")}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-xs leading-5 group-hover:text-red-600">{topic}</span>
                    <TrendingUp className="mt-0.5 h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </section>

            <section className="workspace-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold">本周任务</h2>
                <span className="text-[11px] text-muted-foreground">4 / 7</span>
              </div>
              <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[57%] rounded-full bg-red-500" />
              </div>
              <div className="space-y-3.5">
                {[
                  { text: "完成 3 篇长文", done: true },
                  { text: "整理本周素材", done: true },
                  { text: "处理审核建议", done: false },
                  { text: "发布一篇优质内容", done: false },
                ].map((task) => (
                  <div key={task.text} className="flex items-center gap-2.5">
                    <span className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full border",
                      task.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border bg-background",
                    )}>
                      {task.done && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className={cn("text-xs", task.done && "text-muted-foreground line-through")}>{task.text}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-lg bg-[#242632] p-5 text-white shadow-md">
              <div className="workspace-label !text-white/45">AI assistant</div>
              <h2 className="mt-3 text-base font-bold">让 AI 接着写</h2>
              <p className="mt-2 text-xs leading-5 text-white/60">已有 2 篇未完成草稿，继续上次的创作上下文。</p>
              <button
                onClick={() => onNavigate?.("create")}
                className="focus-red mt-5 flex w-full items-center justify-between rounded-lg bg-white px-3.5 py-2.5 text-xs font-semibold text-[#242632]"
              >
                回到创作 <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

function InspirationView({ onNavigate }: Pick<MainPageProps, "onNavigate">) {
  return (
    <div className="enter-workspace flex-1 overflow-y-auto px-7 py-7">
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
                <span className="workspace-label">趋势 {String(index + 1).padStart(2, "0")}</span>
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

function DataView() {
  return (
    <div className="enter-workspace flex-1 overflow-y-auto px-7 py-7">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-7">
          <div className="workspace-label mb-2">Content performance</div>
          <h1 className="text-2xl font-bold">数据中心</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">用作品表现和质量评分，反推下一轮创作决策。</p>
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { label: "内容曝光", value: "12,460", icon: Eye },
            { label: "互动次数", value: "386", icon: MessageCircle },
            { label: "优质作品", value: "18", icon: FileCheck2 },
            { label: "创作天数", value: "42", icon: Clock3 },
          ].map((item) => (
            <div key={item.label} className="workspace-card p-5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs">{item.label}</span><item.icon className="h-4 w-4" />
              </div>
              <strong className="mt-5 block text-2xl">{item.value}</strong>
              <span className="mt-1 block text-[11px] text-emerald-600">近 7 日保持增长</span>
            </div>
          ))}
        </div>
        <div className="workspace-card mt-5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold">作品表现趋势</h2>
              <p className="mt-1 text-xs text-muted-foreground">曝光量与质量评分的关联变化</p>
            </div>
            <BarChart3 className="h-5 w-5 text-red-500" />
          </div>
          <div className="mt-8 h-64 rounded-lg bg-[linear-gradient(to_bottom,transparent_24%,rgba(0,0,0,.05)_25%,transparent_26%,transparent_49%,rgba(0,0,0,.05)_50%,transparent_51%,transparent_74%,rgba(0,0,0,.05)_75%,transparent_76%)]">
            <svg viewBox="0 0 630 100" preserveAspectRatio="none" className="h-full w-full">
              <polyline points={chartPoints} fill="none" stroke="#f5222d" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MainPage({ onNavigate, mode }: MainPageProps) {
  if (mode === "inspiration") return <InspirationView onNavigate={onNavigate} />
  if (mode === "data") return <DataView />
  if (mode === "workspace") return <WorkspaceHome onNavigate={onNavigate} />
  return <ContentHome onNavigate={onNavigate} />
}
