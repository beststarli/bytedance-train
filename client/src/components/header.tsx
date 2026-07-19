"use client"

import React, { useEffect, useMemo, useState } from 'react'
import {
    Bell,
    Bookmark,
    FileText,
    HelpCircle,
    Heart,
    ImageIcon,
    Search,
    Sparkles,
    User,
    LogOut,
    Command,
    ChevronDown,
    Plus,
    Link,
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
import { api, logoutSession } from '@/api/api'
import { resolveAssetUrl } from '@/lib/asset-url'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface SearchItem {
    id: string
    title: string
    type: string
    category?: string
}

interface SearchResults {
    works: SearchItem[]
    materials: SearchItem[]
    prompts: SearchItem[]
}

interface Notification {
    id: string
    type: 'like' | 'favorite'
    created_at: string
    work_id: string
    work_title: string
    actor_name: string
    avatar_url?: string | null
}

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
    const [helpOpen, setHelpOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [searchFocused, setSearchFocused] = useState(false)
    const [searching, setSearching] = useState(false)
    const [results, setResults] = useState<SearchResults>({ works: [], materials: [], prompts: [] })
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [lastReadAt, setLastReadAt] = useState('')

    const avatarText = user?.nickname?.charAt(0) || user?.phone?.charAt(user.phone.length - 1) || '?'
    const notificationStorageKey = user ? `creator-notifications-read:${user.id}` : ''
    const unread = useMemo(
        () => notifications.some((item) => !lastReadAt || new Date(item.created_at) > new Date(lastReadAt)),
        [lastReadAt, notifications],
    )
    const hasSearchResults = results.works.length + results.materials.length + results.prompts.length > 0

    useEffect(() => {
        if (!user) {
            setNotifications([])
            setLastReadAt('')
            return
        }
        setLastReadAt(localStorage.getItem(`creator-notifications-read:${user.id}`) || '')
        const load = () => api<{ notifications: Notification[] }>('/api/content/notifications')
            .then((data) => setNotifications(data.notifications))
            .catch(() => setNotifications([]))
        void load()
        const timer = window.setInterval(load, 30_000)
        return () => window.clearInterval(timer)
    }, [user])

    useEffect(() => {
        const keyword = query.trim()
        if (keyword.length < 2) {
            setResults({ works: [], materials: [], prompts: [] })
            setSearching(false)
            return
        }
        setSearching(true)
        let cancelled = false
        const timer = window.setTimeout(() => {
            api<SearchResults>(`/api/content/search?q=${encodeURIComponent(keyword)}`)
                .then((data) => {
                    if (!cancelled) setResults(data)
                })
                .catch(() => {
                    if (!cancelled) setResults({ works: [], materials: [], prompts: [] })
                })
                .finally(() => {
                    if (!cancelled) setSearching(false)
                })
        }, 300)
        return () => {
            cancelled = true
            window.clearTimeout(timer)
        }
    }, [query])

    const openNotifications = (open: boolean) => {
        if (!open || !notificationStorageKey) return
        const now = new Date().toISOString()
        localStorage.setItem(notificationStorageKey, now)
        setLastReadAt(now)
    }

    const chooseSearchResult = (type: 'work' | 'material' | 'prompt') => {
        setSearchFocused(false)
        if (type === 'work') onNavigate?.('dashboard')
        else if (type === 'material') onNavigate?.('materials')
        else onNavigate?.('prompts')
    }

    const resultGroup = (label: string, items: SearchItem[], type: 'work' | 'material' | 'prompt') => {
        if (!items.length) return null
        const Icon = type === 'work' ? FileText : type === 'material' ? ImageIcon : Sparkles
        return (
            <div className="border-b py-1 last:border-b-0">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
                {items.map((item) => (
                    <button key={`${type}-${item.id}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSearchResult(type)} className="focus-red flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-red-50/60">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{item.title}</span>
                    </button>
                ))}
            </div>
        )
    }

    return (
        <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center justify-between gap-3 border-b bg-white px-3 sm:px-4 md:px-7">
            {/* 左侧搜索 */}
            <div className="min-w-0 flex-1 sm:flex-none">
                <div className="relative w-full border rounded-lg sm:w-[300px] xl:w-[360px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="搜索作品、素材或提示词"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setSearchFocused(false)}
                        className="pl-9 pr-14 h-10 bg-muted border-transparent rounded-lg focus-visible:border-red-200 focus-visible:ring-red-100"
                    />
                    <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border bg-background px-1.5 py-1 text-[10px] text-muted-foreground sm:flex">
                        <Command className="w-3 h-3" /> K
                    </div>
                    {searchFocused && query.trim().length >= 2 && (
                        <div className="absolute left-0 right-0 top-12 z-50 max-h-80 overflow-y-auto rounded-lg border bg-white py-1 shadow-lg">
                            {searching ? (
                                <div className="px-4 py-8 text-center text-xs text-muted-foreground">正在搜索…</div>
                            ) : hasSearchResults ? (
                                <>
                                    {resultGroup('作品', results.works, 'work')}
                                    {resultGroup('素材', results.materials, 'material')}
                                    {resultGroup('提示词模版', results.prompts, 'prompt')}
                                </>
                            ) : (
                                <div className="px-4 py-8 text-center text-xs text-muted-foreground">没有找到相关内容</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 右侧操作区 */}
            <div className="flex items-center gap-2">
                <a href="https://www.toutiao.com" target="_blank" rel="noopener noreferrer" className="hidden rounded-lg text-muted-foreground  sm:inline-flex items-center justify-center w-8 h-8 hover:bg-accent transition-colors hover:text-red-500">
                    <Link className="w-4 h-4 " />
                </a>
                <Button variant="ghost" size="icon" onClick={() => setHelpOpen(true)} className="hidden cursor-pointer rounded-lg text-muted-foreground hover:text-foreground sm:inline-flex">
                    <HelpCircle className="w-5 h-5" />
                </Button>
                <DropdownMenu onOpenChange={openNotifications}>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="relative hidden cursor-pointer rounded-lg text-muted-foreground hover:text-foreground sm:inline-flex">
                            <Bell className="w-5 h-5" />
                            {unread && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80 p-0">
                        <div className="flex items-center justify-between border-b px-4 py-3"><strong className="text-sm">互动通知</strong><span className="text-[10px] text-muted-foreground">最近动态</span></div>
                        <div className="max-h-80 overflow-y-auto py-1">
                            {notifications.length ? notifications.map((item) => (
                                <DropdownMenuItem key={item.id} onClick={() => onNavigate?.('works')} className="cursor-pointer gap-3 px-3 py-3">
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.type === 'like' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>
                                        {item.type === 'like' ? <Heart className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-xs"><strong>{item.actor_name}</strong> {item.type === 'like' ? '点赞了' : '收藏了'}你的作品</span>
                                        <span className="mt-1 block truncate text-[10px] text-muted-foreground">{item.work_title}</span>
                                    </span>
                                </DropdownMenuItem>
                            )) : <div className="px-4 py-10 text-center text-xs text-muted-foreground">暂时没有新的点赞或收藏</div>}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>

                {isLoggedIn ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="ml-1 h-11 rounded-lg px-2.5 gap-2">
                                <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-red-400 to-red-600 text-sm font-medium text-white">
                                    {avatarText}
                                    {user?.avatar_url && (
                                        <img src={resolveAssetUrl(user.avatar_url)} alt="avatar" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} />
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
                        className="shrink-0 rounded-lg bg-[#f5222d] px-2 py-2 text-white hover:bg-[#df1722]"
                    >
                        <Plus className="w-4 h-4" /> <span className="hidden sm:inline">登录并创作</span><span className="sm:hidden">登录</span>
                    </Button>
                )}
            </div>
            <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>AI创作者辅助生产与分发平台</DialogTitle>
                    </DialogHeader>
                    <div className="rounded-md flex flex-col items-center px-4 py-2">
                        <div>
                            Copyright ©{' '}
                            <a href="https://github.com/beststarli" target="_blank" rel="noopener noreferrer" className="cursor-pointer font-bold text-red-500 underline-offset-4 hover:underline">
                                BestStar
                            </a>
                            .
                            All rights reversed
                        </div>
                        <div>
                            字节跳动 2026 前端工程训练营今日头条部门项目
                        </div>

                    </div>
                </DialogContent>
            </Dialog>
        </header>
    )
}
