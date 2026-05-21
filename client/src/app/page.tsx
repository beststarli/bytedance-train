"use client"

import { useState } from "react";
import Header from "@/components/header";
import Login from "@/components/login";
import Sidebar from "@/components/sidebar";
import CreatePage from "@/components/createPage";
import MainPage from "@/components/mainPage";
import UserPage from "@/components/userPage/userPage";
import WorksPage from "@/components/worksPage";
import PromptsPage from "@/components/promptsPage";
import MaterialsPage from "@/components/materialsPage";
import { useAuthStore } from "@/store/userStore";

export default function Home() {
	const [activeMenu, setActiveMenu] = useState("create")
	const [showLogin, setShowLogin] = useState(false)
	const { user, token, setAuth } = useAuthStore()

	const renderContent = () => {
		switch (activeMenu) {
			case "create":
				return <CreatePage />
			case "home":
				return <MainPage />
			case "works":
				return <WorksPage />
			case "prompts":
				return <PromptsPage />
			case "materials":
				return <MaterialsPage />
			case "review":
			case "userPage":
				return <UserPage />
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
			<Sidebar activeMenu={activeMenu} onMenuChange={setActiveMenu} />

			{/* 右侧主内容区 */}
			<div className="ml-56 min-h-screen flex flex-col">
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
