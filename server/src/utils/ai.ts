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
    summary: process.env.VOLC_MODEL_SUMMARY || 'doubao-seed-2-0-lite-260215',
}

export type ModelType = keyof typeof models

// 流式生成
export async function* chatCompletionStream(
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
    modelType: ModelType = 'text',
    signal?: AbortSignal,
): AsyncGenerator<string> {
    assertAiConfiguration()
    const stream = await client.chat.completions.create({
        model: models[modelType] as string,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
    }, { signal })
    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || ''
        if (content) yield content
    }
}

// ===== 文生图 (Seedream) =====
export async function generateImage(prompt: string, images: string[] = [], signal?: AbortSignal): Promise<string[]> {
    assertAiConfiguration()
    const response = await client.images.generate({
        model: models.image as string,
        prompt,
        size: '2K' as '1024x1024',
        response_format: 'url',
        watermark: false,
        ...(images.length ? { image: images } : {}),
    } as OpenAI.Images.ImageGenerateParamsNonStreaming & { watermark: boolean; image?: string[] }, { signal })
    return response.data?.map((img) => img.url || '').filter(Boolean) ?? []
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
    return 'text'
}
