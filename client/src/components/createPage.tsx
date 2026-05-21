import React, { useState } from 'react'
import {
    Plus,
    Mic,
    Send,
    ImageIcon,
    FileText,
    Video,
    Sparkles
} from "lucide-react"
import { cn } from '@/lib/utils'
import { Button } from "@/components/ui/button"

const quickActions = [
    { id: "image", label: "生成图片", icon: ImageIcon },
    { id: "article", label: "撰写文章", icon: FileText },
    { id: "video", label: "视频脚本", icon: Video },
    { id: "optimize", label: "内容优化", icon: Sparkles },
]

export default function CreatePage() {
    const [inputValue, setInputValue] = useState("")
    const [isFocused, setIsFocused] = useState(false)

    const handleSubmit = () => {
        if (!inputValue.trim()) return
        console.log("[v0] Submit creation request:", inputValue)
        setInputValue("")
    }

    return (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
            {/* 标题 */}
            <div className="text-center mb-10">
                <h1 className="text-3xl font-semibold text-foreground mb-3 text-balance">
                    你今天想创作什么？
                </h1>
                <p className="text-muted-foreground">
                    AI助手帮你快速生成优质内容
                </p>
            </div>

            {/* 主输入框 */}
            <div className="w-full max-w-2xl">
                <div
                    className={cn(
                        "relative  bg-muted rounded-2xl border-2 transition-all duration-200",
                        isFocused ? "border-red-500 shadow-lg shadow-red-500/10" : "border-gray-150"
                    )}
                >
                    <div className="flex items-start p-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
                        >
                            <Plus className="w-5 h-5" />
                        </Button>

                        <textarea
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setIsFocused(false)}
                            placeholder="描述你想创作的内容，例如：帮我写一篇关于科技创新的文章..."
                            className="flex-1 bg-transparent border-none outline-none resize-none text-base placeholder:text-muted-foreground min-h-[60px] max-h-[200px] py-1 px-2"
                            rows={2}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSubmit()
                                }
                            }}
                        />

                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <Mic className="w-5 h-5" />
                            </Button>
                            <Button
                                size="icon"
                                onClick={handleSubmit}
                                disabled={!inputValue.trim()}
                                className={cn(
                                    "rounded-full transition-colors",
                                    inputValue.trim()
                                        ? "bg-red-500 hover:bg-red-600 text-white"
                                        : "bg-muted-foreground/20 text-muted-foreground cursor-not-allowed"
                                )}
                            >
                                <Send className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 快捷操作 */}
                <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
                    {quickActions.map((action) => (
                        <Button
                            key={action.id}
                            variant="outline"
                            className="gap-2 rounded-full hover:border-red-500 hover:text-red-500 transition-colors"
                        >
                            <action.icon className="w-4 h-4" />
                            {action.label}
                        </Button>
                    ))}
                </div>
            </div>

            {/* 最近创作 */}
            <div className="w-full max-w-2xl mt-16">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">最近创作</h3>
                <div className="grid grid-cols-2 gap-3">
                    {[
                        { title: "科技新闻稿撰写", time: "2小时前" },
                        { title: "产品宣传文案", time: "昨天" },
                        { title: "短视频脚本", time: "3天前" },
                        { title: "公众号文章", time: "上周" },
                    ].map((item, index) => (
                        <button
                            key={index}
                            className="flex items-center gap-3 p-3 rounded-lg border hover:border-red-500 hover:bg-red-50/50 transition-colors text-left group"
                        >
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-red-100">
                                <FileText className="w-5 h-5 text-muted-foreground group-hover:text-red-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{item.title}</div>
                                <div className="text-xs text-muted-foreground">{item.time}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}
