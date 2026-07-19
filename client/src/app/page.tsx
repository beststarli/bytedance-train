"use client"

import { useEffect, useState } from "react";
import Header from "@/components/header";
import Login from "@/components/login";
import Sidebar from "@/components/sidebar";
import CreatePage from "@/components/createPage/createPage";
import MainPage from "@/components/ideaPage/mainPage";
import UserPage from "@/components/userPage/userPage";
import WorksPage from "@/components/worksPage";
import PromptsPage from "@/components/promptPage/promptsPage";
import MaterialsPage from "@/components/materialsPage";
import ReviewPage from "@/components/reviewPage";
import { useAuthStore } from "@/store/userStore";
import { restoreSession } from "@/api/api";
import TaskProgress from "@/components/taskProgress";
import { Toaster } from "sonner";

export default function Home() {
	const [activeMenu, setActiveMenu] = useState("dashboard")
	const [showLogin, setShowLogin] = useState(false)
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
	const [homeRefreshKey, setHomeRefreshKey] = useState(0)
	const user = useAuthStore((state) => state.user)

	useEffect(() => {
		void restoreSession()
	}, [])

	const renderContent = () => {
		const [menu, subview] = activeMenu.split(":")
		switch (menu) {
			case "create":
				return <CreatePage initialMode={subview === "manual" || subview === "ai" ? subview : undefined} onNavigate={setActiveMenu} />
			case "dashboard":
				return <MainPage key={homeRefreshKey} onNavigate={setActiveMenu} />
			case "inspiration":
				return <MainPage onNavigate={setActiveMenu} mode={menu} />
			case "works":
				return <WorksPage onNavigate={setActiveMenu} />
			case "prompts":
				return <PromptsPage />
			case "materials":
				return <MaterialsPage />
			case "review":
				return <ReviewPage />
			case "userPage":
				return <UserPage onNavigate={setActiveMenu} />
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
					setActiveMenu("dashboard")
					setHomeRefreshKey((key) => key + 1)
				}}
			/>

			{/* 右侧主内容区 */}
			<div className={`flex h-dvh min-h-0 flex-col overflow-hidden pb-16 transition-[margin] duration-200 lg:pb-0 ${sidebarCollapsed ? "lg:ml-14" : "lg:ml-60"}`}>
				{/* 固定头部 */}
				<Header
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
			<TaskProgress />
			<Toaster richColors position="top-center" />
		</div>
	);
}
