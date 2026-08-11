export interface FeedItem {
	id: string
	title: string
	content: string
	quality_score: number | null
	view_count: number
	created_at: string
	nickname: string
	like_count?: number
	favorite_count?: number
	hot_score?: number
	liked?: boolean
	favorited?: boolean
}

export interface HotNewsItem {
	title: string
	description?: string
	url: string
	publishedAt?: string
	source?: { name?: string }
}

export interface HomeInitialData {
	articles: FeedItem[]
	hotArticles: FeedItem[]
	hotNews: HotNewsItem[]
	newsConfigured: boolean
}
