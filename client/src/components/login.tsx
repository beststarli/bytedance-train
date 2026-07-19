"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { userLoginByPassword, userRegister } from "@/api/login"
import { useAuthStore } from "@/store/userStore"
import { Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

interface LoginProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export default function Login({ open, onOpenChange }: LoginProps) {
    const setAuth = useAuthStore((state) => state.setAuth)
    const [activeTab, setActiveTab] = useState<"login" | "register">("login")
    const [account, setAccount] = useState("")
    const [loginPassword, setLoginPassword] = useState("")
    const [nickname, setNickname] = useState("")
    const [phone, setPhone] = useState("")
    const [email, setEmail] = useState("")
    const [registerPassword, setRegisterPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showRegisterPassword, setShowRegisterPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [agreed, setAgreed] = useState(false)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (open) return
        setActiveTab("login")
        setAccount("")
        setLoginPassword("")
        setNickname("")
        setPhone("")
        setEmail("")
        setRegisterPassword("")
        setConfirmPassword("")
        setShowRegisterPassword(false)
        setShowConfirmPassword(false)
        setAgreed(false)
        setLoading(false)
    }, [open])

    const closeAfterSuccess = (data: { user: any; accessToken: string }, message: string) => {
        setAuth(data.user, data.accessToken)
        onOpenChange(false)
        toast.success(message)
    }

    const handleLogin = async (event?: React.FormEvent) => {
        event?.preventDefault()
        if (!account.trim() || !loginPassword) {
            toast.error("请输入手机号或邮箱及密码")
            return
        }
        if (!agreed) {
            toast.error("请先同意用户协议与隐私政策")
            return
        }
        setLoading(true)
        try {
            closeAfterSuccess(await userLoginByPassword(account.trim(), loginPassword), "登录成功")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "登录失败")
        } finally {
            setLoading(false)
        }
    }

    const handleRegister = async (event?: React.FormEvent) => {
        event?.preventDefault()
        if (!nickname.trim() || !phone.trim() || !email.trim() || !registerPassword || !confirmPassword) {
            toast.error("请完整填写注册信息")
            return
        }
        if (!/^1\d{10}$/.test(phone.trim())) {
            toast.error("手机号格式不正确")
            return
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            toast.error("邮箱格式不正确")
            return
        }
        if (registerPassword.length < 6) {
            toast.error("密码至少 6 位")
            return
        }
        if (registerPassword !== confirmPassword) {
            toast.error("两次输入的密码不一致")
            return
        }
        if (!agreed) {
            toast.error("请先同意用户协议与隐私政策")
            return
        }
        setLoading(true)
        try {
            closeAfterSuccess(await userRegister({
                nickname: nickname.trim(),
                phone: phone.trim(),
                email: email.trim(),
                password: registerPassword,
                confirmPassword,
            }), "注册成功，已自动登录")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "注册失败")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-[460px]">
                <DialogHeader className="px-6 pt-6">
                    <DialogTitle className="text-center text-xl font-bold">欢迎来到 AI 创作中心</DialogTitle>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "login" | "register")} className="w-full">
                    <TabsList variant="line" className="mb-0 h-12 w-full rounded-none border-b bg-transparent p-0">
                        <TabsTrigger value="login" className="h-full flex-1 rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:text-red-500 data-[state=active]:shadow-none">登录</TabsTrigger>
                        <TabsTrigger value="register" className="h-full flex-1 rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:text-red-500 data-[state=active]:shadow-none">注册</TabsTrigger>
                    </TabsList>

                    <TabsContent value="login" className="mt-0 px-8 py-5">
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="login-account">账号</Label>
                                <Input id="login-account" autoComplete="username" value={account} onChange={(event) => setAccount(event.target.value)} placeholder="请输入手机号或邮箱" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="login-password">密码</Label>
                                <Input id="login-password" type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="请输入密码" />
                            </div>
                            <Agreement checked={agreed} onCheckedChange={setAgreed} />
                            <Button type="submit" disabled={loading || !account.trim() || !loginPassword || !agreed} className="h-11 w-full bg-red-500 text-white hover:bg-red-600">{loading ? "登录中…" : "登录"}</Button>
                        </form>
                    </TabsContent>

                    <TabsContent value="register" className="mt-0 px-8 py-5">
                        <form onSubmit={handleRegister} className="space-y-3.5">
                            <div className="space-y-1.5"><Label htmlFor="register-nickname">昵称</Label><Input id="register-nickname" autoComplete="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="2 至 50 个字符" /></div>
                            <div className="space-y-1.5"><Label htmlFor="register-phone">手机号</Label><Input id="register-phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="请输入 11 位手机号" /></div>
                            <div className="space-y-1.5"><Label htmlFor="register-email">邮箱</Label><Input id="register-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="请输入邮箱地址" /></div>
                            <div className="space-y-1.5">
                                <Label htmlFor="register-password">密码</Label>
                                <div className="relative">
                                    <Input id="register-password" type={showRegisterPassword ? "text" : "password"} autoComplete="new-password" value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} placeholder="至少 6 位" className="pr-10" />
                                    <button type="button" onClick={() => setShowRegisterPassword((visible) => !visible)} aria-label={showRegisterPassword ? "隐藏密码" : "显示密码"} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                                        {showRegisterPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="register-confirm-password">确认密码</Label>
                                <div className="relative">
                                    <Input id="register-confirm-password" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="请再次输入密码" className="pr-10" />
                                    <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "隐藏确认密码" : "显示确认密码"} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <Agreement checked={agreed} onCheckedChange={setAgreed} />
                            <Button type="submit" disabled={loading || !nickname.trim() || !phone.trim() || !email.trim() || !registerPassword || !confirmPassword || !agreed} className="h-11 w-full bg-red-500 text-white hover:bg-red-600">{loading ? "注册中…" : "注册并登录"}</Button>
                        </form>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

function Agreement({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
    return (
        <div className="flex items-start gap-2">
            <Checkbox id="auth-agreement" checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
            <Label htmlFor="auth-agreement" className="text-xs leading-relaxed text-muted-foreground">
                我已阅读并同意
                <a href="#" className="text-blue-500 hover:underline">《用户协议》</a>
                和
                <a href="#" className="text-blue-500 hover:underline">《隐私政策》</a>
            </Label>
        </div>
    )
}
