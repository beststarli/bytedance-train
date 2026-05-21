"use client"

import React, { useState, useEffect } from 'react'
import { FileText, Search, Trash2, Eye } from 'lucide-react'
import { api } from '@/api/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Work {
  id: string
  title: string
  content: string
  status: string
  quality_score: number | null
  view_count: number
  created_at: string
  updated_at: string
}

export default function WorksPage() {
  const [works, setWorks] = useState<Work[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    api<{ works: Work[] }>('/api/content/works')
      .then((d) => setWorks(d.works))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    await api(`/api/content/works/${id}`, { method: 'DELETE' })
    load()
  }

  const filtered = works.filter((w) => w.title.includes(search) || w.content.includes(search))

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">作品管理</h1>
            <p className="text-sm text-muted-foreground mt-1">管理你发布的内容，共 {works.length} 篇</p>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索作品..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {search ? '未找到匹配的作品' : '暂无作品，快去创作吧'}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((work) => (
              <div key={work.id} className="p-5 rounded-xl border bg-card hover:border-red-200 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium truncate">{work.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{work.content.slice(0, 200)}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{new Date(work.created_at).toLocaleDateString('zh-CN')}</span>
                        <span>阅读 {work.view_count}</span>
                        {work.quality_score && <span>质量分 {work.quality_score}</span>}
                        <span className={`px-1.5 py-0.5 rounded-full text-xs ${work.status === 'published' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>
                          {work.status === 'published' ? '已发布' : '草稿'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-red-500 hover:text-red-600" onClick={() => handleDelete(work.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
