import { api } from './api'

export interface SaveWorkPayload {
    title: string
    content: string
    status: 'draft' | 'published'
}

export function getWorks<T>() {
    return api<{ works: T[] }>('/api/content/works').then((data) => data.works)
}

export function saveWork<T>(workId: string | null | undefined, payload: SaveWorkPayload) {
    return api<{ work: T }>(workId ? `/api/content/works/${workId}` : '/api/content/works', {
        method: workId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
    }).then((data) => data.work)
}

export function deleteWork(workId: string) {
    return api(`/api/content/works/${workId}`, { method: 'DELETE' })
}

export function submitWorkReview(workId: string) {
    return api(`/api/content/works/${workId}/submit-review`, { method: 'POST', body: '{}' })
}
