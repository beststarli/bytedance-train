import React from 'react'

import {
    Video,
    ImageIcon,
    FileText,
    Newspaper,
    TrendingUp,
    Users,
    Eye,
    Heart,
    MessageCircle,
    Share2,
    ChevronRight,
    Calendar
} from "lucide-react"
import { Button } from "@/components/ui/button"

export default function MainPage() {
    return (
        <div className="flex-1 p-6 overflow-y-auto">
            {/* 新的创作入口 */}
            <section className="mb-8">
                <h2 className="text-lg font-semibold mb-4">新的创作</h2>
                <div className="grid grid-cols-4 gap-4">
                    {[
                        { label: "发布视频", desc: "支持mp4、webm格式", icon: Video, color: "bg-red-50 text-red-500 border-red-100" },
                        { label: "发布图文", desc: "支持png、jpg格式", icon: ImageIcon, color: "bg-blue-50 text-blue-500 border-blue-100" },
                        { label: "发布文章", desc: "支持8000字文本", icon: FileText, color: "bg-green-50 text-green-500 border-green-100" },
                        { label: "AI智能创作", desc: "AI辅助生成内容", icon: Newspaper, color: "bg-purple-50 text-purple-500 border-purple-100" },
                    ].map((item) => (
                        <button
                            key={item.label}
                            className={`p-4 rounded-xl border ${item.color} hover:shadow-md transition-shadow text-left`}
                        >
                            <item.icon className="w-8 h-8 mb-3" />
                            <div className="font-medium">{item.label}</div>
                            <div className="text-xs opacity-70 mt-1">{item.desc}</div>
                        </button>
                    ))}
                </div>
            </section>

            <div className="grid grid-cols-3 gap-6">
                {/* 数据中心 */}
                <section className="col-span-2 bg-background rounded-xl border p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold">数据中心</h2>
                            <span className="text-xs text-muted-foreground">
                                统计周期：2026.05.14-2026.05.21（每天12点更新）
                            </span>
                        </div>
                        <Button variant="ghost" size="sm" className="text-muted-foreground">
                            查看更多 <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </div>

                    {/* 数据统计卡片 */}
                    <div className="grid grid-cols-4 gap-4 mb-6">
                        {[
                            { label: "播放量", value: "2,456", change: "+128", icon: Eye, positive: true },
                            { label: "主页访问", value: "89", change: "-12", icon: Users, positive: false },
                            { label: "点赞数", value: "156", change: "+23", icon: Heart, positive: true },
                            { label: "评论数", value: "34", change: "+5", icon: MessageCircle, positive: true },
                        ].map((stat) => (
                            <div key={stat.label} className="p-4 bg-muted/50 rounded-lg">
                                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                    <stat.icon className="w-4 h-4" />
                                    <span className="text-sm">{stat.label}</span>
                                </div>
                                <div className="text-2xl font-semibold">{stat.value}</div>
                                <div className={`text-xs mt-1 ${stat.positive ? "text-green-500" : "text-red-500"}`}>
                                    较前7日 {stat.change}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 简易图表占位 */}
                    <div className="h-40 bg-muted/30 rounded-lg flex items-center justify-center">
                        <div className="flex items-end gap-2 h-24">
                            {[40, 65, 45, 80, 55, 70, 90].map((height, i) => (
                                <div
                                    key={i}
                                    className="w-8 bg-red-500/20 rounded-t transition-all hover:bg-red-500/40"
                                    style={{ height: `${height}%` }}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                {/* 右侧通知 */}
                <section className="space-y-6">
                    {/* 通知 */}
                    <div className="bg-background rounded-xl border p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold">通知</h2>
                            <Button variant="ghost" size="sm" className="text-muted-foreground text-xs">
                                查看更多
                            </Button>
                        </div>
                        <div className="space-y-3">
                            {[
                                { title: "系统升级通知", date: "2026-05-20" },
                                { title: "AI功能新增", date: "2026-05-18" },
                                { title: "活动邀请", date: "2026-05-15" },
                            ].map((notice, i) => (
                                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                                    <span className="text-sm truncate pr-2">{notice.title}</span>
                                    <span className="text-xs text-muted-foreground shrink-0">{notice.date}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 活动日历 */}
                    <div className="bg-background rounded-xl border p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold">活动中心</h2>
                            <div className="flex items-center gap-1 text-xs text-green-500">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                进行中
                            </div>
                        </div>
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <Calendar className="w-5 h-5" />
                            <span className="text-sm">2026年05月</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1 mt-3 text-center text-xs">
                            {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
                                <div key={d} className="py-1 text-muted-foreground">{d}</div>
                            ))}
                            {Array.from({ length: 31 }, (_, i) => (
                                <div
                                    key={i}
                                    className={`py-1.5 rounded ${i + 1 === 21 ? "bg-red-500 text-white" : "hover:bg-muted"}`}
                                >
                                    {i + 1}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>

            {/* 互动管理 */}
            <section className="mt-6 bg-background rounded-xl border p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">互动管理</h2>
                    <Button variant="ghost" size="sm" className="text-muted-foreground">
                        评论管理 <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: "待回复评论", count: 12, icon: MessageCircle },
                        { label: "新增粉丝", count: 5, icon: Users },
                        { label: "分享次数", count: 28, icon: Share2 },
                    ].map((item) => (
                        <div key={item.label} className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                                <item.icon className="w-6 h-6 text-red-500" />
                            </div>
                            <div>
                                <div className="text-2xl font-semibold">{item.count}</div>
                                <div className="text-sm text-muted-foreground">{item.label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
