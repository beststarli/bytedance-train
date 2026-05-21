import { create } from "zustand";

interface UserStoreProps {
    name: string | null
    setName: (name: string | null) => void
}

export const useUserStore = create<UserStoreProps>((set) => ({
    name: null,
    setName: (name: string | null) => set({ name })
}))