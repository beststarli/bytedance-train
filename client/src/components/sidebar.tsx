import React, { useState } from 'react'
import {
    PenSquare,
    Home,
    FolderOpen,
    BarChart3,
    Settings,
    MessageSquare,
    FileText,
    Shield,
    Sparkles,
    ChevronDown,
    ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SidebarProps {
    activeMenu: string
    onMenuChange: (menu: string) => void
}

const menuItems = [
    { id: "create", label: "开始创作", icon: PenSquare, highlight: true },
    { id: "home", label: "首页", icon: Home },
    {
        id: "content",
        label: "内容管理",
        icon: FolderOpen,
        children: [
            { id: "content-works", label: "作品管理" },
            { id: "content-drafts", label: "草稿箱" },
            { id: "content-collections", label: "合集管理" },
        ]
    },
    {
        id: "data",
        label: "数据中心",
        icon: BarChart3,
        children: [
            { id: "data-overview", label: "数据总览" },
            { id: "data-content", label: "内容分析" },
            { id: "data-fans", label: "粉丝分析" },
        ]
    },
    { id: "interaction", label: "互动管理", icon: MessageSquare },
    { id: "ai-tools", label: "AI工具箱", icon: Sparkles },
    { id: "copyright", label: "原创保护", icon: Shield },
    { id: "articles", label: "文章发布", icon: FileText },
    { id: "settings", label: "设置", icon: Settings },
]

export default function Sidebar({
    activeMenu,
    onMenuChange
}: SidebarProps) {
    const [expandedMenus, setExpandedMenus] = useState<string[]>(["content", "data"])

    const toggleExpand = (menuId: string) => {
        setExpandedMenus(prev =>
            prev.includes(menuId)
                ? prev.filter(id => id !== menuId)
                : [...prev, menuId]
        )
    }

    return (
        <aside className="w-56 h-screen bg-background border-r flex flex-col fixed left-0 top-0 z-40">
            {/* Logo区域 */}
            <div className="h-16 flex items-center px-4 border-b">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-sm">头条</span>
                    </div>
                    <span className="font-semibold text-sm">AI创作者中心</span>
                </div>
            </div>

            {/* 导航菜单 */}
            <nav className="flex-1 py-4 overflow-y-auto">
                <ul className="space-y-1 px-2">
                    {menuItems.map((item) => (
                        <li key={item.id}>
                            {item.children ? (
                                <div>
                                    <button
                                        onClick={() => toggleExpand(item.id)}
                                        className={cn(
                                            "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                                            "hover:bg-muted text-foreground"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <item.icon className="w-5 h-5" />
                                            <span>{item.label}</span>
                                        </div>
                                        {expandedMenus.includes(item.id) ? (
                                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                        ) : (
                                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                        )}
                                    </button>
                                    {expandedMenus.includes(item.id) && (
                                        <ul className="ml-8 mt-1 space-y-1">
                                            {item.children.map((child) => (
                                                <li key={child.id}>
                                                    <button
                                                        onClick={() => onMenuChange(child.id)}
                                                        className={cn(
                                                            "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                                                            activeMenu === child.id
                                                                ? "bg-red-50 text-red-500"
                                                                : "hover:bg-muted text-muted-foreground"
                                                        )}
                                                    >
                                                        {child.label}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => onMenuChange(item.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                                        item.highlight && activeMenu !== item.id && "bg-red-500 text-white hover:bg-red-600",
                                        item.highlight && activeMenu === item.id && "bg-red-600 text-white",
                                        !item.highlight && activeMenu === item.id && "bg-red-50 text-red-500",
                                        !item.highlight && activeMenu !== item.id && "hover:bg-muted text-foreground"
                                    )}
                                >
                                    <item.icon className="w-5 h-5" />
                                    <span>{item.label}</span>
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            </nav>

            {/* 底部用户信息 */}
            <div className="p-4 border-t">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-sm text-muted-foreground">游</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">游客用户</div>
                        <div className="text-xs text-muted-foreground">点击登录</div>
                    </div>
                </div>
            </div>
        </aside>
    )
}
