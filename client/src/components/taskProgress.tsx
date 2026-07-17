"use client"

import { useEffect, useState } from "react"
import { Check, LoaderCircle, XCircle } from "lucide-react"

type TaskState = { title: string; status: "running" | "success" | "error"; message?: string }

export const TASK_PROGRESS_EVENT = "creator-task-progress"

export function emitTaskProgress(detail: TaskState) {
  window.dispatchEvent(new CustomEvent<TaskState>(TASK_PROGRESS_EVENT, { detail }))
}

export default function TaskProgress() {
  const [task, setTask] = useState<TaskState | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<TaskState>).detail
      setTask(detail)
      if (timer) clearTimeout(timer)
      if (detail.status !== "running") timer = setTimeout(() => setTask(null), 1600)
    }
    window.addEventListener(TASK_PROGRESS_EVENT, listener)
    return () => {
      window.removeEventListener(TASK_PROGRESS_EVENT, listener)
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (!task) return null

  return (
    <div className="fixed right-5 top-20 z-[100] flex min-w-72 items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg">
      {task.status === "running" && <LoaderCircle className="h-5 w-5 animate-spin text-red-500" />}
      {task.status === "success" && <Check className="h-5 w-5 text-emerald-600" />}
      {task.status === "error" && <XCircle className="h-5 w-5 text-red-500" />}
      <div><div className="text-sm font-semibold">{task.title}</div><div className="mt-0.5 text-xs text-muted-foreground">{task.message || "正在处理…"}</div></div>
    </div>
  )
}
