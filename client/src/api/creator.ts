import { api } from './api'

export function getCreatorDashboard<T>() {
    return api<T>('/api/content/creator-dashboard')
}

export function getLatestWorkPerformance<T>(days: 7 | 30) {
    return api<T>(`/api/content/creator-dashboard/latest-performance?days=${days}`)
}
