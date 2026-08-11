import HomeClient from "@/app/home-client"
import type { FeedItem, HomeInitialData, HotNewsItem } from "@/types/home"

const serverPort = process.env.Server_Port || "4001"
const apiServer = process.env.INTERNAL_API_BASE_URL?.replace(/\/$/, "") || `http://localhost:${serverPort}`

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
	try {
		const response = await fetch(`${apiServer}${path}`, { cache: "no-store" })
		if (!response.ok) return fallback
		return await response.json() as T
	} catch {
		return fallback
	}
}

export default async function Home() {
	const [feed, hotFeed, news] = await Promise.all([
		fetchJson<{ works: FeedItem[] }>("/api/content/feed?sort=new&limit=10&offset=0", { works: [] }),
		fetchJson<{ works: FeedItem[] }>("/api/content/feed?sort=hot&limit=5&offset=0", { works: [] }),
		fetchJson<{ articles: HotNewsItem[]; configured: boolean }>("/api/content/hot-news", { articles: [], configured: false }),
	])

	const initialHomeData: HomeInitialData = {
		articles: feed.works,
		hotArticles: hotFeed.works,
		hotNews: news.articles,
		newsConfigured: news.configured,
	}

	return <HomeClient initialHomeData={initialHomeData} />
}
