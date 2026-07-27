import OpenAI from 'openai'

const arkApiKey = process.env.ARK_API_KEY || process.env.Volcengine_ACCESS_API_KEY || ''

const client = new OpenAI({
    baseURL: process.env.VOLC_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: arkApiKey,
})

function assertAiConfiguration() {
    if (!arkApiKey.trim()) {
        throw new Error('AI 服务未配置：缺少 ARK_API_KEY')
    }
}

// 模型配置：可按需增删，不用改 .env
const models: Record<string, string> = {
    text: process.env.VOLC_MODEL_TEXT || 'doubao-seed-2-0-lite-260215',
    image: process.env.VOLC_MODEL_IMAGE || 'doubao-seedream-5-0-260128',
    video: process.env.VOLC_MODEL_VIDEO || 'doubao-seedance-1-0-pro-fast-251015',
    summary: process.env.VOLC_MODEL_SUMMARY || 'doubao-seed-2-0-lite-260215',
}

export type ModelType = keyof typeof models

// 流式生成
export async function* chatCompletionStream(
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
    modelType: ModelType = 'text'
): AsyncGenerator<string> {
    assertAiConfiguration()
    const stream = await client.chat.completions.create({
        model: models[modelType] as string,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
    })
    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || ''
        if (content) yield content
    }
}

// ===== 文生图 (Seedream) =====
export async function generateImage(prompt: string): Promise<string[]> {
    assertAiConfiguration()
    const response = await client.images.generate({
        model: models.image as string,
        prompt,
        size: '2K' as '1024x1024',
        response_format: 'url',
        watermark: false,
    } as OpenAI.Images.ImageGenerateParamsNonStreaming & { watermark: boolean })
    return response.data?.map((img) => img.url || '').filter(Boolean) ?? []
}

type VideoTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

interface VideoTaskResponse {
    id: string
    status: VideoTaskStatus
    content?: { video_url?: string; last_frame_url?: string }
    error?: { code?: string; message?: string } | string
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function arkRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const baseUrl = (process.env.VOLC_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
    const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${arkApiKey}`,
            'Content-Type': 'application/json',
            ...init?.headers,
        },
    })
    const data = await response.json() as T & { error?: { message?: string } }
    if (!response.ok) throw new Error(data.error?.message || `方舟视频接口请求失败（${response.status}）`)
    return data
}

// ===== 文生视频 (Seedance) =====
export async function generateVideo(
    prompt: string,
    onStatus?: (status: VideoTaskStatus) => void,
): Promise<{ task_id: string; video_url: string }> {
    assertAiConfiguration()
    const task = await arkRequest<VideoTaskResponse>('/contents/generations/tasks', {
        method: 'POST',
        body: JSON.stringify({
            model: models.video,
            content: [{ type: 'text', text: prompt }],
            ratio: '16:9',
            duration: 5,
            watermark: false,
        }),
    })
    if (!task.id) throw new Error('方舟没有返回视频生成任务 ID')

    const deadline = Date.now() + 10 * 60 * 1000
    while (Date.now() < deadline) {
        const result = await arkRequest<VideoTaskResponse>(`/contents/generations/tasks/${encodeURIComponent(task.id)}`)
        // 每轮轮询都回传状态，避免长时间生成时 SSE 连接因空闲被代理关闭。
        onStatus?.(result.status)
        if (result.status === 'succeeded') {
            const videoUrl = result.content?.video_url
            if (!videoUrl) throw new Error('视频任务已完成，但未返回视频地址')
            return { task_id: task.id, video_url: videoUrl }
        }
        if (result.status === 'failed' || result.status === 'cancelled') {
            const message = typeof result.error === 'string' ? result.error : result.error?.message
            throw new Error(message || (result.status === 'cancelled' ? '视频生成任务已取消' : '视频生成失败'))
        }
        await wait(3000)
    }
    throw new Error('视频生成等待超时，请稍后重试')
}

// ===== 对话历史摘要 =====
export async function chatSummary(
    messages: { role: string; content: string }[],
    existingSummary?: string
): Promise<string> {
    assertAiConfiguration()
    const target = messages.slice(-10) // 只拿最近 10 条做增量摘要
    const prompt = existingSummary
        ? `已有摘要：${existingSummary}\n\n以下是新对话，请合并到已有摘要中（300字以内）：\n${target.map(m => `${m.role}: ${m.content}`).join('\n')}`
        : `请总结以下对话的核心内容、关键决策和用户偏好（300字以内）：\n\n${target.map(m => `${m.role}: ${m.content}`).join('\n')}`

    const completion = await client.chat.completions.create({
        model: models.summary as string,
        messages: [
            { role: 'system', content: '你是一个对话摘要助手。提取要点，保持简洁，用中文。' },
            { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1024,
    })
    return completion.choices[0]?.message?.content || existingSummary || ''
}

// 根据内容自动判断模型类型（关键词匹配，可扩展）
export function detectModelType(content: string): ModelType {
    const lower = content.toLowerCase()
    // 图片关键词
    if (/生成图片|画一张|配图|illustration|生成.*图|seedream/i.test(lower)) return 'image'
    // 视频关键词
    if (/生成视频|视频脚本|短视频|video|seedance/i.test(lower)) return 'video'
    return 'text'
}
