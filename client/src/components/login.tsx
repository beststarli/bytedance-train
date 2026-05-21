import React, { useState } from 'react'
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface LoginProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export default function Login({
    open,
    onOpenChange
}: LoginProps) {
    const [phone, setPhone] = useState("")
    const [verifyCode, setVerifyCode] = useState("")
    const [accountPhone, setAccountPhone] = useState("")
    const [password, setPassword] = useState("")
    const [agreed, setAgreed] = useState(false)
    const [countdown, setCountdown] = useState(0)

    const handleSendCode = () => {
        if (!phone || countdown > 0) return
        // 模拟发送验证码
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
    }

    const handlePhoneLogin = () => {
        if (!phone || !verifyCode || !agreed) return
        console.log("[v0] Phone login:", { phone, verifyCode })
        onOpenChange(false)
    }

    const handlePasswordLogin = () => {
        if (!accountPhone || !password || !agreed) return
        console.log("[v0] Password login:", { accountPhone, password })
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-2">
                    <DialogTitle className="text-xl font-bold text-center">登录后内容更精彩</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="phone" className="w-full">
                    <TabsList className="w-full h-12 bg-transparent border-b rounded-none p-0">
                        <TabsTrigger
                            value="phone"
                            className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:text-red-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                        >
                            手机验证码登录
                        </TabsTrigger>
                        <TabsTrigger
                            value="password"
                            className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:text-red-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                        >
                            密码登录
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="phone" className="px-6 py-4 mt-0">
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
                                disabled={!phone || !verifyCode || !agreed}
                                className="w-full h-11 bg-red-500 hover:bg-red-600 text-white"
                            >
                                登录
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="password" className="px-6 py-4 mt-0">
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
                                disabled={!accountPhone || !password || !agreed}
                                className="w-full h-11 bg-red-500 hover:bg-red-600 text-white"
                            >
                                登录
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>

                <div className="px-6 pb-6 pt-2">
                    <div className="text-center text-xs text-muted-foreground">
                        还没有账号？
                        <a href="#" className="text-red-500 hover:underline ml-1">立即注册</a>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
