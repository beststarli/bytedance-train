import HomeRoute from "@/app/(workspace)/_components/home-route"
import type { FeedPage } from "@/api/feed"
import type { FeedItem, HomeInitialData } from "@/types/home"

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
	// 首屏只等待核心 Feed；外部热点新闻由客户端在主体渲染后独立加载。
	const [feed, hotFeed] = await Promise.all([
		fetchJson<FeedPage<FeedItem>>("/api/content/feed?sort=new&limit=10&offset=0", { works: [], total: 0, has_more: false }),
		fetchJson<FeedPage<FeedItem>>("/api/content/feed?sort=hot&limit=5&offset=0", { works: [], total: 0, has_more: false }),
	])

	const initialData: HomeInitialData = {
		articles: feed.works,
		articlesHasMore: feed.has_more,
		hotArticles: hotFeed.works,
		hotNews: [],
		newsConfigured: false,
	}
	return <HomeRoute initialData={initialData} />
}
