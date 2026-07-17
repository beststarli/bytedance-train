import React from 'react'
import {
    Bell,
    HelpCircle,
    Search,
    User,
    LogOut,
    Command,
    ChevronDown,
    Plus,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/store/userStore'
import { logoutSession } from '@/api/api'

interface HeaderProps {
    onLoginClick: () => void
    isLoggedIn: boolean
    onNavigate?: (menu: string) => void
}

export default function Header({
    onLoginClick,
    isLoggedIn,
    onNavigate
}: HeaderProps) {
    const user = useAuthStore((s) => s.user)

    const avatarText = user?.nickname?.charAt(0) || user?.phone?.charAt(user.phone.length - 1) || '?'

    return (
        <header className="h-[72px] bg-white border-b flex items-center justify-between gap-3 px-3 sm:px-4 md:px-7 sticky top-0 z-30">
            {/* 左侧搜索 */}
            <div className="min-w-0 flex-1 sm:flex-none">
                <div className="relative w-full sm:w-[300px] xl:w-[360px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="搜索作品、素材或 Prompt"
                        className="pl-9 pr-14 h-10 bg-muted/70 border-transparent rounded-lg focus-visible:border-red-200 focus-visible:ring-red-100"
                    />
                    <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border bg-background px-1.5 py-1 text-[10px] text-muted-foreground sm:flex">
                        <Command className="w-3 h-3" /> K
                    </div>
                </div>
            </div>

            {/* 右侧操作区 */}
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="hidden rounded-lg text-muted-foreground hover:text-foreground sm:inline-flex">
                    <HelpCircle className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="relative hidden rounded-lg text-muted-foreground hover:text-foreground sm:inline-flex">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                </Button>

                {isLoggedIn ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="ml-1 h-11 rounded-lg px-2.5 gap-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-sm font-medium overflow-hidden">
                                    {user?.avatar_url ? (
                                        <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        avatarText
                                    )}
                                </div>
                                <div className="hidden lg:block text-left">
                                    <div className="text-xs font-semibold max-w-24 truncate">{user?.nickname || '创作者'}</div>
                                    <div className="text-[10px] text-muted-foreground">个人工作区</div>
                                </div>
                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => onNavigate?.('userPage')}>
                                <User className="w-4 h-4" />
                                个人中心
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="cursor-pointer text-red-500 focus:text-red-500"
                                onClick={() => void logoutSession()}
                            >
                                <LogOut className="w-4 h-4" />
                                退出登录
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Button
                        onClick={onLoginClick}
                        className="shrink-0 rounded-lg bg-[#f5222d] px-3 text-white hover:bg-[#df1722]"
                    >
                        <Plus className="w-4 h-4" /> <span className="hidden sm:inline">登录并创作</span><span className="sm:hidden">登录</span>
                    </Button>
                )}
            </div>
        </header>
    )
}
