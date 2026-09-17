"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Upload, Trash2 } from 'lucide-react'
import { deleteMaterial, getMaterials, uploadMaterial } from '@/api/materials'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fileAsDataUrl, formatSize } from '@/lib/utils'
import { useAuthStore } from '@/store/userStore'
import AuthRequired from '@/components/auth-required'
import { toast } from 'sonner'

interface Material {
    id: string
    filename: string
    url: string
    type: string
    size: number
    created_at: string
}

export default function MaterialsPage() {
    const [materials, setMaterials] = useState<Material[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [pendingDelete, setPendingDelete] = useState<Material | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState('')
    const fileRef = useRef<HTMLInputElement>(null)
    const user = useAuthStore((state) => state.user)

    const load = (cancelled?: () => boolean) => {
        if (!user) {
            setMaterials([])
            setLoading(false)
            return
        }
        setLoading(true)
        getMaterials<Material>()
            .then((items) => { if (!cancelled?.()) setMaterials(items) })
            .catch(() => { if (!cancelled?.()) setMaterials([]) })
            .finally(() => { if (!cancelled?.()) setLoading(false) })
    }

    useEffect(() => {
        let cancelled = false
        setMaterials([])
        setPendingDelete(null)
        setDeleteError('')
        load(() => cancelled)
        return () => { cancelled = true }
    }, [user?.id])

    // 上传素材
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !user) return
        if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(file.type.toLowerCase())) {
            toast.error('仅支持 PNG、JPG、WEBP 或 GIF 图片')
            e.target.value = ''
            return
        }
        if (file.size > 10 * 1024 * 1024) { toast.error('图片不能超过 10MB'); return }

        setUploading(true)
        try {
            const base64 = await fileAsDataUrl(file)
            await uploadMaterial({ filename: file.name, data: base64, type: 'image' })
            setLoading(true)
            load()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '上传失败')
        }
        finally {
            setUploading(false);
            if (fileRef.current) {
                fileRef.current.value = ''
            }
        }
    }

    // 删除素材
    const handleDelete = async () => {
        if (!user || !pendingDelete || deleting) return
        setDeleting(true)
        setDeleteError('')
        try {
            await deleteMaterial(pendingDelete.id)
            setPendingDelete(null)
            setLoading(true)
            load()
        } catch (error) {
            setDeleteError(error instanceof Error ? error.message : '删除失败，请稍后重试')
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="enter-workspace flex-1 overflow-y-auto px-16 pt-8">
            <div className="mx-auto">
                <div className="flex items-end justify-between mb-7">
                    <div>
                        <div className="workspace-label mb-2">Asset library</div>
                        <h1 className="text-2xl font-bold">素材库</h1>
                        <p className="text-sm text-muted-foreground mt-1.5">管理图片与视觉创作参考，共 {materials.length} 张图片</p>
                    </div>
                    <div>
                        <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif" onChange={handleUpload} className="hidden" disabled={uploading || !user} />
                        <Button onClick={() => fileRef.current?.click()} disabled={uploading || !user} className="h-10 rounded-lg bg-[#f5222d] hover:bg-[#df1722] text-white gap-2">
                            <Upload className="w-4 h-4" />{uploading ? '上传中...' : '上传素材'}
                        </Button>
                    </div>
                </div>

                {!user ? (
                    <AuthRequired className="min-h-[50vh]" />
                ) : loading ? (
                    <div className="text-center py-12 text-muted-foreground">加载中...</div>
                ) : materials.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">暂无素材</div>
                ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {materials.map((m) => {
                            return (
                                <div key={m.id} className="workspace-card group overflow-hidden hover:border-red-200 transition-all hover:-translate-y-0.5">
                                    <div className="aspect-[16/9] bg-muted flex items-center justify-center relative overflow-hidden">
                                        <img src={m.url} alt={m.filename} className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => {
                                                setDeleteError('')
                                                setPendingDelete(m)
                                            }}
                                            type="button"
                                            aria-label={`删除素材 ${m.filename}`}
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
            <Dialog open={!!pendingDelete} onOpenChange={(open) => {
                if (!open && !deleting) {
                    setPendingDelete(null)
                    setDeleteError('')
                }
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>确认删除素材？</DialogTitle>
                        <DialogDescription>
                            删除后，“{pendingDelete?.filename}”将从素材库和云端中永久删除，已经引用该素材的文章可能无法继续显示图片。
                        </DialogDescription>
                    </DialogHeader>
                    {deleteError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{deleteError}</div>}
                    <DialogFooter className='bg-background pt-0'>
                        <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>取消</Button>
                        <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
                            {deleting ? '删除中…' : '确认删除'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
