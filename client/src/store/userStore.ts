import { create } from 'zustand'
import type { User } from '@/api/api'
import { useEditorStore } from '@/store/editorStore'

interface AuthStore {
    user: User | null
    token: string | null
    setAuth: (user: User, token: string) => void
    setToken: (token: string) => void
    logout: () => void
}

export const useAuthStore = create<AuthStore>()((set) => ({
    user: null,
    token: null,
    setAuth: (user, token) => set((state) => {
        if (state.user?.id !== user.id) useEditorStore.getState().clear()
        return { user, token }
    }),
    setToken: (token) => set({ token }),
    logout: () => {
        useEditorStore.getState().clear()
        set({ user: null, token: null })
    },
}))
