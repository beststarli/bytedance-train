"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useState } from "react"
import Sidebar from "@/components/sidebar/sidebar"
import Header from "@/components/header/header"
import MainPage from "@/components/mainPage/mainPage"
import { Toaster } from "sonner"
import { refreshAccessToken } from "@/api/api"
import { useAuthStore } from "@/store/userStore"
import TaskProgress from "@/components/taskProgress"
import { DRAFT_SYNC_EVENT } from "@/hooks/useDraftAutosave"
import type { HomeInitialData } from "@/types/home"

function WorkspaceLoading() {
	return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">正在加载工作区…</div>
}

const Login = dynamic(() => import("@/components/header/login"))
const WorksPage = dynamic(() => import("@/components/worksPage/worksPage"), { loading: WorkspaceLoading })
const ReviewPage = dynamic(() => import("@/components/reviewPage/reviewPage"), { loading: WorkspaceLoading })
const UserPage = dynamic(() => import("@/components/userPage/userPage"), { loading: WorkspaceLoading })
const CreatePage = dynamic(() => import("@/components/createPage/createPage"), { loading: WorkspaceLoading })
const PromptsPage = dynamic(() => import("@/components/promptPage/promptsPage"), { loading: WorkspaceLoading })
const MaterialsPage = dynamic(() => import("@/components/materialsPage/materialsPage"), { loading: WorkspaceLoading })

export default function HomeClient({ initialHomeData }: { initialHomeData: HomeInitialData }) {
	const [activeMenu, setActiveMenu] = useState("content")
	const [showLogin, setShowLogin] = useState(false)
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
	const [homeRefreshKey, setHomeRefreshKey] = useState(0)
	const [initialHomeDataFresh, setInitialHomeDataFresh] = useState(true)
	const user = useAuthStore((state) => state.user)
	const navigate = useCallback((menu: string) => {
		if (!menu.startsWith("create")) window.dispatchEvent(new Event(DRAFT_SYNC_EVENT))
		// SSR 首页数据只代表首次请求时的快照；离开后再次返回必须重新拉取 Feed。
		if (!menu.startsWith("content")) setInitialHomeDataFresh(false)
		setActiveMenu(menu)
	}, [])

	useEffect(() => {
		void refreshAccessToken()
	}, [])

	const renderContent = () => {
		const [menu, subview] = activeMenu.split(":")
		const privatePageKey = user?.id || "guest"
		switch (menu) {
			case "create":
				return <CreatePage key={`create-${privatePageKey}`} initialMode={subview === "manual" || subview === "ai" ? subview : undefined} onNavigate={navigate} />
			case "content":
				return <MainPage key={homeRefreshKey} initialData={initialHomeData} refreshFeedOnMount={!initialHomeDataFresh} onNavigate={navigate} />
			case "inspiration":
				return <MainPage onNavigate={navigate} mode="inspiration" />
			case "works":
				return <WorksPage key={`works-${privatePageKey}`} onNavigate={navigate} />
			case "prompts":
				return <PromptsPage key={`prompts-${privatePageKey}`} />
			case "materials":
				return <MaterialsPage key={`materials-${privatePageKey}`} />
			case "review":
				return <ReviewPage key={`review-${privatePageKey}`} onNavigate={navigate} />
			case "userPage":
				return <UserPage key={`profile-${privatePageKey}`} onNavigate={navigate} onLoginClick={() => setShowLogin(true)} />
			default:
				return (
					<div className="flex flex-1 items-center justify-center text-muted-foreground">
						<div className="text-center">
							<h2 className="mb-2 text-xl font-semibold">功能开发中</h2>
							<p className="text-sm">该功能正在开发中，敬请期待...</p>
						</div>
					</div>
				)
		}
	}

	return (
		<div className="h-dvh overflow-hidden bg-muted/30">
			<Sidebar
				activeMenu={activeMenu}
				onMenuChange={navigate}
				collapsed={sidebarCollapsed}
				onCollapsedChange={setSidebarCollapsed}
				onHomeRefresh={() => {
					setInitialHomeDataFresh(false)
					navigate("content")
					setHomeRefreshKey((key) => key + 1)
				}}
			/>

			<div className={`flex h-dvh min-h-0 flex-col overflow-hidden pb-16 transition-[margin] duration-200 lg:pb-0 ${sidebarCollapsed ? "lg:ml-14" : "lg:ml-60"}`}>
				<Header
					key={`header-${user?.id || "guest"}`}
					onLoginClick={() => setShowLogin(true)}
					isLoggedIn={!!user}
					onNavigate={navigate}
				/>

				<main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30">
					{renderContent()}
				</main>
			</div>

			{showLogin && <Login open={showLogin} onOpenChange={setShowLogin} />}
			<TaskProgress />
			<Toaster richColors position="top-center" />
		</div>
	)
}
