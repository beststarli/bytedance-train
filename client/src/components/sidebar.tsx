import React from 'react'
import {
    PenSquare,
    Home,
    FileText,
    Sparkles,
    FolderOpen,
    Shield,
    User,
    PlusSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SidebarProps {
    activeMenu: string
    onMenuChange: (menu: string) => void
}

const menuItems = [
    { id: "create", label: "开始创作", icon: PlusSquare, highlight: true },
    { id: "home", label: "热点爆文", icon: Home },
    { id: "works", label: "作品管理", icon: FileText },
    { id: "prompts", label: "提示词管理", icon: Sparkles },
    { id: "materials", label: "素材管理", icon: FolderOpen },
    { id: "review", label: "内容审核", icon: Shield },
    { id: "userPage", label: "个人中心", icon: User },
]

export default function Sidebar({ activeMenu, onMenuChange }: SidebarProps) {
    return (
        <aside className="w-56 h-screen bg-background border-r flex flex-col fixed left-0 top-0 z-40">
            {/* Logo */}
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
                        </li>
                    ))}
                </ul>
            </nav>

            {/* 底部版权信息 */}
            <footer className="p-2 text-center flex flex-col gap-1 text-sm text-slate-300 ">
                <div className=''>
                    <div>CopyRight © BestStar. </div>
                    <div>All rights reserved.</div>
                </div>
                <div>字节跳动2026工程训练营项目</div>
            </footer>
        </aside>
    )
}
