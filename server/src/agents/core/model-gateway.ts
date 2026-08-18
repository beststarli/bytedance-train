import OpenAI from 'openai'

function stripJsonFence(value: string) {
	return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
}

export class AgentModelGateway {
	private readonly client: OpenAI
	private readonly isDeepSeek: boolean
	readonly model: string

	constructor() {
		const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
		const arkKey = (process.env.ARK_API_KEY || process.env.Volcengine_ACCESS_API_KEY || '').trim()
		if (deepseekKey) {
			this.isDeepSeek = true
			this.client = new OpenAI({
				baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
				apiKey: deepseekKey,
			})
			this.model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
			return
		}
		this.isDeepSeek = false
		if (!arkKey) throw new Error('内容审核模型未配置：请填写 DEEPSEEK_API_KEY 或 ARK_API_KEY')
		this.client = new OpenAI({
			baseURL: process.env.VOLC_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
			apiKey: arkKey,
		})
		this.model = process.env.VOLC_MODEL_TEXT || 'doubao-seed-2-0-lite-260215'
	}

	async generateJson<T>(system: string, user: string, maxTokens = 3000): Promise<T> {
		let lastReason = 'unknown'
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const completion = await this.client.chat.completions.create({
				model: this.model,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: attempt === 0 ? user : `${user}\n\n请立即输出完整、非空的 JSON 对象，不要输出解释或 Markdown。` },
				],
				temperature: 0.1,
				max_tokens: maxTokens,
				response_format: { type: 'json_object' },
				// DeepSeek V4 默认开启思考；结构化短任务关闭思考可避免只返回 reasoning_content。
				...(this.isDeepSeek ? { extra_body: { thinking: { type: 'disabled' } } } : {}),
			})
			const choice = completion.choices[0]
			const raw = choice?.message?.content?.trim()
			lastReason = choice?.finish_reason || 'no_choice'
			if (!raw) continue
			try {
				return JSON.parse(stripJsonFence(raw)) as T
			} catch {
				lastReason = `${lastReason}:invalid_json`
			}
		}
		throw new Error(`审核模型连续返回空内容或无效 JSON（finish_reason: ${lastReason}）`)
	}
}
