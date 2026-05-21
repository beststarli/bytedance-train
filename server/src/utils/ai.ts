import OpenAI from 'openai'

const client = new OpenAI({
    baseURL: process.env.VOLC_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: process.env.Volcengine_ACCESS_API_KEY || '',
})

// 模型配置：可按需增删，不用改 .env
const models: Record<string, string> = {
    text: process.env.VOLC_MODEL_TEXT || 'doubao-seed-character-251128',
    image: process.env.VOLC_MODEL_IMAGE || 'doubao-seedream-4-0-250828',
    video: process.env.VOLC_MODEL_VIDEO || 'doubao-seedance-1-0-pro-fast-251015',
}

export type ModelType = keyof typeof models

// ===== 文本生成 =====
export async function chatCompletion(
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
    modelType: ModelType = 'text'
): Promise<string> {
    const completion = await client.chat.completions.create({
        model: models[modelType] as string,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
    })
    return completion.choices[0]?.message?.content || ''
}

// 流式生成
export async function* chatCompletionStream(
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
    modelType: ModelType = 'text'
): AsyncGenerator<string> {
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
    const response = await client.images.generate({
        model: models.image as string,
        prompt,
        n: 1,
        size: '1024x1024',
    })
    return response.data?.map((img) => img.url || '') ?? []
}

// ===== 文生视频 (Seedance) =====
export async function generateVideo(prompt: string): Promise<{ task_id: string }> {
    // Seedance 通常是异步任务：提交 → 轮询结果
    // 这里用 chat completion 模拟提交，实际需对接方舟视频生成 API
    const completion = await client.chat.completions.create({
        model: models.video as string,
        messages: [
            { role: 'user', content: `生成视频: ${prompt}` },
        ],
    })
    return { task_id: completion.id }
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
