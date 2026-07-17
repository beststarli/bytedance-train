"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatCompletion = chatCompletion;
exports.chatCompletionStream = chatCompletionStream;
exports.generateImage = generateImage;
exports.generateVideo = generateVideo;
exports.chatSummary = chatSummary;
exports.detectModelType = detectModelType;
const openai_1 = __importDefault(require("openai"));
const client = new openai_1.default({
    baseURL: process.env.VOLC_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: process.env.Volcengine_ACCESS_API_KEY || '',
});
function assertAiConfiguration() {
    if (!process.env.Volcengine_ACCESS_API_KEY?.trim()) {
        throw new Error('AI 服务未配置：缺少 Volcengine_ACCESS_API_KEY');
    }
}
// 模型配置：可按需增删，不用改 .env
const models = {
    text: process.env.VOLC_MODEL_TEXT || 'doubao-seed-2-0-lite-260215',
    text_legacy: process.env.VOLC_MODEL_TEXT_LEGACY || 'doubao-seed-character-251128',
    image: process.env.VOLC_MODEL_IMAGE || 'doubao-seedream-4-0-250828',
    video: process.env.VOLC_MODEL_VIDEO || 'doubao-seedance-1-0-pro-fast-251015',
    summary: process.env.VOLC_MODEL_SUMMARY || 'doubao-seed-2-0-lite-260215',
};
// ===== 文本生成 =====
async function chatCompletion(messages, modelType = 'text') {
    assertAiConfiguration();
    const completion = await client.chat.completions.create({
        model: models[modelType],
        messages,
        temperature: 0.7,
        max_tokens: 4096,
    });
    return completion.choices[0]?.message?.content || '';
}
// 流式生成
async function* chatCompletionStream(messages, modelType = 'text') {
    assertAiConfiguration();
    const stream = await client.chat.completions.create({
        model: models[modelType],
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
    });
    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content)
            yield content;
    }
}
// ===== 文生图 (Seedream) =====
async function generateImage(prompt) {
    assertAiConfiguration();
    const response = await client.images.generate({
        model: models.image,
        prompt,
        n: 1,
        size: '1024x1024',
    });
    return response.data?.map((img) => img.url || '') ?? [];
}
// ===== 文生视频 (Seedance) =====
async function generateVideo(prompt) {
    assertAiConfiguration();
    // Seedance 通常是异步任务：提交 → 轮询结果
    // 这里用 chat completion 模拟提交，实际需对接方舟视频生成 API
    const completion = await client.chat.completions.create({
        model: models.video,
        messages: [
            { role: 'user', content: `生成视频: ${prompt}` },
        ],
    });
    return { task_id: completion.id };
}
// ===== 对话历史摘要 =====
async function chatSummary(messages, existingSummary) {
    assertAiConfiguration();
    const target = messages.slice(-10); // 只拿最近 10 条做增量摘要
    const prompt = existingSummary
        ? `已有摘要：${existingSummary}\n\n以下是新对话，请合并到已有摘要中（300字以内）：\n${target.map(m => `${m.role}: ${m.content}`).join('\n')}`
        : `请总结以下对话的核心内容、关键决策和用户偏好（300字以内）：\n\n${target.map(m => `${m.role}: ${m.content}`).join('\n')}`;
    const completion = await client.chat.completions.create({
        model: models.summary,
        messages: [
            { role: 'system', content: '你是一个对话摘要助手。提取要点，保持简洁，用中文。' },
            { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1024,
    });
    return completion.choices[0]?.message?.content || existingSummary || '';
}
// 根据内容自动判断模型类型（关键词匹配，可扩展）
function detectModelType(content) {
    const lower = content.toLowerCase();
    // 图片关键词
    if (/生成图片|画一张|配图|illustration|生成.*图|seedream/i.test(lower))
        return 'image';
    // 视频关键词
    if (/生成视频|视频脚本|短视频|video|seedance/i.test(lower))
        return 'video';
    return 'text';
}
//# sourceMappingURL=ai.js.map