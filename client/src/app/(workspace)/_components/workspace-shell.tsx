"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Toaster } from "sonner"
import Sidebar from "@/components/sidebar/sidebar"
import Header from "@/components/header/header"
import TaskProgress from "@/components/taskProgress"
import { refreshAccessToken } from "@/api/api"
import { useAuthStore } from "@/store/userStore"
import { DRAFT_SYNC_EVENT } from "@/hooks/useDraftAutosave"
import { menuToPath, pathToMenu } from "@/lib/workspace-routing"

const Login = dynamic(() => import("@/components/header/login"))

export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
	const pathname = usePathname()
	const router = useRouter()
	const [showLogin, setShowLogin] = useState(false)
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
	const user = useAuthStore((state) => state.user)
	const activeMenu = pathToMenu(pathname)

	useEffect(() => {
		void refreshAccessToken()
	}, [])

	const navigate = (menu: string) => {
		if (!menu.startsWith("create")) window.dispatchEvent(new Event(DRAFT_SYNC_EVENT))
		router.push(menuToPath(menu))
	}

	const refreshHome = () => {
		window.dispatchEvent(new Event(DRAFT_SYNC_EVENT))
		if (pathname === "/") router.refresh()
		else router.push("/")
	}

	return (
		<div className="h-dvh overflow-hidden bg-muted/30">
			<Sidebar
				activeMenu={activeMenu}
				onMenuChange={navigate}
				collapsed={sidebarCollapsed}
				onCollapsedChange={setSidebarCollapsed}
				onHomeRefresh={refreshHome}
			/>

			<div className={`flex h-dvh min-h-0 flex-col overflow-hidden pb-16 transition-[margin] duration-200 lg:pb-0 ${sidebarCollapsed ? "lg:ml-14" : "lg:ml-60"}`}>
				<Header
					key={`header-${user?.id || "guest"}`}
					onLoginClick={() => setShowLogin(true)}
					isLoggedIn={!!user}
					onNavigate={navigate}
				/>
				<main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30">{children}</main>
			</div>

			{showLogin && <Login open={showLogin} onOpenChange={setShowLogin} />}
			<TaskProgress />
			<Toaster richColors position="top-center" />
		</div>
	)
}
