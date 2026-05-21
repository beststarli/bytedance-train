"use client"

import React, { useState, useEffect } from 'react'
import { Sparkles, Plus, Pencil, Trash2 } from 'lucide-react'
import { api } from '@/api/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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

const iconOptions = [
  { value: 'FileText', label: '文章' },
  { value: 'ImageIcon', label: '图片' },
  { value: 'Video', label: '视频' },
  { value: 'Sparkles', label: '优化' },
]

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Prompt | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', content: '', category: 'general', icon: 'FileText' })
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
    setForm({ title: '', description: '', content: '', category: 'general', icon: 'FileText' })
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

  const openNew = () => {
    setEditing(null)
    setForm({ title: '', description: '', content: '', category: 'general', icon: 'FileText' })
    setShowForm(true)
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">提示词管理</h1>
            <p className="text-sm text-muted-foreground mt-1">管理 AI 创作模板</p>
          </div>
          <Button onClick={openNew} className="bg-red-500 hover:bg-red-600 text-white gap-2">
            <Plus className="w-4 h-4" />新建模板
          </Button>
        </div>

        {/* 表单弹窗 */}
        {showForm && (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowForm(false)}>
            <div className="bg-background rounded-xl border shadow-lg p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-semibold mb-4">{editing ? '编辑模板' : '新建模板'}</h2>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-muted-foreground">标题</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">描述</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">提示词内容</Label>
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    className="w-full mt-1 rounded-lg border bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
                    placeholder="输入 prompt 模板，用 {变量名} 表示占位符"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label className="text-sm text-muted-foreground">分类</Label>
                    <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-9 mt-1" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-sm text-muted-foreground">图标</Label>
                    <select
                      value={form.icon}
                      onChange={(e) => setForm({ ...form, icon: e.target.value })}
                      className="w-full mt-1 h-9 rounded-lg border bg-background px-3 text-sm"
                    >
                      {iconOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={saving || !form.title || !form.content} className="bg-red-500 hover:bg-red-600 text-white">
                    {saving ? '保存中...' : '保存'}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowForm(false)}>取消</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 列表 */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">加载中...</div>
        ) : prompts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">暂无模板</div>
        ) : (
          <div className="space-y-3">
            {prompts.map((p) => (
              <div key={p.id} className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:border-red-200 transition-colors">
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
      </div>
    </div>
  )
}
