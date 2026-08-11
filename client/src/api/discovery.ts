import { api } from './api'

export function getNotifications<T>() {
    return api<{ notifications: T[] }>('/api/content/notifications').then((data) => data.notifications)
}

export function searchContent<T>(query: string) {
    return api<T>(`/api/content/search?q=${encodeURIComponent(query)}`)
}
