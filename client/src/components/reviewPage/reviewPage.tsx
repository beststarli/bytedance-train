"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Loader2,
  PencilLine,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  XCircle,
} from "lucide-react"
import { applyRewriteProposal, generateReviewRewrites, getReviewDetail, getReviews, rejectRewriteProposal } from "@/api/reviews"
import { submitWorkReview } from "@/api/works"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/store/userStore"
import { useEditorStore } from "@/store/editorStore"
import AuthRequired from "@/components/auth-required"
import { toast } from "sonner"

interface ReviewListItem {
  work_id: string
  publication_status: string
  review_status: string
  title: string
  content: string
  quality_score: number | null
  updated_at: string
  review_job_id: string | null
  job_status: string | null
  decision: string | null
  risk_score: number | null
  review_quality_score: number | null
  summary: string | null
  error: string | null
  submitted_at: string | null
  completed_at: string | null
}

interface ReviewDetail {
  id: string
  work_id: string
  work_version_id: string
  agent_run_id: string | null
  status: string
  decision: string | null
  risk_score: number | null
  quality_score: number | null
  summary: string | null
  error: string | null
  title: string
  content: string
  version_number: number
  review_status: string
  publication_status: string
}

interface Finding {
  id: string
  category: string
  severity: "low" | "medium" | "high" | "critical"
  confidence: number
  excerpt: string
  reason: string
  suggestion: string
}

interface Proposal {
  id: string
  finding_id: string | null
  original_content: string
  replacement_content: string
  reason: string
  status: "pending" | "accepted" | "rejected"
}

interface AgentStep {
  step_name: string
  status: string
  error: string | null
}

interface DetailPayload {
  review: ReviewDetail
  findings: Finding[]
  proposals: Proposal[]
  steps: AgentStep[]
}

const statusMeta: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  approved: { label: "审核通过", className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  published: { label: "审核通过", className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  pending_review: { label: "审核中", className: "bg-blue-50 text-blue-700", icon: Loader2 },
  queued: { label: "等待审核", className: "bg-blue-50 text-blue-700", icon: Clock3 },
  running: { label: "审核中", className: "bg-blue-50 text-blue-700", icon: Loader2 },
  needs_revision: { label: "待修改", className: "bg-amber-50 text-amber-700", icon: AlertTriangle },
  blocked: { label: "未通过", className: "bg-red-50 text-red-600", icon: XCircle },
  failed: { label: "审核异常", className: "bg-red-50 text-red-600", icon: XCircle },
  draft_changes: { label: "修改待提交", className: "bg-amber-50 text-amber-700", icon: PencilLine },
  none: { label: "未提交", className: "bg-muted text-muted-foreground", icon: Clock3 },
}

const severityMeta = {
  low: { label: "低风险", className: "bg-slate-100 text-slate-600" },
  medium: { label: "中风险", className: "bg-amber-50 text-amber-700" },
  high: { label: "高风险", className: "bg-orange-50 text-orange-700" },
  critical: { label: "严重风险", className: "bg-red-50 text-red-600" },
}

const agentStepLabels: Record<string, string> = {
  normalize_content: "内容标准化",
  deterministic_rule_scan: "确定性规则扫描",
  retrieve_policy_context: "检索审核策略",
  ai_safety_quality_review: "AI 安全与质量审核",
  policy_decision: "生成审核决策",
}

function effectiveStatus(item: ReviewListItem) {
  return item.job_status === "queued" || item.job_status === "running" ? item.job_status : item.review_status
}

export default function ReviewPage({ onNavigate }: { onNavigate?: (menu: string) => void }) {
  const [reviews, setReviews] = useState<ReviewListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [detail, setDetail] = useState<DetailPayload | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState("")
  const user = useAuthStore((state) => state.user)
  const editor = useEditorStore()

  const loadReviews = useCallback(async (silent = false) => {
    if (!user) {
      setReviews([])
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    try {
      const items = await getReviews<ReviewListItem>()
      setReviews(items)
    } catch {
      if (!silent) setReviews([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [user])

  const loadDetail = useCallback(async (id: string, silent = false) => {
    if (!silent) setDetailLoading(true)
    try {
      const data = await getReviewDetail<DetailPayload>(id)
      setDetail(data)
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "审核详情加载失败")
    } finally {
      if (!silent) setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    setReviews([])
    setDetail(null)
    setQuery("")
    void loadReviews()
  }, [user?.id, loadReviews])

  const hasRunning = reviews.some((item) => ["queued", "running"].includes(item.job_status || ""))
  useEffect(() => {
    if (!user || !hasRunning) return
    const timer = window.setInterval(() => {
      void loadReviews(true)
      if (detail && ["queued", "running"].includes(detail.review.status)) void loadDetail(detail.review.id, true)
    }, 2500)
    return () => window.clearInterval(timer)
  }, [detail, hasRunning, loadDetail, loadReviews, user])

  const filtered = useMemo(
    () => reviews.filter((work) => `${work.title}${work.content}${work.summary || ""}`.toLowerCase().includes(query.toLowerCase())),
    [query, reviews],
  )
  const averageQuality = (() => {
    const values = reviews
      .filter((item) => item.review_quality_score !== null)
      .map((item) => Number(item.review_quality_score))
      .filter(Number.isFinite)
    return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : "—"
  })()
  const summary = [
    { label: "审核中", value: reviews.filter((item) => ["queued", "running"].includes(item.job_status || "")).length, icon: Clock3, tone: "text-blue-600 bg-blue-50" },
    { label: "审核通过", value: reviews.filter((item) => item.review_status === "approved").length, icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50" },
    { label: "需要处理", value: reviews.filter((item) => ["needs_revision", "blocked", "failed"].includes(item.review_status)).length, icon: AlertTriangle, tone: "text-red-600 bg-red-50" },
    { label: "平均质量分", value: averageQuality, icon: Sparkles, tone: "text-violet-600 bg-violet-50" },
  ]

  const openDetail = (item: ReviewListItem) => {
    if (!item.review_job_id) return
    setDetail(null)
    void loadDetail(item.review_job_id)
  }

  const generateRewrites = async () => {
    if (!detail || actionLoading) return
    setActionLoading("rewrite")
    try {
      await generateReviewRewrites(detail.review.id)
      await loadDetail(detail.review.id, true)
      toast.success("AI 已生成替代内容，请审查后选择是否采用")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败")
    } finally {
      setActionLoading("")
    }
  }

  const applyProposal = async (proposal: Proposal) => {
    if (!detail || actionLoading) return
    setActionLoading(proposal.id)
    try {
      const version = await applyRewriteProposal<{ title: string; content: string }>(proposal.id)
      setDetail((current) => current ? {
        ...current,
        review: { ...current.review, title: version.title, content: version.content, review_status: "needs_revision" },
        proposals: current.proposals.map((item) => item.id === proposal.id ? { ...item, status: "accepted" } : item),
      } : current)
      await loadReviews(true)
      toast.success("已应用替代内容，重新审核前仍可继续编辑")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "采用失败")
    } finally {
      setActionLoading("")
    }
  }

  const rejectProposal = async (proposal: Proposal) => {
    if (!detail || actionLoading) return
    setActionLoading(`reject:${proposal.id}`)
    try {
      await rejectRewriteProposal(proposal.id)
      setDetail((current) => current ? {
        ...current,
        proposals: current.proposals.map((item) => item.id === proposal.id ? { ...item, status: "rejected" } : item),
      } : current)
      toast.success("已保留原内容，你仍可手动修改后重新提交")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败")
    } finally {
      setActionLoading("")
    }
  }

  const resubmit = async () => {
    if (!detail || actionLoading) return
    setActionLoading("resubmit")
    try {
      await submitWorkReview(detail.review.work_id)
      setDetail(null)
      await loadReviews()
      toast.success("新版本已重新进入 AI 审核队列")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重新审核失败")
    } finally {
      setActionLoading("")
    }
  }

  const editInCreator = () => {
    if (!detail) return
    editor.loadDocument({
      id: detail.review.work_id,
      title: detail.review.title,
      content: detail.review.content,
      status: detail.review.publication_status === "published" ? "published" : "draft",
    })
    setDetail(null)
    onNavigate?.("create")
  }

  return (
    <div className="enter-workspace flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6 sm:px-8 lg:px-12">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col">
        <div className="mb-5 flex shrink-0 flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="workspace-label mb-2">Safety & quality</div>
            <h1 className="text-2xl font-bold">内容审核</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">提交后由 AI 完成安全识别与质量评分，通过后自动发布。</p>
          </div>
          <Button variant="outline" disabled={!user || loading} onClick={() => void loadReviews()} className="h-9 rounded-md">
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />刷新状态
          </Button>
        </div>

        <div className="mb-4 grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
          {summary.map((item) => (
            <div key={item.label} className="workspace-card flex items-center gap-3 rounded-md p-4">
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-md", item.tone)}>
                <item.icon className="h-4 w-4" />
              </span>
              <div><strong className="block text-lg">{item.value}</strong><span className="text-[11px] text-muted-foreground">{item.label}</span></div>
            </div>
          ))}
        </div>

        <section className="workspace-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-md">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input disabled={!user} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索作品或审核结论" className="h-9 rounded-md border-transparent bg-muted/60 pl-9" />
            </div>
            <span className="hidden text-xs text-muted-foreground sm:inline">{filtered.length} 条审核记录</span>
          </div>

          {!user ? (
            <AuthRequired className="min-h-[360px]" />
          ) : loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载审核记录</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-emerald-50 text-emerald-600"><ShieldCheck className="h-6 w-6" /></span>
              <h2 className="text-sm font-semibold">还没有审核记录</h2>
              <p className="mt-1 text-xs text-muted-foreground">在创作中心提交文章后，审核轨迹会显示在这里。</p>
            </div>
          ) : (
            <div className="scrollBar-hidden min-h-0 flex-1 overflow-y-auto">
              {filtered.map((item) => {
                const status = effectiveStatus(item)
                const meta = statusMeta[status] || statusMeta.none
                const StatusIcon = meta.icon
                return (
                  <button key={item.work_id} type="button" disabled={!item.review_job_id} onClick={() => openDetail(item)} className="focus-red grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-4 border-b px-4 py-4 text-left transition-colors last:border-0 hover:bg-muted/30 disabled:cursor-default md:grid-cols-[1fr_128px_100px_112px_28px] md:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted"><FileText className="h-4 w-4 text-muted-foreground" /></span>
                      <div className="min-w-0"><div className="truncate text-sm font-semibold">{item.title}</div><div className="mt-1 max-w-2xl truncate text-xs text-muted-foreground">{item.summary || item.content || "等待提交审核"}</div></div>
                    </div>
                    <span className={cn("flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium", meta.className)}>
                      <StatusIcon className={cn("h-3 w-3", status === "running" && "animate-spin")} />{meta.label}
                    </span>
                    <span className="hidden text-xs font-semibold md:inline">{item.review_quality_score ?? "—"}</span>
                    <span className="hidden text-[11px] text-muted-foreground md:inline">{new Date(item.submitted_at || item.updated_at).toLocaleDateString("zh-CN")}</span>
                    <ChevronRight className="hidden h-4 w-4 text-muted-foreground md:block" />
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <Dialog open={detailLoading || !!detail} onOpenChange={(open) => { if (!open && !actionLoading) setDetail(null) }}>
        <DialogContent className="scrollBar-hidden max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
          {detailLoading && !detail ? (
            <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在读取审核轨迹</div>
          ) : detail ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
                  <div><DialogTitle>{detail.review.title}</DialogTitle><DialogDescription className="mt-1">版本 V{detail.review.version_number} · AI 安全与质量审核轨迹</DialogDescription></div>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", (statusMeta[detail.review.status] || statusMeta[detail.review.review_status] || statusMeta.none).className)}>
                    {(statusMeta[detail.review.status] || statusMeta[detail.review.review_status] || statusMeta.none).label}
                  </span>
                </div>
              </DialogHeader>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_250px]">
                <div className="space-y-4">
                  <section className="rounded-md border bg-muted/20 p-4">
                    <div className="mb-2 text-xs font-semibold text-muted-foreground">审核结论</div>
                    <p className="text-sm leading-6">{detail.review.summary || detail.review.error || "AI 正在分析内容，请稍后刷新。"}</p>
                  </section>

                  {detail.findings.length > 0 && (
                    <section>
                      <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">风险问题</h3><span className="text-[11px] text-muted-foreground">{detail.findings.length} 项</span></div>
                      <div className="space-y-2">
                        {detail.findings.map((finding) => {
                          const severity = severityMeta[finding.severity] || severityMeta.medium
                          return (
                            <div key={finding.id} className="rounded-md border p-3">
                              <div className="flex flex-wrap items-center gap-2"><span className={cn("rounded px-1.5 py-0.5 text-[10px]", severity.className)}>{severity.label}</span><span className="text-xs font-semibold">{finding.category}</span><span className="text-[10px] text-muted-foreground">置信度 {Math.round(Number(finding.confidence) * 100)}%</span></div>
                              {finding.excerpt && <blockquote className="mt-2 border-l-2 border-red-300 bg-red-50/40 px-3 py-2 text-xs leading-5 text-foreground/80">{finding.excerpt}</blockquote>}
                              <p className="mt-2 text-xs leading-5">{finding.reason}</p>
                              <p className="mt-1 text-xs text-muted-foreground">建议：{finding.suggestion}</p>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )}

                  {detail.proposals.length > 0 && (
                    <section>
                      <h3 className="mb-2 text-sm font-semibold">AI 替代方案</h3>
                      <div className="space-y-3">
                        {detail.proposals.map((proposal) => (
                          <div key={proposal.id} className="overflow-hidden rounded-md border">
                            <div className="grid md:grid-cols-2">
                              <div className="border-b bg-red-50/35 p-3 md:border-b-0 md:border-r"><div className="mb-1.5 text-[10px] font-semibold text-red-600">原内容</div><p className="text-xs leading-5">{proposal.original_content}</p></div>
                              <div className="bg-emerald-50/35 p-3"><div className="mb-1.5 text-[10px] font-semibold text-emerald-700">替代内容</div><p className="text-xs leading-5">{proposal.replacement_content}</p></div>
                            </div>
                            <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
                              <span className="truncate text-[10px] text-muted-foreground">{proposal.reason}</span>
                              <div className="flex shrink-0 items-center gap-2">
                                {proposal.status === "pending" && (
                                  <Button size="sm" variant="ghost" disabled={!!actionLoading} onClick={() => void rejectProposal(proposal)}>
                                    {actionLoading === `reject:${proposal.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "保留原文"}
                                  </Button>
                                )}
                                <Button size="sm" variant={proposal.status === "accepted" ? "outline" : "default"} disabled={proposal.status !== "pending" || !!actionLoading} onClick={() => void applyProposal(proposal)} className={proposal.status === "pending" ? "bg-red-500 text-white hover:bg-red-600" : ""}>
                                  {actionLoading === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : proposal.status === "accepted" ? "已采用" : proposal.status === "rejected" ? "已保留原文" : "采用建议"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                <aside className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border bg-red-50/30 p-3"><span className="text-[10px] text-muted-foreground">风险分</span><strong className="mt-1 block text-xl text-red-600">{detail.review.risk_score ?? "—"}</strong></div>
                    <div className="rounded-md border bg-emerald-50/30 p-3"><span className="text-[10px] text-muted-foreground">质量分</span><strong className="mt-1 block text-xl text-emerald-700">{detail.review.quality_score ?? "—"}</strong></div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="mb-3 text-xs font-semibold">Agent 执行轨迹</div>
                    <div className="space-y-0">
                      {detail.steps.length ? detail.steps.map((step, index) => (
                        <div key={`${step.step_name}-${index}`} className="relative flex gap-2 pb-4 last:pb-0">
                          {index < detail.steps.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-border" />}
                          <span className={cn("relative mt-1 h-3 w-3 shrink-0 rounded-full border-2 bg-card", step.status === "completed" ? "border-emerald-500" : step.status === "failed" ? "border-red-500" : "border-blue-500")} />
                          <div><div className="text-[11px] font-medium">{agentStepLabels[step.step_name] || step.step_name}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{step.status === "completed" ? "已完成" : step.status === "failed" ? step.error || "执行失败" : "执行中"}</div></div>
                        </div>
                      )) : <div className="text-[11px] text-muted-foreground">等待 Agent 开始执行</div>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {detail.findings.length > 0 && detail.review.status === "completed" && (
                      <Button variant="outline" disabled={!!actionLoading} onClick={() => void generateRewrites()} className="w-full justify-start"><WandSparkles className="mr-2 h-4 w-4" />{actionLoading === "rewrite" ? "正在生成…" : "AI 一键生成替代内容"}</Button>
                    )}
                    {["needs_revision", "blocked"].includes(detail.review.decision || "") && (
                      <>
                        <Button variant="outline" disabled={!!actionLoading} onClick={editInCreator} className="w-full justify-start"><PencilLine className="mr-2 h-4 w-4" />前往创作中心修改</Button>
                        <Button disabled={!!actionLoading} onClick={() => void resubmit()} className="w-full justify-start bg-red-500 text-white hover:bg-red-600"><ShieldCheck className="mr-2 h-4 w-4" />{actionLoading === "resubmit" ? "正在提交…" : "重新提交审核"}</Button>
                      </>
                    )}
                  </div>
                </aside>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
