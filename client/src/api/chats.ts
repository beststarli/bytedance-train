import { api, apiResponse } from './api'

export function getChats<T>() {
    return api<{ chats: T[] }>('/api/content/chats').then((data) => data.chats)
}

export function getChatMessages<T>(chatId: string) {
    return api<{ messages: T[] }>(`/api/content/chats/${chatId}/messages`).then((data) => data.messages)
}

export function createChat<T>(title = '新对话') {
    return api<{ chat: T }>('/api/content/chats', {
        method: 'POST',
        body: JSON.stringify({ title }),
    }).then((data) => data.chat)
}

export function renameChat<T>(chatId: string, title: string) {
    return api<{ chat: T }>(`/api/content/chats/${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
    }).then((data) => data.chat)
}

export function deleteChat(chatId: string) {
    return api<void>(`/api/content/chats/${chatId}`, { method: 'DELETE' })
}

export interface GenerateChatPayload<TAttachment> {
    content: string
    modelType?: string
    attachments: TAttachment[]
    signal?: AbortSignal
}

export async function generateChatStream<TAttachment>(chatId: string, payload: GenerateChatPayload<TAttachment>) {
    const response = await apiResponse(`/api/content/chats/${chatId}/generate-stream`, {
        method: 'POST',
        body: JSON.stringify({
            content: payload.content,
            model_type: payload.modelType,
            attachments: payload.attachments,
        }),
        signal: payload.signal,
    })
    if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || '请求失败')
    }
    return response
}

export function uploadAiAttachment<T>(payload: { filename: string; data: string }) {
    return api<{ attachment: T }>('/api/content/ai-attachments', {
        method: 'POST',
        body: JSON.stringify(payload),
    }).then((data) => data.attachment)
}

export function importMessageImage<T>(messageId: string, url: string) {
    return api<{ material: T; already_exists: boolean }>(`/api/content/messages/${messageId}/import-image`, {
        method: 'POST',
        body: JSON.stringify({ url }),
    })
}
