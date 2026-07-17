import { useAuthStore } from '@/store/userStore'

const API_BASE = ''

export interface User {
    id: string
    phone: string
    email?: string | null
    nickname?: string | null
    avatar_url?: string | null
    password_hash?: string | null
}

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken() {
    if (!refreshPromise) {
        refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        }).then(async (res) => {
            if (!res.ok) {
                useAuthStore.getState().logout()
                return null
            }
            const data = await res.json()
            useAuthStore.getState().setAuth(data.user, data.accessToken)
            return data.accessToken as string
        }).catch(() => {
            useAuthStore.getState().logout()
            return null
        }).finally(() => {
            refreshPromise = null
        })
    }
    return refreshPromise
}

async function request(path: string, options: RequestInit | undefined, token: string | null) {
    return fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options?.headers,
        },
    })
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
    let token = useAuthStore.getState().token
    let res = await request(path, options, token)

    if (res.status === 401 && path !== '/api/auth/refresh') {
        token = await refreshAccessToken()
        if (token) res = await request(path, options, token)
    }

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
        throw new Error(data.error || '请求失败')
    }

    return data
}

export async function restoreSession() {
    return refreshAccessToken()
}

function isExpiring(token: string) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        return typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now() + 30_000
    } catch {
        return true
    }
}

export async function getValidAccessToken() {
    const token = useAuthStore.getState().token
    return token && !isExpiring(token) ? token : refreshAccessToken()
}

export async function logoutSession() {
    await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
    }).catch(() => undefined)
    useAuthStore.getState().logout()
}
