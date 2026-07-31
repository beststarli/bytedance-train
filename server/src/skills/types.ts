import type OpenAI from 'openai'

export interface SkillContext {
	provider: 'deepseek'
	model: string
}

export interface ProductSkill<Input, Output> {
	id: string
	name: string
	version: string
	description: string
	provider: SkillContext['provider']
	modelEnv: string
	defaultModel: string
	validate(input: unknown): Input
	buildMessages(input: Input): OpenAI.Chat.ChatCompletionMessageParam[]
	parseOutput(raw: string): Output
}

export interface SkillExecution<Output> {
	skill: Pick<ProductSkill<unknown, Output>, 'id' | 'name' | 'version'>
	output: Output
}
