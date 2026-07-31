import OpenAI from 'openai'
import { promptTemplateGeneratorSkill } from './prompt-template-generator'
import type { ProductSkill, SkillExecution } from './types'

const skills = new Map<string, ProductSkill<any, any>>([
	[promptTemplateGeneratorSkill.id, promptTemplateGeneratorSkill],
])

function deepseekClient() {
	const apiKey = process.env.DEEPSEEK_API_KEY || ''
	if (!apiKey.trim()) throw new Error('Skill 模型服务未配置：请填写 DEEPSEEK_API_KEY')
	return new OpenAI({
		baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
		apiKey,
	})
}

export async function executeSkill<Input, Output>(
	skillId: string,
	rawInput: unknown,
): Promise<SkillExecution<Output>> {
	const skill = skills.get(skillId) as ProductSkill<Input, Output> | undefined
	if (!skill) throw new Error(`Skill 不存在：${skillId}`)
	const input = skill.validate(rawInput)

	const client = skill.provider === 'deepseek' ? deepseekClient() : null
	if (!client) throw new Error(`暂不支持 Skill 模型提供方：${skill.provider}`)

	const completion = await client.chat.completions.create({
		model: process.env[skill.modelEnv] || skill.defaultModel,
		messages: skill.buildMessages(input),
		temperature: 0.35,
		max_tokens: 1800,
		response_format: { type: 'json_object' },
	})
	const raw = completion.choices[0]?.message?.content?.trim()
	if (!raw) throw new Error(`${skill.name} Skill 未返回内容`)

	return {
		skill: { id: skill.id, name: skill.name, version: skill.version },
		output: skill.parseOutput(raw),
	}
}

export type {
	GeneratedPromptTemplate,
	PromptTemplateCategory,
	PromptTemplateGeneratorInput,
} from './prompt-template-generator'
