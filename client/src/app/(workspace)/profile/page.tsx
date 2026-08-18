"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import UserPage from "@/components/userPage/userPage"
import { useWorkspaceNavigation } from "@/lib/workspace-routing"

const Login = dynamic(() => import("@/components/header/login"))

export default function ProfileRoute() {
	const navigate = useWorkspaceNavigation()
	const [showLogin, setShowLogin] = useState(false)
	return <>
		<UserPage onNavigate={navigate} onLoginClick={() => setShowLogin(true)} />
		{showLogin && <Login open={showLogin} onOpenChange={setShowLogin} />}
	</>
}
