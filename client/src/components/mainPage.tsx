"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Flame, Clock, Star, Eye, Heart, MessageCircle, TrendingUp } from 'lucide-react'
import { api } from '@/api/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface FeedItem {
  id: string
  title: string
  content: string
  quality_score: number | null
  view_count: number
  created_at: string
  nickname: string
  avatar_url: string | null
}

type SortMode = 'hot' | 'new' | 'quality'

const tabs: { key: SortMode; label: string; icon: React.ElementType }[] = [
  { key: 'hot', label: '热门', icon: Flame },
  { key: 'new', label: '最新', icon: Clock },
  { key: 'quality', label: '优质', icon: Star },
]

export default function MainPage() {
  const [works, setWorks] = useState<FeedItem[]>([])
  const [sort, setSort] = useState<SortMode>('hot')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)
  const offsetRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadFeed = useCallback(async (reset = false) => {
    if (reset) { offsetRef.current = 0; setLoading(true) }
    else setLoadingMore(true)

    try {
      const data = await api<{ works: FeedItem[]; total: number; has_more: boolean }>(
        `/api/content/feed?sort=${sort}&limit=10&offset=${offsetRef.current}`
      )
      if (reset) setWorks(data.works)
      else setWorks((prev) => [...prev, ...data.works])
      setTotal(data.total)
      setHasMore(data.has_more)
      offsetRef.current += 10
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [sort])

  useEffect(() => {
    loadFeed(true)
  }, [loadFeed])

  // 滚动加载
  useEffect(() => {
    if (!sentinelRef.current) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadFeed(false)
        }
      },
      { rootMargin: '200px' }
    )
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [hasMore, loadingMore, loading, loadFeed])

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}分钟前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}小时前`
    const days = Math.floor(hours / 24)
    return `${days}天前`
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 顶部横幅 */}
      <div className="bg-gradient-to-r from-red-500 via-orange-500 to-red-500 px-8 py-10">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            热点爆文
          </h1>
          <p className="text-white/80 text-sm mt-1">发现优质内容，追踪创作热点</p>
        </div>
      </div>

      {/* 排序标签 */}
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-8 flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSort(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-colors',
                sort === tab.key
                  ? 'border-red-500 text-red-500 font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
          <div className="flex-1 text-right text-xs text-muted-foreground">
            共 {total} 篇
          </div>
        </div>
      </div>

      {/* 内容列表 */}
      <div className="max-w-4xl mx-auto px-8 py-6">
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">加载中...</div>
        ) : works.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Flame className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>暂无内容</p>
          </div>
        ) : (
          <div className="space-y-4">
            {works.map((work, i) => (
              <div
                key={work.id}
                className="p-5 rounded-xl border bg-card hover:border-red-200 hover:shadow-sm transition-all cursor-pointer group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
                    {work.avatar_url ? (
                      <img src={work.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      work.nickname?.charAt(0) || '?'
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{work.nickname || '匿名用户'}</span>
                      {work.quality_score && work.quality_score >= 8 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-medium">精选</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{timeAgo(work.created_at)}</div>
                  </div>
                  {i === 0 && sort === 'hot' && (
                    <Flame className="w-5 h-5 text-red-500 shrink-0" />
                  )}
                </div>

                <h3 className="text-base font-semibold mb-1.5 group-hover:text-red-500 transition-colors">{work.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">{work.content}</p>

                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{work.view_count}</span>
                  <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" />{Math.floor(Math.random() * 100)}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{Math.floor(Math.random() * 30)}</span>
                  {work.quality_score && (
                    <span className="flex items-center gap-1 ml-auto">
                      <Star className="w-3.5 h-3.5 text-yellow-500" />
                      质量分 {work.quality_score}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* 滚动加载哨兵 */}
            <div ref={sentinelRef} className="py-4">
              {loadingMore && <div className="text-center text-sm text-muted-foreground">加载更多...</div>}
              {!hasMore && works.length > 0 && (
                <div className="text-center text-sm text-muted-foreground py-4">已加载全部内容</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
