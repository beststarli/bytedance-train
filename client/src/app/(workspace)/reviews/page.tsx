"use client"

import ReviewPage from "@/components/reviewPage/reviewPage"
import { useWorkspaceNavigation } from "@/lib/workspace-routing"

export default function ReviewsRoute() {
	const navigate = useWorkspaceNavigation()
	return <ReviewPage onNavigate={navigate} />
}
