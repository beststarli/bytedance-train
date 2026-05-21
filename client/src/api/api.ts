const API_BASE = ''

export interface User {
    id: string
    phone: string
    email?: string | null
    nickname?: string | null
    avatar_url?: string | null
    password_hash?: string | null
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
    // 🔥 直接从 localStorage 读取 token，不依赖内存缓存
    let token: string | null = null
    if (typeof window !== 'undefined') {
        try {
            const raw = localStorage.getItem('auth-storage')
            if (raw) {
                const parsed = JSON.parse(raw)
                token = parsed.state?.token || null
            }
        } catch {}
    }

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options?.headers,
        },
    })

    const data = await res.json()

    if (!res.ok) {
        throw new Error(data.error || '请求失败')
    }

    return data
}
