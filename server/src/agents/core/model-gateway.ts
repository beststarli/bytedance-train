import OpenAI from 'openai'

function stripJsonFence(value: string) {
	return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
}

export class AgentModelGateway {
	private readonly client: OpenAI
	readonly model: string

	constructor() {
		const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
		const arkKey = (process.env.ARK_API_KEY || process.env.Volcengine_ACCESS_API_KEY || '').trim()
		if (deepseekKey) {
			this.client = new OpenAI({
				baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
				apiKey: deepseekKey,
			})
			this.model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
			return
		}
		if (!arkKey) throw new Error('内容审核模型未配置：请填写 DEEPSEEK_API_KEY 或 ARK_API_KEY')
		this.client = new OpenAI({
			baseURL: process.env.VOLC_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
			apiKey: arkKey,
		})
		this.model = process.env.VOLC_MODEL_TEXT || 'doubao-seed-2-0-lite-260215'
	}

	async generateJson<T>(system: string, user: string, maxTokens = 3000): Promise<T> {
		const completion = await this.client.chat.completions.create({
			model: this.model,
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: user },
			],
			temperature: 0.1,
			max_tokens: maxTokens,
			response_format: { type: 'json_object' },
		})
		const raw = completion.choices[0]?.message?.content
		if (!raw) throw new Error('审核模型没有返回内容')
		try {
			return JSON.parse(stripJsonFence(raw)) as T
		} catch {
			throw new Error('审核模型返回的 JSON 无法解析')
		}
	}
}

