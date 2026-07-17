"use client"

import { useEffect, useState } from "react";
import Header from "@/components/header";
import Login from "@/components/login";
import Sidebar from "@/components/sidebar";
import CreatePage from "@/components/createPage";
import MainPage from "@/components/mainPage";
import UserPage from "@/components/userPage/userPage";
import WorksPage from "@/components/worksPage";
import PromptsPage from "@/components/promptPage/promptsPage";
import MaterialsPage from "@/components/materialsPage";
import ReviewPage from "@/components/reviewPage";
import { useAuthStore } from "@/store/userStore";
import { restoreSession } from "@/api/api";

export default function Home() {
	const [activeMenu, setActiveMenu] = useState("dashboard")
	const [showLogin, setShowLogin] = useState(false)
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
	const user = useAuthStore((state) => state.user)

	useEffect(() => {
		void restoreSession()
	}, [])

	const renderContent = () => {
		const [menu, subview] = activeMenu.split(":")
		switch (menu) {
			case "create":
				return <CreatePage initialMode={subview === "manual" || subview === "ai" ? subview : undefined} />
			case "dashboard":
				return <MainPage onNavigate={setActiveMenu} />
			case "inspiration":
				return <MainPage onNavigate={setActiveMenu} mode={menu} />
			case "works":
				return <WorksPage />
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
		<div className="min-h-screen bg-muted/30">
			{/* 左侧导航栏 */}
			<Sidebar
				activeMenu={activeMenu}
				onMenuChange={setActiveMenu}
				collapsed={sidebarCollapsed}
				onCollapsedChange={setSidebarCollapsed}
			/>

			{/* 右侧主内容区 */}
			<div className={`min-h-screen flex flex-col pb-16 transition-[margin] duration-200 lg:pb-0 ${sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-60"}`}>
				{/* 固定头部 */}
				<Header
					onLoginClick={() => setShowLogin(true)}
					isLoggedIn={!!user}
					onNavigate={setActiveMenu}
				/>

				{/* 内容区域 */}
				<main className="flex-1 flex flex-col bg-muted/30">
					{renderContent()}
				</main>
			</div>

			{/* 登录弹窗 */}
			<Login open={showLogin} onOpenChange={setShowLogin} />
		</div>
	);
}
