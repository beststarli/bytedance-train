"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { DRAFT_SYNC_EVENT } from "@/hooks/useDraftAutosave"

const menuPaths: Record<string, string> = {
	content: "/",
	create: "/create",
	works: "/works",
	materials: "/materials",
	prompts: "/prompts",
	review: "/reviews",
	inspiration: "/inspiration",
	userPage: "/profile",
}

export function menuToPath(menu: string) {
	const [root, subview] = menu.split(":")
	const pathname = menuPaths[root || ""] || "/"
	if (root === "create" && (subview === "manual" || subview === "ai")) {
		return `${pathname}?mode=${subview}`
	}
	return pathname
}

export function pathToMenu(pathname: string) {
	if (pathname === "/") return "content"
	if (pathname.startsWith("/create")) return "create"
	if (pathname.startsWith("/works")) return "works"
	if (pathname.startsWith("/materials")) return "materials"
	if (pathname.startsWith("/prompts")) return "prompts"
	if (pathname.startsWith("/reviews")) return "review"
	if (pathname.startsWith("/inspiration")) return "inspiration"
	if (pathname.startsWith("/profile")) return "userPage"
	return "content"
}

export function useWorkspaceNavigation() {
	const router = useRouter()
	return useCallback((menu: string) => {
		if (!menu.startsWith("create")) window.dispatchEvent(new Event(DRAFT_SYNC_EVENT))
		router.push(menuToPath(menu))
	}, [router])
}
