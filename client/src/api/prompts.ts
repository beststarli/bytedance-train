import { api } from './api'

export function getPrompts<T>() {
    return api<{ prompts: T[] }>('/api/content/prompts').then((data) => data.prompts)
}

export function savePrompt<TPayload>(promptId: string | null, payload: TPayload) {
    return api(promptId ? `/api/content/prompts/${promptId}` : '/api/content/prompts', {
        method: promptId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
    })
}

export function deletePrompt(promptId: string) {
    return api(`/api/content/prompts/${promptId}`, { method: 'DELETE' })
}

export function generatePromptTemplate<T>(category: string, requirement: string) {
    return api<T>('/api/content/prompts/generate', {
        method: 'POST',
        body: JSON.stringify({ category, requirement }),
    })
}
