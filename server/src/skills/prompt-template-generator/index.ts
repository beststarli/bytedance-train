import type { ProductSkill } from '../types'

export type PromptTemplateCategory = 'writing' | 'image' | 'image_edit' | 'optimize'

export interface PromptTemplateGeneratorInput {
	category: PromptTemplateCategory
	requirement: string
}

export interface GeneratedPromptTemplate {
	title: string
	description: string
	content: string
}

const categoryInstructions: Record<PromptTemplateCategory, string> = {
	writing: '文章写作提示词：明确主题、读者、写作目标、结构、语气、篇幅、事实约束和输出格式。',
	image: '图片生成提示词：明确主体、场景、构图、镜头、风格、材质、色彩、光影、画幅和排除项。',
	image_edit: '图片修改提示词：明确参考图片、修改区域、保留内容、目标效果、构图、色彩、光影、画幅和排除项。',
	optimize: '内容优化提示词：明确原内容、优化目标、保留项、修改尺度、表达风格、检查维度和输出格式。',
}

const categories = new Set<PromptTemplateCategory>(['writing', 'image', 'image_edit', 'optimize'])

export const promptTemplateGeneratorSkill: ProductSkill<PromptTemplateGeneratorInput, GeneratedPromptTemplate> = {
	id: 'prompt-template-generator',
	name: '提示词架构师',
	version: '1.0.0',
	description: '把用户的简单创作需求扩写为结构完整、可复用且带变量占位符的提示词模板。',
	provider: 'deepseek',
	modelEnv: 'DEEPSEEK_MODEL',
	defaultModel: 'deepseek-chat',

	validate(input: unknown) {
		const value = input as Partial<PromptTemplateGeneratorInput>
		const category = String(value?.category || '') as PromptTemplateCategory
		const requirement = String(value?.requirement || '').trim()
		if (!categories.has(category)) throw new Error('请选择有效的提示词模板类别')
		if (requirement.length < 4) throw new Error('请至少输入 4 个字的生成需求')
		if (requirement.length > 2000) throw new Error('生成需求不能超过 2000 个字符')
		return { category, requirement }
	},

	buildMessages(input) {
		return [
			{
				role: 'system',
				content: `你正在执行“提示词架构师”Skill。你的职责不是完成用户的最终创作任务，而是把简单需求封装成可重复调用的中文提示词模板。

当前模板类型约束：
${categoryInstructions[input.category]}

工作流：
1. 识别最终任务、使用场景和预期结果。
2. 将用户已经提供的信息固化进模板。
3. 将缺失且每次可能变化的信息提取为花括号变量，例如 {文章主题}、{目标读者}。
4. 补齐角色、上下文、执行步骤、质量约束和输出格式。
5. 删除重复或不会改善输出质量的要求，保持模板可执行。

输出约束：
- 不得替用户直接完成最终任务。
- 不得捏造用户未提供的事实。
- content 必须可以直接交给另一个 AI 使用。
- 仅返回 JSON，不要使用 Markdown 代码块。
- JSON 结构必须是：
{"title":"简短模板名称","description":"一句话说明适用场景","content":"完整提示词模板"}。`,
			},
			{
				role: 'user',
				content: `请运行 Skill，将以下简单需求封装成完整提示词模板：\n${input.requirement}`,
			},
		]
	},

	parseOutput(raw) {
		let parsed: Partial<GeneratedPromptTemplate>
		try {
			parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, ''))
		} catch {
			throw new Error('Skill 返回格式无法解析，请重新生成')
		}
		const title = String(parsed.title || '').trim()
		const description = String(parsed.description || '').trim()
		const content = String(parsed.content || '').trim()
		if (!title || !content) throw new Error('Skill 返回的提示词模板不完整，请重新生成')
		return {
			title: title.slice(0, 80),
			description: description.slice(0, 240),
			content,
		}
	},
}
