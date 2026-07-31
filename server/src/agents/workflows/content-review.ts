import { AgentModelGateway } from '../core/model-gateway'
import type { AgentState, ReviewFinding, ReviewResult } from '../core/types'
import { WorkflowRunner } from '../core/workflow'
import { retrieveReviewPolicies } from '../tools/policy-retriever'

interface ReviewInput {
	title: string
	content: string
}

type ReviewState = AgentState<ReviewInput, ReviewResult>

interface ModelReview {
	decision?: string
	risk_score?: number
	quality_score?: number
	summary?: string
	findings?: Array<{
		category?: string
		severity?: string
		confidence?: number
		excerpt?: string
		reason?: string
		suggestion?: string
		replacement?: string
	}>
}

const highRiskRules = [
	{ category: 'privacy', severity: 'high' as const, pattern: /\b1[3-9]\d{9}\b/g, reason: '检测到可能的手机号码' },
	{ category: 'privacy', severity: 'critical' as const, pattern: /\b\d{17}[\dXx]\b/g, reason: '检测到可能的身份证号码' },
	{ category: 'gambling', severity: 'high' as const, pattern: /(赌博平台|线上博彩|赌场开户链接|代充赌博)/g, reason: '检测到赌博推广风险' },
	{ category: 'drugs', severity: 'critical' as const, pattern: /(出售毒品|购买毒品|冰毒交易|海洛因交易)/g, reason: '检测到毒品交易风险' },
	{ category: 'fraud', severity: 'high' as const, pattern: /(刷单返利|高额回报.*转账|内部渠道.*汇款)/g, reason: '检测到诈骗或非法引流风险' },
]

function normalizeText(value: string) {
	return value.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[ \t]+/g, ' ').trim()
}

function scanRules(text: string): ReviewFinding[] {
	const findings: ReviewFinding[] = []
	for (const rule of highRiskRules) {
		for (const match of text.matchAll(rule.pattern)) {
			findings.push({
				category: rule.category,
				severity: rule.severity,
				confidence: 1,
				excerpt: match[0],
				reason: rule.reason,
				suggestion: rule.category === 'privacy' ? '删除或脱敏该信息' : '删除相关推广、交易或引导内容',
			})
		}
	}
	return findings
}

function clamp(value: unknown, fallback: number) {
	const number = Number(value)
	return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback
}

function normalizeFinding(value: NonNullable<ModelReview['findings']>[number]): ReviewFinding | null {
	const reason = String(value.reason || '').trim()
	if (!reason) return null
	const severity = ['low', 'medium', 'high', 'critical'].includes(String(value.severity))
		? value.severity as ReviewFinding['severity']
		: 'medium'
	return {
		category: String(value.category || 'other').slice(0, 50),
		severity,
		confidence: Math.min(1, Math.max(0, Number(value.confidence) || 0)),
		excerpt: String(value.excerpt || '').slice(0, 500),
		reason: reason.slice(0, 1000),
		suggestion: String(value.suggestion || '请修改相关内容后重新提交审核').slice(0, 1000),
		...(String(value.replacement || '').trim() ? { replacement: String(value.replacement).trim().slice(0, 4000) } : {}),
	}
}

export async function runContentReviewWorkflow(state: ReviewState): Promise<ReviewResult> {
	const runner = new WorkflowRunner(state)
	await runner.start()
	try {
		const normalized = await runner.step('normalize_content', state.input, () => ({
			title: normalizeText(state.input.title),
			content: normalizeText(state.input.content),
		}))
		const ruleFindings = await runner.step('deterministic_rule_scan', normalized, () =>
			scanRules(`${normalized.title}\n${normalized.content}`),
		)
		const policies = await runner.step('retrieve_policy_context', {
			categories: ruleFindings.map((item) => item.category),
		}, () => retrieveReviewPolicies(
			`${normalized.title}\n${normalized.content}`,
			ruleFindings.map((item) => item.category),
		))
		const gateway = new AgentModelGateway()
		const modelReview = await runner.step('ai_safety_quality_review', {
			title: normalized.title,
			ruleFindings,
			policyCount: policies.length,
		}, () => gateway.generateJson<ModelReview>(
			`你是内容平台的安全与质量审核 Agent。必须结合上下文判断，不能只按关键词判定。

审核维度：政治与公共安全、色情低俗、赌博、毒品、暴力自残、仇恨歧视、诈骗非法交易、隐私个人信息、虚假信息、版权风险、标题党、广告引流和低质量内容。

要求：
1. 安全风险和内容质量分别评分，范围 0-100；risk_score 越高风险越大，quality_score 越高质量越好。
2. decision 只能是 approved、needs_revision 或 blocked。
3. 每个问题必须给出原文证据 excerpt、原因、修改建议和置信度。
4. 可以安全局部改写的问题给出 replacement；不得捏造原文没有的事实。
5. 明确违法交易、严重隐私泄露或极高风险内容可 blocked；可修改问题使用 needs_revision。
6. 仅返回 JSON：
{"decision":"approved","risk_score":0,"quality_score":80,"summary":"审核结论","findings":[{"category":"privacy","severity":"high","confidence":0.95,"excerpt":"原文片段","reason":"原因","suggestion":"建议","replacement":"可选替代内容"}]}`,
			`审核政策与案例上下文：${JSON.stringify(policies)}

确定性扫描结果：${JSON.stringify(ruleFindings)}

标题：${normalized.title}

正文：
${normalized.content}`,
		))
		const aiFindings = Array.isArray(modelReview.findings)
			? modelReview.findings.map(normalizeFinding).filter((item): item is ReviewFinding => !!item)
			: []
		const findings = [...ruleFindings, ...aiFindings]
		const hasCritical = findings.some((item) => item.severity === 'critical')
		const hasHigh = findings.some((item) => item.severity === 'high')
		let decision: ReviewResult['decision'] =
			modelReview.decision === 'blocked' ? 'blocked'
				: modelReview.decision === 'needs_revision' ? 'needs_revision'
					: 'approved'
		if (hasCritical) decision = 'blocked'
		else if (hasHigh && decision === 'approved') decision = 'needs_revision'
		const result: ReviewResult = {
			decision,
			riskScore: clamp(modelReview.risk_score, findings.length ? 65 : 5),
			qualityScore: clamp(modelReview.quality_score, 60),
			summary: String(modelReview.summary || (decision === 'approved' ? '内容审核通过' : '内容需要修改后重新审核')).slice(0, 2000),
			findings,
			modelVersion: gateway.model,
			raw: modelReview,
		}
		await runner.step('policy_decision', { findings }, () => result)
		await runner.complete(result)
		return result
	} catch (error) {
		await runner.fail(error)
		throw error
	}
}
