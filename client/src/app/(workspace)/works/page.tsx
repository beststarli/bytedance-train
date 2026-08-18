"use client"

import WorksPage from "@/components/worksPage/worksPage"
import { useWorkspaceNavigation } from "@/lib/workspace-routing"

export default function WorksRoute() {
	const navigate = useWorkspaceNavigation()
	return <WorksPage onNavigate={navigate} />
}
