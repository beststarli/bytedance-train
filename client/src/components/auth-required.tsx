"use client"

import { LockKeyhole } from "lucide-react"
import { cn } from "@/lib/utils"

export default function AuthRequired({
	className,
	description = "登录后查看",
}: {
	className?: string
	description?: string
}) {
	return (
		<div className={cn("flex min-h-48 flex-col items-center justify-center text-center", className)}>
			<span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
				<LockKeyhole className="h-4 w-4" />
			</span>
			<strong className="text-sm font-medium text-foreground">{description}</strong>
			<p className="mt-1 text-xs text-muted-foreground">登录后即可访问当前账号的专属内容</p>
		</div>
	)
}
