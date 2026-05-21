import React, { useState } from 'react'
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { api } from '@/api/api'
import { useAuthStore } from '@/store/userStore'

interface LoginProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export default function Login({ open, onOpenChange }: LoginProps) {
    const setAuth = useAuthStore((s) => s.setAuth)

    const [phone, setPhone] = useState("")
    const [verifyCode, setVerifyCode] = useState("")
    const [accountPhone, setAccountPhone] = useState("")
    const [password, setPassword] = useState("")
    const [agreed, setAgreed] = useState(false)
    const [countdown, setCountdown] = useState(0)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const handleSendCode = async () => {
        if (!phone || countdown > 0) return
        setError("")
        try {
            await api('/api/auth/send-code', {
                method: 'POST',
                body: JSON.stringify({ phone }),
            })
            setCountdown(60)
            const timer = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer)
                        return 0
                    }
                    return prev - 1
                })
            }, 1000)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handlePhoneLogin = async () => {
        if (!phone || !verifyCode || !agreed) return
        setError("")
        setLoading(true)
        try {
            const data = await api<{ token: string; user: any }>('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ phone, code: verifyCode }),
            })
            setAuth(data.user, data.token)
            onOpenChange(false)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handlePasswordLogin = async () => {
        if (!accountPhone || !password || !agreed) return
        setError("")
        setLoading(true)
        try {
            const data = await api<{ token: string; user: any }>('/api/auth/login-password', {
                method: 'POST',
                body: JSON.stringify({ account: accountPhone, password }),
            })
            setAuth(data.user, data.token)
            onOpenChange(false)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[440px] p-4 overflow-hidden">
                <DialogHeader className="px-6 pt-6">
                    <DialogTitle className="text-xl font-bold text-center">登录后内容更精彩</DialogTitle>
                </DialogHeader>

                {error && (
                    <div className="px-8 text-sm text-red-500 text-center">{error}</div>
                )}

                <Tabs defaultValue="phone" className="w-full">
                    <TabsList
                        variant="line"
                        className="w-full h-12 bg-transparent border-b rounded-none p-0"
                    >
                        <TabsTrigger
                            value="phone"
                            className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:text-red-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                        >
                            手机验证码登录
                        </TabsTrigger>
                        <TabsTrigger
                            value="password"
                            className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:text-red-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                        >
                            密码登录
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="phone" className="px-8 py-4 mt-0">
                        <div className="space-y-4">
                            <div className="flex gap-2">
                                <div className="flex items-center px-3 bg-muted rounded-md border text-sm text-muted-foreground">
                                    +86
                                </div>
                                <Input
                                    type="tel"
                                    placeholder="请输入手机号"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="flex-1"
                                />
                            </div>

                            <div className="flex gap-2">
                                <Input
                                    type="text"
                                    placeholder="请输入验证码"
                                    value={verifyCode}
                                    onChange={(e) => setVerifyCode(e.target.value)}
                                    className="flex-1"
                                />
                                <Button
                                    variant="outline"
                                    onClick={handleSendCode}
                                    disabled={countdown > 0 || !phone}
                                    className="whitespace-nowrap min-w-[100px]"
                                >
                                    {countdown > 0 ? `${countdown}秒后重发` : "获取验证码"}
                                </Button>
                            </div>

                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="agree-phone"
                                    checked={agreed}
                                    onCheckedChange={(checked) => setAgreed(checked as boolean)}
                                />
                                <Label htmlFor="agree-phone" className="text-xs text-muted-foreground leading-relaxed">
                                    登录即同意
                                    <a href="#" className="text-blue-500 hover:underline">《用户协议》</a>
                                    和
                                    <a href="#" className="text-blue-500 hover:underline">《隐私政策》</a>
                                </Label>
                            </div>

                            <Button
                                onClick={handlePhoneLogin}
                                disabled={!phone || !verifyCode || !agreed || loading}
                                className="w-full h-11 bg-red-500 hover:bg-red-600 text-white"
                            >
                                {loading ? "登录中..." : "登录"}
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="password" className="px-8 py-4 mt-0">
                        <div className="space-y-4">
                            <Input
                                type="text"
                                placeholder="请输入手机号或邮箱"
                                value={accountPhone}
                                onChange={(e) => setAccountPhone(e.target.value)}
                            />

                            <Input
                                type="password"
                                placeholder="请输入密码"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="agree-password"
                                        checked={agreed}
                                        onCheckedChange={(checked) => setAgreed(checked as boolean)}
                                    />
                                    <Label htmlFor="agree-password" className="text-xs text-muted-foreground leading-relaxed">
                                        登录即同意
                                        <a href="#" className="text-blue-500 hover:underline">《用户协议》</a>
                                        和
                                        <a href="#" className="text-blue-500 hover:underline">《隐私政策》</a>
                                    </Label>
                                </div>
                                <a href="#" className="text-xs text-blue-500 hover:underline">忘记密码?</a>
                            </div>

                            <Button
                                onClick={handlePasswordLogin}
                                disabled={!accountPhone || !password || !agreed || loading}
                                className="w-full h-11 bg-red-500 hover:bg-red-600 text-white"
                            >
                                {loading ? "登录中..." : "登录"}
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
