import React from 'react'
import {
    Home,
    FileText,
    Sparkles,
    FolderOpen,
    Shield,
    PlusSquare,
    Compass,
    UserRound,
    WandSparkles,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    PencilLineIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SidebarProps {
    activeMenu: string
    onMenuChange: (menu: string) => void
    collapsed: boolean
    onCollapsedChange: (collapsed: boolean) => void
    onHomeRefresh: () => void
}

const menuItems = [
    { id: "dashboard", label: "首页", icon: Home },
    { id: "create", label: "创作中心", icon: PencilLineIcon },
    { id: "works", label: "作品管理", icon: FileText },
    { id: "materials", label: "素材库", icon: FolderOpen },
    { id: "prompts", label: "提示词模版", icon: Sparkles },
    { id: "review", label: "内容审核", icon: Shield },
    { id: "inspiration", label: "创作灵感", icon: Compass },
    { id: "userPage", label: "个人中心", icon: UserRound },
]

export default function Sidebar({ activeMenu, onMenuChange, collapsed, onCollapsedChange, onHomeRefresh }: SidebarProps) {
    const activeRootMenu = activeMenu.split(":")[0]

    return (
        <>
            <aside className={cn(
                "fixed left-0 top-0 z-40 hidden h-screen flex-col border-r bg-white transition-[width] duration-200 lg:flex",
                collapsed ? "w-14" : "w-60",
            )}>
                {/* Logo */}
                <div className={cn("flex h-18 items-center border-b", collapsed ? "justify-center px-2" : "justify-between px-5")}>
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="w-9 h-9 bg-[#f5222d] rounded-lg flex items-center justify-center shadow-[0_6px_14px_rgba(245,34,45,.18)]">
                            <span className="text-white font-black text-sm tracking-tight">头条</span>
                        </div>
                        {!collapsed &&
                            <div className='flex flex-col -space-y-0.5 items-start'>
                                <div className="whitespace-nowrap font-bold text-lg tracking-tight">AI创作者</div>
                                <div className="whitespace-nowrap font-bold text-sm tracking-tight">辅助生产与分发平台</div>
                            </div>
                        }
                    </div>
                </div>

                <div className={cn("pt-2", collapsed ? "px-1" : "px-3")}>
                    <button
                        type="button"
                        title={collapsed ? "开始创作" : undefined}
                        onClick={() => onMenuChange("create")}
                        className={cn(
                            "focus-red cursor-pointer flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#f5222d] text-sm font-semibold text-white transition-colors hover:bg-[#df1722]",
                            collapsed && "mx-auto h-10 w-10 p-0",
                        )}
                    >
                        <WandSparkles className="h-[18px] w-[18px]" />
                        {!collapsed && "开始创作"}
                    </button>
                </div>

                {/* 导航菜单 */}
                <nav className="flex-1 overflow-y-auto pb-4 pt-2">
                    <ul className={cn("space-y-1", collapsed ? "px-1" : "px-3")}>
                        {menuItems.map((item) => (
                            <li key={item.id}>
                                <div className="relative group">
                                    <button
                                        type="button"
                                        title={collapsed ? item.label : undefined}
                                        onClick={() => item.id === "dashboard" ? onHomeRefresh() : onMenuChange(item.id)}
                                        className={cn(
                                            "focus-red group flex w-full items-center rounded-lg py-2.5 text-sm transition-all cursor-pointer",
                                            collapsed ? "mx-auto h-10 w-10 justify-center p-0" : "gap-3 px-3",
                                            activeRootMenu === item.id
                                                ? "bg-red-50 text-red-600 font-semibold "
                                                : "hover:bg-muted text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <item.icon className={cn("w-[18px] h-[18px]", activeRootMenu === item.id && "text-red-500")} />
                                        {!collapsed && <span>{item.label}</span>}
                                    </button>
                                    {item.id === "dashboard" && !collapsed && activeRootMenu === "dashboard" && (
                                        <button
                                            type="button"
                                            aria-label="刷新首页文章"
                                            title="刷新首页文章"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                onHomeRefresh()
                                            }}
                                            className="cursor-pointer focus-red absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-white hover:text-red-500"
                                        >
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </nav>

                {!collapsed && <div className="mx-4 px-4 py-2 border bg-muted/25 rounded-lg text-xs text-muted-foreground">
                    <div className="font-semibold text-foreground mb-1">创作系统运行正常</div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        AI 服务与审核服务已连接
                    </div>
                </div>}

                {/* 底部版权信息 */}
                {!collapsed && <footer className="px-4 py-4 text-center text-[10px] leading-4 text-muted-foreground/70">
                    <div>Copyright © BestStar. All rights reserved.</div>
                    <div>字节跳动 2026 工程训练营项目</div>
                </footer>}

                <button
                    type="button"
                    onClick={() => onCollapsedChange(!collapsed)}
                    aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
                    className="focus-red absolute -right-3 top-1/2 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-lg border bg-white text-muted-foreground shadow-sm hover:text-foreground"
                >
                    {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                </button>
            </aside>
            <nav className="fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-5 border-t bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
                {menuItems.slice(0, 5).map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onMenuChange(item.id)}
                        className={cn(
                            "focus-red flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-[10px]",
                            activeRootMenu === item.id ? "text-red-600" : "text-muted-foreground",
                        )}
                    >
                        <item.icon className="h-[18px] w-[18px]" />
                        <span className="max-w-full truncate">{item.label}</span>
                    </button>
                ))}
            </nav>
        </>
    )
}
