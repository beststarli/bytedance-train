import React from 'react'
import {
    Bell,
    HelpCircle,
    Search,
    User,
    Settings,
    LogOut,
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
    const logout = useAuthStore((s) => s.logout)

    const avatarText = user?.nickname?.charAt(0) || user?.phone?.charAt(user.phone.length - 1) || '?'

    return (
        <header className="h-16 bg-background border-b flex items-center justify-between px-6 sticky top-0 z-30">
            {/* 左侧搜索 */}
            <div className="flex items-center gap-4">
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="搜索功能、内容..."
                        className="pl-9 h-9 bg-muted border-none"
                    />
                </div>
            </div>

            {/* 右侧操作区 */}
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                    <HelpCircle className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground relative">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                </Button>

                {isLoggedIn ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="ml-2 rounded-full">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-sm font-medium overflow-hidden">
                                    {user?.avatar_url ? (
                                        <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        avatarText
                                    )}
                                </div>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => onNavigate?.('userPage')}>
                                <User className="w-4 h-4" />
                                个人中心
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="cursor-pointer text-red-500 focus:text-red-500"
                                onClick={() => {
                                    logout()
                                }}
                            >
                                <LogOut className="w-4 h-4" />
                                退出登录
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Button
                        onClick={onLoginClick}
                        className="ml-2 bg-red-500 hover:bg-red-600 text-white"
                    >
                        登录
                    </Button>
                )}
            </div>
        </header>
    )
}
