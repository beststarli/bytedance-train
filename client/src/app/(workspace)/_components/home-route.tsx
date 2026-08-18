"use client"

import MainPage from "@/components/mainPage/mainPage"
import { useWorkspaceNavigation } from "@/lib/workspace-routing"
import type { HomeInitialData } from "@/types/home"

export default function HomeRoute({ initialData }: { initialData: HomeInitialData }) {
	const navigate = useWorkspaceNavigation()
	return <MainPage initialData={initialData} refreshFeedOnMount onNavigate={navigate} />
}
