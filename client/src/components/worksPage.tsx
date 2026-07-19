"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Bookmark, ChevronDown, Edit3, Eye, FileText, Heart, Plus, Search, Trash2 } from "lucide-react"
import { api } from "@/api/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useEditorStore } from "@/store/editorStore"
import { toast } from "sonner"

interface Work {
  id: string
  title: string
  content: string
  status: string
  quality_score: number | null
  view_count: number
  like_count: number
  favorite_count: number
  created_at: string
  updated_at: string
}

function getPreview(content: string) {
  const markdown = content.match(/!\[[^\]]*\]\(((?:https?:\/\/|\/)[^)\s]+)\)/i)
  const direct = content.match(/(?:https?:\/\/|\/)[^\s)]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s)]*)?/i)
  const image = markdown?.[1] || direct?.[0] || null
  const text = content
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/(?:https?:\/\/|\/)[^\s)]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s)]*)?/gi, "")
    .replace(/[#>*_`-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return { image, text }
}

export default function WorksPage({ onNavigate }: { onNavigate?: (menu: string) => void }) {
  const [works, setWorks] = useState<Work[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"all" | "published" | "draft">("all")
  const [pendingEdit, setPendingEdit] = useState<Work | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Work | null>(null)
  const [saving, setSaving] = useState(false)
  const editor = useEditorStore()

  const load = () => {
    setLoading(true)
    api<{ works: Work[] }>("/api/content/works")
      .then((data) => setWorks(data.works))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => works.filter((work) => {
    const matchesText = `${work.title}${work.content}`.toLowerCase().includes(search.toLowerCase())
    return matchesText && (status === "all" || work.status === status)
  }), [search, status, works])

  const editInCreator = (work: Work) => {
    editor.loadDocument({ id: work.id, title: work.title, content: work.content, status: work.status === "published" ? "published" : "draft" })
    onNavigate?.("create")
  }

  const openEdit = (work: Work) => {
    if (editor.isDirty() && (editor.title.trim() || editor.content.trim())) {
      setPendingEdit(work)
      return
    }
    editInCreator(work)
  }

  const saveCurrentAndEdit = async () => {
    if (!pendingEdit || !editor.title.trim() || !editor.content.trim()) return
    setSaving(true)
    try {
      const path = editor.id ? `/api/content/works/${editor.id}` : "/api/content/works"
      const data = await api<{ work: Work }>(path, {
        method: editor.id ? "PUT" : "POST",
        body: JSON.stringify({ title: editor.title.trim(), content: editor.content.trim(), status: "draft" }),
      })
      editor.markSaved(data.work.id)
      const next = pendingEdit
      setPendingEdit(null)
      toast.success("当前内容已保存为草稿")
      editInCreator(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await api(`/api/content/works/${deleteTarget.id}`, { method: "DELETE" })
      setWorks((items) => items.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="enter-workspace h-[calc(100dvh-72px)] flex-1 overflow-hidden px-16 py-8">
      <div className="mx-auto flex h-full flex-col">
        <div className="mb-5 flex shrink-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><div className="workspace-label mb-2">Content library</div><h1 className="text-2xl font-bold">作品管理</h1><p className="mt-1.5 text-sm text-muted-foreground">统一管理草稿和已发布内容，共 {works.length} 篇</p></div>
          <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:flex-nowrap">
            <div className="relative min-w-[240px] flex-1 xl:w-80 xl:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="搜索作品标题或正文" value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 border-transparent bg-white pl-9 shadow-sm" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 min-w-28 shrink-0 justify-between bg-white text-xs">
                  {status === "all" ? "全部状态" : status === "published" ? "已发布" : "草稿"}
                  <ChevronDown className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuRadioGroup value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                  <DropdownMenuRadioItem value="all" className="cursor-pointer">全部状态</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="published" className="cursor-pointer">已发布</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="draft" className="cursor-pointer">草稿</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={() => onNavigate?.("create")}
              className="h-10 shrink-0 rounded-lg bg-[#f5222d] px-4 text-white hover:bg-[#df1722]"
            >
              <Plus className="mr-1.5 h-4 w-4" /> 去创作
            </Button>
          </div>
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3 sm:p-4">
            {loading ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-lg border bg-card" />) : filtered.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground"><FileText className="mb-3 h-7 w-7 opacity-40" />{search ? "未找到匹配的作品" : "暂无作品"}</div>
            ) : filtered.map((work) => {
              const preview = getPreview(work.content)
              return (
                <article key={work.id} className="rounded-lg border bg-card p-3 transition-colors hover:border-red-200 sm:p-4">
                  <div className="flex gap-4">
                    {preview.image ? <img src={preview.image} alt="" className="h-28 w-36 shrink-0 rounded-lg object-cover sm:h-32 sm:w-44" /> : <div className="flex h-28 w-36 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-xs text-muted-foreground sm:h-32 sm:w-44">无配图</div>}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="line-clamp-1 text-lg font-bold">{work.title}</h2><span className={`rounded px-2 py-0.5 text-[10px] ${work.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{work.status === "published" ? "已发布" : "草稿"}</span></div><p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{preview.text || "暂无正文内容"}…</p></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon-sm" onClick={() => openEdit(work)} aria-label="编辑作品"><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(work)} className="text-red-500 hover:text-red-600" aria-label="删除作品"><Trash2 className="h-4 w-4" /></Button></div></div>
                      <div className="mt-auto flex flex-wrap items-center gap-4 pt-3 text-[11px] text-muted-foreground"><span>{new Date(work.updated_at).toLocaleDateString("zh-CN")}</span><span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{work.view_count || 0}</span><span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{work.like_count || 0}</span><span className="flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" />{work.favorite_count || 0}</span>{work.quality_score !== null && <span>质量分 {work.quality_score}</span>}</div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </div>

      <Dialog open={!!pendingEdit} onOpenChange={(open) => !open && setPendingEdit(null)}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>当前内容尚未保存</DialogTitle><DialogDescription>进入“{pendingEdit?.title}”前，是否先把创作中心里的当前内容保存为草稿？</DialogDescription></DialogHeader><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setPendingEdit(null)}>取消</Button><Button variant="outline" onClick={() => { const next = pendingEdit; setPendingEdit(null); if (next) editInCreator(next) }}>不保存，继续编辑</Button><Button onClick={() => void saveCurrentAndEdit()} disabled={saving || !editor.title.trim() || !editor.content.trim()} className="bg-red-500 text-white hover:bg-red-600">{saving ? "保存中…" : "保存并继续"}</Button></div></DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent><DialogHeader><DialogTitle>确认删除作品？</DialogTitle><DialogDescription>“{deleteTarget?.title}”删除后无法恢复，相关点赞和收藏记录也会一并移除。</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button><Button onClick={() => void confirmDelete()} disabled={saving} className="bg-red-500 text-white hover:bg-red-600">{saving ? "删除中…" : "确认删除"}</Button></div></DialogContent>
      </Dialog>
    </div>
  )
}
