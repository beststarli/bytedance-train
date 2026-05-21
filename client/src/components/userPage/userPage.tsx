"use client"

import React, { useState, useEffect, useRef } from 'react'
import { User, Mail, Lock, Phone, Check, Pencil, Eye, EyeOff, Camera } from 'lucide-react'
import { useAuthStore } from '@/store/userStore'
import { api } from '@/api/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function UserPage() {
    const { user, setAuth, token } = useAuthStore()

    const [nickname, setNickname] = useState(user?.nickname || '')
    const [email, setEmail] = useState(user?.email || '')
    const [saving, setSaving] = useState(false)
    const [saveMessage, setSaveMessage] = useState('')
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // 密码相关
    const [showPasswordForm, setShowPasswordForm] = useState(false)
    const [oldPassword, setOldPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showOldPwd, setShowOldPwd] = useState(false)
    const [showNewPwd, setShowNewPwd] = useState(false)
    const [showConfirmPwd, setShowConfirmPwd] = useState(false)
    const [settingPassword, setSettingPassword] = useState(false)
    const [passwordMessage, setPasswordMessage] = useState('')

    useEffect(() => {
        setNickname(user?.nickname || '')
        setEmail(user?.email || '')
    }, [user])

    const handleSaveProfile = async () => {
        setSaving(true)
        setSaveMessage('')
        try {
            const data = await api<{ user: any }>('/api/auth/profile', {
                method: 'PUT',
                body: JSON.stringify({ nickname, email }),
            })
            setAuth(data.user, token!)
            setSaveMessage('保存成功')
            setTimeout(() => setSaveMessage(''), 2000)
        } catch (err: any) {
            setSaveMessage(err.message || '保存失败')
        } finally {
            setSaving(false)
        }
    }

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/')) {
            setSaveMessage('请选择图片文件')
            return
        }
        if (file.size > 2 * 1024 * 1024) {
            setSaveMessage('图片大小不能超过2MB')
            return
        }

        setUploading(true)
        setSaveMessage('')
        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(reader.result as string)
                reader.onerror = reject
                reader.readAsDataURL(file)
            })

            const data = await api<{ user: any }>('/api/auth/avatar', {
                method: 'POST',
                body: JSON.stringify({ image: base64 }),
            })
            setAuth(data.user, token!)
            setSaveMessage('头像更新成功')
            setTimeout(() => setSaveMessage(''), 2000)
        } catch (err: any) {
            setSaveMessage(err.message || '上传失败')
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleSetPassword = async () => {
        if (newPassword !== confirmPassword) {
            setPasswordMessage('两次密码不一致')
            return
        }
        if (newPassword.length < 6) {
            setPasswordMessage('密码至少6位')
            return
        }

        setSettingPassword(true)
        setPasswordMessage('')
        try {
            await api('/api/auth/password', {
                method: 'PUT',
                body: JSON.stringify({
                    old_password: oldPassword || undefined,
                    new_password: newPassword,
                }),
            })
            setPasswordMessage('密码设置成功')
            setOldPassword('')
            setNewPassword('')
            setConfirmPassword('')
            setTimeout(() => {
                setPasswordMessage('')
                setShowPasswordForm(false)
            }, 1500)
        } catch (err: any) {
            setPasswordMessage(err.message || '设置失败')
        } finally {
            setSettingPassword(false)
        }
    }

    const avatarText = user?.nickname?.charAt(0) || user?.phone?.slice(-1) || '?'

    return (
        <div className="flex-1 overflow-y-auto">
            {/* 头部 - 大型头像 + 昵称 */}
            <div className="bg-gradient-to-r from-red-500/10 via-orange-500/5 to-transparent px-8 pt-8 pb-10">
                <div className="flex items-center gap-6">
                    {/* 可编辑头像 */}
                    <div className="relative group shrink-0">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-3xl font-bold ring-4 ring-white shadow-lg overflow-hidden">
                            {user?.avatar_url ? (
                                <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                            ) : (
                                avatarText
                            )}
                        </div>
                        {/* 悬浮编辑遮罩 */}
                        <label
                            htmlFor="avatar-upload"
                            className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                        >
                            <Camera className="w-6 h-6 text-white" />
                        </label>
                        <input
                            id="avatar-upload"
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="hidden"
                            disabled={uploading}
                        />
                        {uploading && (
                            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{user?.nickname || '未设置昵称'}</h1>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            <Phone className="w-3.5 h-3.5" />
                            <span>{user?.phone}</span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 ml-1">
                                已认证
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 内容区域 */}
            <div className="px-8 py-6 max-w-2xl space-y-8">
                {/* 基础信息 */}
                <section>
                    <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                        <User className="w-4 h-4 text-red-500" />
                        基础信息
                    </h2>
                    <div className="bg-card rounded-xl border p-6 space-y-5">
                        {/* 手机号（只读） */}
                        <div className="flex items-center justify-between py-1">
                            <Label className="text-sm text-muted-foreground shrink-0 w-20">手机号</Label>
                            <div className="flex items-center gap-2 text-sm">
                                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                                <span>{user?.phone}</span>
                                <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">已绑定</span>
                            </div>
                        </div>
                        <div className="h-px bg-border" />

                        {/* 昵称 */}
                        <div className="flex items-center justify-between gap-4">
                            <Label htmlFor="nickname" className="text-sm text-muted-foreground shrink-0 w-20">昵称</Label>
                            <div className="flex-1 max-w-sm">
                                <Input
                                    id="nickname"
                                    value={nickname}
                                    onChange={(e) => setNickname(e.target.value)}
                                    placeholder="设置昵称"
                                    className="h-9"
                                    maxLength={20}
                                />
                            </div>
                        </div>
                        <div className="h-px bg-border" />

                        {/* 邮箱 */}
                        <div className="flex items-center justify-between gap-4">
                            <Label htmlFor="email" className="text-sm text-muted-foreground shrink-0 w-20">邮箱</Label>
                            <div className="flex-1 max-w-sm">
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="绑定邮箱（选填）"
                                    className="h-9"
                                />
                            </div>
                        </div>

                        {/* 保存按钮 */}
                        <div className="flex items-center gap-3 pt-2">
                            <Button
                                onClick={handleSaveProfile}
                                disabled={saving}
                                className="bg-red-500 hover:bg-red-600 text-white"
                                size="sm"
                            >
                                {saving ? '保存中...' : '保存'}
                            </Button>
                            {saveMessage && (
                                <span className={`text-sm ${saveMessage === '保存成功' || saveMessage === '头像更新成功' ? 'text-green-600' : 'text-red-500'}`}>
                                    {saveMessage === '保存成功' || saveMessage === '头像更新成功' ? (
                                        <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" />{saveMessage}</span>
                                    ) : saveMessage}
                                </span>
                            )}
                        </div>
                    </div>
                </section>

                {/* 安全设置 */}
                <section>
                    <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-red-500" />
                        安全设置
                    </h2>
                    <div className="bg-card rounded-xl border p-6">
                        {!showPasswordForm ? (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center">
                                        <Lock className="w-4 h-4 text-amber-600" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium">登录密码</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            {user?.password_hash ? '已设置' : '未设置'}密码
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowPasswordForm(true)}
                                >
                                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                                    {user?.password_hash ? '修改' : '设置'}
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {user?.password_hash && (
                                    <div>
                                        <Label htmlFor="old-password" className="text-sm text-muted-foreground">当前密码</Label>
                                        <div className="relative mt-1.5">
                                            <Input
                                                id="old-password"
                                                type={showOldPwd ? 'text' : 'password'}
                                                value={oldPassword}
                                                onChange={(e) => setOldPassword(e.target.value)}
                                                placeholder="输入当前密码"
                                                className="h-9 pr-9"
                                            />
                                            <button
                                                type="button"
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                                                onClick={() => setShowOldPwd(!showOldPwd)}
                                            >
                                                {showOldPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <Label htmlFor="new-password" className="text-sm text-muted-foreground">新密码</Label>
                                    <div className="relative mt-1.5">
                                        <Input
                                            id="new-password"
                                            type={showNewPwd ? 'text' : 'password'}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="至少6位密码"
                                            className="h-9 pr-9"
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                                            onClick={() => setShowNewPwd(!showNewPwd)}
                                        >
                                            {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="confirm-password" className="text-sm text-muted-foreground">确认密码</Label>
                                    <div className="relative mt-1.5">
                                        <Input
                                            id="confirm-password"
                                            type={showConfirmPwd ? 'text' : 'password'}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="再次输入新密码"
                                            className="h-9 pr-9"
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                                            onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                                        >
                                            {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                {passwordMessage && (
                                    <p className={`text-sm ${passwordMessage === '密码设置成功' ? 'text-green-600' : 'text-red-500'}`}>
                                        {passwordMessage === '密码设置成功' ? (
                                            <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" />{passwordMessage}</span>
                                        ) : passwordMessage}
                                    </p>
                                )}
                                <div className="flex items-center gap-2 pt-1">
                                    <Button
                                        onClick={handleSetPassword}
                                        disabled={settingPassword || !newPassword || !confirmPassword}
                                        className="bg-red-500 hover:bg-red-600 text-white"
                                        size="sm"
                                    >
                                        {settingPassword ? '设置中...' : '确认'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setShowPasswordForm(false)
                                            setPasswordMessage('')
                                            setOldPassword('')
                                            setNewPassword('')
                                            setConfirmPassword('')
                                        }}
                                    >
                                        取消
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    )
}
