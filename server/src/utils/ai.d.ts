declare const models: Record<string, string>;
export type ModelType = keyof typeof models;
export declare function chatCompletion(messages: {
    role: 'user' | 'assistant' | 'system';
    content: string;
}[], modelType?: ModelType): Promise<string>;
export declare function chatCompletionStream(messages: {
    role: 'user' | 'assistant' | 'system';
    content: string;
}[], modelType?: ModelType): AsyncGenerator<string>;
export declare function generateImage(prompt: string): Promise<string[]>;
export declare function generateVideo(prompt: string): Promise<{
    task_id: string;
}>;
export declare function chatSummary(messages: {
    role: string;
    content: string;
}[], existingSummary?: string): Promise<string>;
export declare function detectModelType(content: string): ModelType;
export {};
//# sourceMappingURL=ai.d.ts.map