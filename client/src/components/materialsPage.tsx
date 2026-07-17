"use client"

import React, { useState, useEffect, useRef } from 'react'
import { ImageIcon, VideoIcon, Upload, Trash2, FileType } from 'lucide-react'
import { api } from '@/api/api'
import { Button } from '@/components/ui/button'

interface Material {
  id: string
  filename: string
  url: string
  type: string
  size: number
  created_at: string
}

const typeIcons: Record<string, React.ElementType> = { image: ImageIcon, video: VideoIcon }

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    api<{ materials: Material[] }>('/api/content/materials')
      .then((d) => setMaterials(d.materials))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('文件不能超过10MB'); return }

    setUploading(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const type = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'other'
      await api('/api/content/materials', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, data: base64, type }),
      })
      load()
    } catch { alert('上传失败') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const handleDelete = async (id: string) => {
    await api(`/api/content/materials/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="enter-workspace flex-1 overflow-y-auto px-7 py-7">
      <div className="max-w-[1240px] mx-auto">
        <div className="flex items-end justify-between mb-7">
          <div>
            <div className="workspace-label mb-2">Asset library</div>
            <h1 className="text-2xl font-bold">素材库</h1>
            <p className="text-sm text-muted-foreground mt-1.5">管理图片、视频和创作参考，共 {materials.length} 个素材</p>
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleUpload} className="hidden" disabled={uploading} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="h-10 rounded-lg bg-[#f5222d] hover:bg-[#df1722] text-white gap-2">
              <Upload className="w-4 h-4" />{uploading ? '上传中...' : '上传素材'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">加载中...</div>
        ) : materials.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">暂无素材</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {materials.map((m) => {
              const Icon = typeIcons[m.type] || FileType
              return (
                <div key={m.id} className="workspace-card group overflow-hidden hover:border-red-200 transition-all hover:-translate-y-0.5">
                  <div className="aspect-video bg-muted flex items-center justify-center relative overflow-hidden">
                    {m.type === 'image' ? (
                      <img src={m.url} alt={m.filename} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <VideoIcon className="w-8 h-8" />
                        <span className="text-xs">视频预览</span>
                      </div>
                    )}
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium truncate">{m.filename}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatSize(m.size)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
