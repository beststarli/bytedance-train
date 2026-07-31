"use client"

import { useEffect, useState } from "react";
import Sidebar from "@/components/sidebar/sidebar";
import Login from "@/components/header/login";
import WorksPage from "@/components/worksPage/worksPage";
import Header from "@/components/header/header";
import ReviewPage from "@/components/reviewPage/reviewPage";
import MainPage from "@/components/mainPage/mainPage";
import UserPage from "@/components/userPage/userPage";
import CreatePage from "@/components/createPage/createPage";
import PromptsPage from "@/components/promptPage/promptsPage";
import MaterialsPage from "@/components/materialsPage/materialsPage";
import { Toaster } from "sonner";
import { refreshAccessToken } from "@/api/api";
import { useAuthStore } from "@/store/userStore";
import TaskProgress from "@/components/taskProgress";

export default function Home() {
	const [activeMenu, setActiveMenu] = useState("content")
	const [showLogin, setShowLogin] = useState(false)
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
	const [homeRefreshKey, setHomeRefreshKey] = useState(0)
	const user = useAuthStore((state) => state.user)

	useEffect(() => {
		void refreshAccessToken()
	}, [])

	const renderContent = () => {
		const [menu, subview] = activeMenu.split(":")
		const privatePageKey = user?.id || "guest"
		switch (menu) {
			case "create":
				return <CreatePage key={`create-${privatePageKey}`} initialMode={subview === "manual" || subview === "ai" ? subview : undefined} onNavigate={setActiveMenu} />
			case "content":
				return <MainPage key={homeRefreshKey} onNavigate={setActiveMenu} />
			case "inspiration":
				return <MainPage onNavigate={setActiveMenu} mode="inspiration" />
			case "works":
				return <WorksPage key={`works-${privatePageKey}`} onNavigate={setActiveMenu} />
			case "prompts":
				return <PromptsPage key={`prompts-${privatePageKey}`} />
			case "materials":
				return <MaterialsPage key={`materials-${privatePageKey}`} />
			case "review":
				return <ReviewPage key={`review-${privatePageKey}`} onNavigate={setActiveMenu} />
			case "userPage":
				return <UserPage key={`profile-${privatePageKey}`} onNavigate={setActiveMenu} onLoginClick={() => setShowLogin(true)} />
			default:
				return (
					<div className="flex-1 flex items-center justify-center text-muted-foreground">
						<div className="text-center">
							<h2 className="text-xl font-semibold mb-2">功能开发中</h2>
							<p className="text-sm">该功能正在紧张开发中，敬请期待...</p>
						</div>
					</div>
				)
		}
	}

	return (
		<div className="h-dvh overflow-hidden bg-muted/30">
			{/* 左侧导航栏 */}
			<Sidebar
				activeMenu={activeMenu}
				onMenuChange={setActiveMenu}
				collapsed={sidebarCollapsed}
				onCollapsedChange={setSidebarCollapsed}
				onHomeRefresh={() => {
					setActiveMenu("content")
					setHomeRefreshKey((key) => key + 1)
				}}
			/>

			{/* 右侧主内容区 */}
			<div className={`flex h-dvh min-h-0 flex-col overflow-hidden pb-16 transition-[margin] duration-200 lg:pb-0 ${sidebarCollapsed ? "lg:ml-14" : "lg:ml-60"}`}>
				{/* 固定头部 */}
				<Header
					key={`header-${user?.id || "guest"}`}
					onLoginClick={() => setShowLogin(true)}
					isLoggedIn={!!user}
					onNavigate={setActiveMenu}
				/>

				{/* 内容区域 */}
				<main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30">
					{renderContent()}
				</main>
			</div>

			{/* 登录弹窗 */}
			<Login open={showLogin} onOpenChange={setShowLogin} />
			{/* 任务进度 */}
			<TaskProgress />
			{/* 提示通知 */}
			<Toaster richColors position="top-center" />
		</div>
	);
}
