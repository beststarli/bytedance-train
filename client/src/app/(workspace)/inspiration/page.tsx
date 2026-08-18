"use client"

import MainPage from "@/components/mainPage/mainPage"
import { useWorkspaceNavigation } from "@/lib/workspace-routing"

export default function InspirationRoute() {
	const navigate = useWorkspaceNavigation()
	return <MainPage mode="inspiration" onNavigate={navigate} />
}
