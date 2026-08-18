"use client"

import { useSearchParams } from "next/navigation"
import CreatePage from "@/components/createPage/createPage"
import { useWorkspaceNavigation } from "@/lib/workspace-routing"

export default function CreateRoute() {
	const navigate = useWorkspaceNavigation()
	const mode = useSearchParams().get("mode")
	return <CreatePage initialMode={mode === "manual" || mode === "ai" ? mode : undefined} onNavigate={navigate} />
}
