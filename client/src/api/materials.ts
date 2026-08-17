import { api } from './api'

export function getMaterials<T>() {
    return api<{ materials: T[] }>('/api/content/materials').then((data) => data.materials)
}

export function uploadMaterial<T = unknown>(payload: { filename: string; data: string; type: 'image' }) {
    return api<T>('/api/content/materials', { method: 'POST', body: JSON.stringify(payload) })
}

export function deleteMaterial(materialId: string) {
    return api(`/api/content/materials/${materialId}`, { method: 'DELETE' })
}
