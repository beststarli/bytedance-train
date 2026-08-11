"use client"

import { useCallback, useEffect, useRef } from "react"
import { saveWork } from "@/api/works"
import { emitTaskProgress } from "@/components/taskProgress"
import { useEditorStore } from "@/store/editorStore"

const AUTOSAVE_INTERVAL_MS = 30_000
const STORAGE_PREFIX = "creator-editor-draft:"
export const DRAFT_SYNC_EVENT = "creator:draft-sync"

interface LocalDraft {
	id: string | null
	title: string
	content: string
	savedTitle: string
	savedContent: string
	updatedAt: number
}

function storageKey(userId: string) {
	return `${STORAGE_PREFIX}${userId}`
}

function readLocalDraft(userId: string): LocalDraft | null {
	try {
		const value = localStorage.getItem(storageKey(userId))
		if (!value) return null
		const parsed = JSON.parse(value) as Partial<LocalDraft>
		if (typeof parsed.title !== "string" || typeof parsed.content !== "string") return null
		return {
			id: typeof parsed.id === "string" ? parsed.id : null,
			title: parsed.title,
			content: parsed.content,
			savedTitle: typeof parsed.savedTitle === "string" ? parsed.savedTitle : "",
			savedContent: typeof parsed.savedContent === "string" ? parsed.savedContent : "",
			updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
		}
	} catch {
		return null
	}
}

function writeLocalDraft(userId: string, draft: Omit<LocalDraft, "updatedAt">) {
	localStorage.setItem(storageKey(userId), JSON.stringify({ ...draft, updatedAt: Date.now() }))
}

export function removeLocalDraft(userId: string) {
	localStorage.removeItem(storageKey(userId))
}

export function useDraftAutosave(userId?: string) {
	const savingRef = useRef(false)
	const pendingRetryRef = useRef(false)
	const restoredUserRef = useRef<string | null>(null)

	// 本地缓存是离线工作的底座：每次内容变化立即落盘，不等待云端计时器。
	useEffect(() => {
		if (!userId) return
		const unsubscribe = useEditorStore.subscribe((state, previous) => {
			if (state.id === previous.id && state.title === previous.title && state.content === previous.content) return
			if (!state.title && !state.content) {
				removeLocalDraft(userId)
				return
			}
			writeLocalDraft(userId, {
				id: state.id,
				title: state.title,
				content: state.content,
				savedTitle: state.savedTitle,
				savedContent: state.savedContent,
			})
		})
		return unsubscribe
	}, [userId])

	// 仅在写作台没有已显式载入作品时恢复本地快照，避免覆盖“作品管理”选中的文章。
	useEffect(() => {
		if (!userId || restoredUserRef.current === userId) return
		restoredUserRef.current = userId
		const state = useEditorStore.getState()
		if (state.id || state.title || state.content) return
		const local = readLocalDraft(userId)
		if (!local || (!local.title && !local.content)) return
		useEditorStore.getState().restoreLocalDocument(local)
		emitTaskProgress({ title: "已恢复上次草稿", status: "success", message: "本地未同步的编辑内容已恢复" })
	}, [userId])

	const syncToCloud = useCallback(async (showSuccess = false) => {
		if (!userId || savingRef.current) return
		const state = useEditorStore.getState()
		if (!state.isDirty() || (!state.title.trim() && !state.content.trim())) return
		if (!navigator.onLine) {
			pendingRetryRef.current = true
			return
		}

		const snapshot = { id: state.id, title: state.title, content: state.content }
		savingRef.current = true
		try {
			const work = await saveWork<{ id: string }>(snapshot.id, {
				title: snapshot.title.trim() || "未输入标题",
				content: snapshot.content,
				status: "draft",
			})
			useEditorStore.getState().markSnapshotSaved(work.id, snapshot.title, snapshot.content)
			const latest = useEditorStore.getState()
			// 请求期间可能继续输入；本地始终保存最新正文，只更新已同步基线。
			writeLocalDraft(userId, {
				id: work.id,
				title: latest.title,
				content: latest.content,
				savedTitle: snapshot.title,
				savedContent: snapshot.content,
			})
			pendingRetryRef.current = false
			if (showSuccess) emitTaskProgress({ title: "草稿已自动同步", status: "success", message: "网络恢复后已保存到云端" })
		} catch {
			pendingRetryRef.current = true
		} finally {
			savingRef.current = false
		}
	}, [userId])

	useEffect(() => {
		if (!userId) return
		const timer = window.setInterval(() => void syncToCloud(), AUTOSAVE_INTERVAL_MS)
		const handleOnline = () => void syncToCloud(pendingRetryRef.current || useEditorStore.getState().isDirty())
		const handleRequestedSync = () => void syncToCloud()
		const handlePageHide = () => void syncToCloud()
		window.addEventListener("online", handleOnline)
		window.addEventListener(DRAFT_SYNC_EVENT, handleRequestedSync)
		window.addEventListener("pagehide", handlePageHide)
		return () => {
			window.clearInterval(timer)
			window.removeEventListener("online", handleOnline)
			window.removeEventListener(DRAFT_SYNC_EVENT, handleRequestedSync)
			window.removeEventListener("pagehide", handlePageHide)
		}
	}, [syncToCloud, userId])

	return { syncToCloud }
}
