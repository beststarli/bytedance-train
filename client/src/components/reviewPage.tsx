"use client"

import React, { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { api } from "@/api/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Work {
  id: string
  title: string
  content: string
  status: string
  quality_score: number | null
  updated_at: string
}

const statusMeta: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  published: { label: "审核通过", className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  blocked: { label: "需处理", className: "bg-red-50 text-red-600", icon: AlertTriangle },
  draft: { label: "待审核", className: "bg-amber-50 text-amber-700", icon: Clock3 },
  pending: { label: "审核中", className: "bg-blue-50 text-blue-700", icon: ShieldCheck },
}

export default function ReviewPage() {
  const [works, setWorks] = useState<Work[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  useEffect(() => {
    api<{ works: Work[] }>("/api/content/works")
      .then((data) => setWorks(data.works))
      .catch(() => setWorks([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () => works.filter((work) => `${work.title}${work.content}`.toLowerCase().includes(query.toLowerCase())),
    [query, works],
  )

  const scoredWorks = works.filter((work) => work.quality_score !== null)
  const averageQuality = scoredWorks.length
    ? (scoredWorks.reduce((sum, work) => sum + Number(work.quality_score), 0) / scoredWorks.length).toFixed(1)
    : "—"

  const summary = [
    { label: "待审核", value: works.filter((work) => ["draft", "pending"].includes(work.status)).length, icon: Clock3, tone: "text-amber-600 bg-amber-50" },
    { label: "审核通过", value: works.filter((work) => work.status === "published").length, icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50" },
    { label: "需要处理", value: works.filter((work) => work.status === "blocked").length, icon: AlertTriangle, tone: "text-red-600 bg-red-50" },
    { label: "平均质量分", value: averageQuality, icon: Sparkles, tone: "text-blue-600 bg-blue-50" },
  ]

  return (
    <div className="enter-workspace flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-7">
      <div className="mx-auto max-w-[1240px]">
        <div className="mb-7 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="workspace-label mb-2">Safety & quality</div>
            <h1 className="text-2xl font-bold">内容审核</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">在发布前确认安全风险、质量评分和 AI 修改建议。</p>
          </div>
          <Button className="h-10 w-full rounded-lg bg-[#f5222d] text-white hover:bg-[#df1722] sm:w-auto">
            <ShieldCheck className="mr-1.5 h-4 w-4" /> 批量发起审核
          </Button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {summary.map((item) => (
            <div key={item.label} className="workspace-card flex items-center gap-4 p-4">
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", item.tone)}>
                <item.icon className="h-5 w-5" />
              </span>
              <div>
                <strong className="block text-xl">{item.value}</strong>
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
            </div>
          ))}
        </div>

        <section className="workspace-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索待审核内容"
                className="h-9 rounded-lg border-transparent bg-muted/70 pl-9"
              />
            </div>
            <Button variant="outline" className="h-9 rounded-lg text-xs">
              <Filter className="mr-1.5 h-3.5 w-3.5" /> 全部状态
            </Button>
          </div>

          <div className="hidden grid-cols-[1fr_120px_120px_120px_48px] border-b bg-muted/40 px-5 py-3 text-[11px] font-medium text-muted-foreground md:grid">
            <span>作品</span><span>安全状态</span><span>质量评分</span><span>更新时间</span><span />
          </div>

          {loading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">正在加载审核队列…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <h2 className="text-sm font-semibold">审核队列已清空</h2>
              <p className="mt-1 text-xs text-muted-foreground">新作品提交后会出现在这里。</p>
            </div>
          ) : (
            <div>
              {filtered.map((work) => {
                const meta = statusMeta[work.status] || statusMeta.draft
                return (
                  <button
                    key={work.id}
                    className="focus-red grid w-full grid-cols-[1fr_auto] items-center gap-3 border-b px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/30 md:grid-cols-[1fr_120px_120px_120px_48px] md:px-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{work.title}</div>
                        <div className="mt-1 max-w-lg truncate text-xs text-muted-foreground">{work.content}</div>
                      </div>
                    </div>
                    <span className={cn("w-fit rounded-full px-2 py-1 text-[10px] font-medium", meta.className)}>
                      {meta.label}
                    </span>
                    <span className="hidden text-sm font-semibold md:inline">{work.quality_score ?? "待评分"}</span>
                    <span className="hidden text-xs text-muted-foreground md:inline">{new Date(work.updated_at).toLocaleDateString("zh-CN")}</span>
                    <ChevronRight className="hidden h-4 w-4 text-muted-foreground md:block" />
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
