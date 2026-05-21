import React from 'react'
import {
    Bell,
    HelpCircle,
    Search,
    User
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface HeaderProps {
    onLoginClick: () => void
    isLoggedIn: boolean
}

export default function Header({
    onLoginClick,
    isLoggedIn
}: HeaderProps) {
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
                    <Button variant="ghost" size="icon" className="ml-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center">
                            <User className="w-4 h-4 text-white" />
                        </div>
                    </Button>
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
