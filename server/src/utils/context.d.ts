/**
 * 上下文窗口管理
 *
 * 生产级多对话系统需要解决的三个核心问题：
 * 1. Token 预算控制 —— 防止超出模型 max_tokens
 * 2. 滑动窗口 —— 保留最近最重要的上下文
 * 3. 历史摘要 —— 长对话的渐进式压缩记忆
 */
type Message = {
    role: 'user' | 'assistant' | 'system';
    content: string;
};
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
export declare function countTokens(text: string): number;
export declare function countMessagesTokens(messages: Message[]): number;
export interface ContextConfig {
    /** 模型最大 token 数（doubao-seed-2.0-lite 为 128K） */
    modelMaxTokens: number;
    /** 为回复预留的 token 数 */
    reservedForResponse: number;
    /** system prompt 预估 token 数 */
    systemPromptTokens: number;
    /** 历史摘要 token 数上限 */
    maxSummaryTokens: number;
}
export declare const DEFAULT_TEXT_CONFIG: ContextConfig;
export interface TruncateResult {
    /** 截断后实际发给模型的消息 */
    messages: Message[];
    /** 被丢弃的消息数 */
    truncatedCount: number;
    /** 是否附带摘要 */
    hasSummary: boolean;
}
/**
 * 在 token 预算内保留最新的消息
 *
 * 策略：从最旧消息开始丢弃，直到总 token 数 ≤ 预算
 * 永远保留至少 1 条消息（当前轮对话）
 */
export declare function truncateToTokenLimit(messages: Message[], config?: ContextConfig, existingSummary?: string): TruncateResult;
/**
 * 判断是否需要触发历史摘要
 *
 * 条件：连续 N 轮对话都有消息被截断
 * 说明旧消息在不断丢失，需要用摘要来保留关键信息
 */
export declare function shouldSummarize(consecutiveTruncations: number, threshold?: number): boolean;
/**
 * 构建最终发送给 LLM 的消息数组
 *
 * 组装顺序：
 * 1. System prompt（固定角色设定）
 * 2. 历史摘要（如果有，压缩过的早期对话）
 * 3. 滑动窗口内的消息（最近的对话轮次）
 */
export declare function buildMessages(history: Message[], currentUserMessage: Message, options?: {
    config?: ContextConfig;
    summary?: string;
    systemPrompt?: string;
}): Message[];
export {};
//# sourceMappingURL=context.d.ts.map