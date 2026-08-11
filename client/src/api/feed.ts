import { api } from './api'

export type FeedSort = 'new' | 'hot' | 'likes'

export function getFeed<T>(sort: FeedSort, limit = 10, offset = 0) {
    return api<{ works: T[] }>(`/api/content/feed?sort=${sort}&limit=${limit}&offset=${offset}`).then((data) => data.works)
}

export function getHotNews<T>() {
    return api<{ articles: T[]; configured: boolean }>('/api/content/hot-news', { cache: 'no-store' })
}

export function getFeedWork<T>(workId: string) {
    return api<{ work: T }>(`/api/content/feed/${workId}`).then((data) => data.work)
}

export function toggleFeedReaction(workId: string, type: 'like' | 'favorite') {
    return api<{ active: boolean }>(`/api/content/feed/${workId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ type }),
    })
}
