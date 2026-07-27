"use client"

import { useEffect, useState } from "react"
import { Laptop, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Theme = "light" | "dark" | "system"

const THEME_KEY = "creator-color-theme"

function applyTheme(theme: Theme) {
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", isDark)
  document.documentElement.style.colorScheme = isDark ? "dark" : "light"
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system")

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY)
    const initialTheme: Theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "system"
    const syncState = window.setTimeout(() => setTheme(initialTheme), 0)
    applyTheme(initialTheme)

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleSystemThemeChange = () => {
      if ((localStorage.getItem(THEME_KEY) || "system") === "system") applyTheme("system")
    }
    media.addEventListener("change", handleSystemThemeChange)
    return () => {
      window.clearTimeout(syncState)
      media.removeEventListener("change", handleSystemThemeChange)
    }
  }, [])

  const selectTheme = (value: string) => {
    const nextTheme = value as Theme
    setTheme(nextTheme)
    localStorage.setItem(THEME_KEY, nextTheme)
    applyTheme(nextTheme)
  }

  const CurrentIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="切换颜色风格" title="颜色风格" className="hidden rounded-lg text-muted-foreground hover:text-foreground sm:inline-flex">
          <CurrentIcon className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup value={theme} onValueChange={selectTheme}>
          <DropdownMenuRadioItem value="light" className="gap-2 py-2"><Sun className="h-4 w-4" />浅色</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="gap-2 py-2"><Moon className="h-4 w-4" />深色</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="gap-2 py-2"><Laptop className="h-4 w-4" />跟随系统</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
