"use strict";
/**
 * 上下文窗口管理
 *
 * 生产级多对话系统需要解决的三个核心问题：
 * 1. Token 预算控制 —— 防止超出模型 max_tokens
 * 2. 滑动窗口 —— 保留最近最重要的上下文
 * 3. 历史摘要 —— 长对话的渐进式压缩记忆
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TEXT_CONFIG = void 0;
exports.countTokens = countTokens;
exports.countMessagesTokens = countMessagesTokens;
exports.truncateToTokenLimit = truncateToTokenLimit;
exports.shouldSummarize = shouldSummarize;
exports.buildMessages = buildMessages;
// ==================== Token 估算 ====================
/**
 * 简易 token 计数（中英文混合场景）
 *
 * 各模型 tokenizer 不同，这里用保守估算确保不超限：
 * - 中文：~2 字符/token
 * - 英文/数字：~4 字符/token
 * - 标点/空格：~1 字符/token
 *
 * 实测中英文混合长文本约为 2.0-2.5 字符/token
 * 取 2.0 作为统一基准（偏保守 = 更安全）
 */
function countTokens(text) {
    if (!text)
        return 0;
    // 纯英文+数字占比高时实际 token 更少，但保守估算没问题
    return Math.ceil(text.length / 2);
}
function countMessagesTokens(messages) {
    // 每条消息有 role 等元数据开销，约 +4 tokens
    return messages.reduce((sum, m) => sum + countTokens(m.content) + 4, 0);
}
exports.DEFAULT_TEXT_CONFIG = {
    modelMaxTokens: 128_000,
    reservedForResponse: 4096,
    systemPromptTokens: 300,
    maxSummaryTokens: 1024,
};
/**
 * 在 token 预算内保留最新的消息
 *
 * 策略：从最旧消息开始丢弃，直到总 token 数 ≤ 预算
 * 永远保留至少 1 条消息（当前轮对话）
 */
function truncateToTokenLimit(messages, config = exports.DEFAULT_TEXT_CONFIG, existingSummary) {
    if (messages.length === 0) {
        return { messages: [], truncatedCount: 0, hasSummary: false };
    }
    // 计算预算：总容量 - 回复预留 - system prompt - 摘要
    const budget = config.modelMaxTokens -
        config.reservedForResponse -
        config.systemPromptTokens -
        (existingSummary ? countTokens(existingSummary) + 20 : 0);
    const result = [...messages];
    let total = countMessagesTokens(result);
    let truncatedCount = 0;
    while (total > budget && result.length > 1) {
        result.shift();
        total = countMessagesTokens(result);
        truncatedCount++;
    }
    return {
        messages: result,
        truncatedCount,
        hasSummary: !!existingSummary,
    };
}
/**
 * 判断是否需要触发历史摘要
 *
 * 条件：连续 N 轮对话都有消息被截断
 * 说明旧消息在不断丢失，需要用摘要来保留关键信息
 */
function shouldSummarize(consecutiveTruncations, threshold = 3) {
    return consecutiveTruncations >= threshold;
}
// ==================== 构建最终 Prompt ====================
const DEFAULT_SYSTEM_PROMPT = `你是一个专业的 AI 创作助手，擅长文章写作、内容优化和创意生成。

## 核心能力
- 文章撰写：结构完整、逻辑清晰、语言流畅
- 内容优化：润色、扩写、改写、摘要
- 创意生成：头脑风暴、文案策划、故事创作

## 行为准则
1. 用中文回复，除非用户要求其他语言
2. 回答详实有深度，避免空洞套话
3. 不确定的内容要明确说明
4. 涉及敏感话题时保持客观中立
5. 需要图片/视频生成时会明确告知用户`;
/**
 * 构建最终发送给 LLM 的消息数组
 *
 * 组装顺序：
 * 1. System prompt（固定角色设定）
 * 2. 历史摘要（如果有，压缩过的早期对话）
 * 3. 滑动窗口内的消息（最近的对话轮次）
 */
function buildMessages(history, currentUserMessage, options) {
    const { config = exports.DEFAULT_TEXT_CONFIG, summary, systemPrompt = DEFAULT_SYSTEM_PROMPT } = options ?? {};
    // 1. 对历史消息做滑动窗口截断
    const { messages: truncatedHistory } = truncateToTokenLimit(history, config, summary);
    // 2. 组装最终消息
    const result = [
        { role: 'system', content: systemPrompt },
    ];
    // 摘要放在 system prompt 之后、对话历史之前
    if (summary) {
        result.push({
            role: 'system',
            content: `<对话摘要>${summary}</对话摘要>`,
        });
    }
    // 历史对话
    result.push(...truncatedHistory);
    // 当前用户消息
    result.push(currentUserMessage);
    return result;
}
//# sourceMappingURL=context.js.map